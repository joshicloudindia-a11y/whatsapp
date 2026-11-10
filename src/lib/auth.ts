import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { resolveAdminRole, ROLE_SELECT } from "@/lib/admin-roles";
import {
  OTP_MAX_ATTEMPTS,
  audit,
  ipIsThrottled,
  registerFailedLogin,
  safeEqualHex,
  secretHash,
} from "@/lib/admin-auth";
import { IMPERSONATION_MAX_MS, activeSuperAdmin, verifyToken } from "@/lib/impersonation";

type HeaderBag = Record<string, string | string[] | undefined> | undefined;

function ipFromReq(req: { headers?: HeaderBag } | undefined): string | null {
  const h = req?.headers ?? {};
  const raw = h["x-forwarded-for"] ?? h["x-real-ip"];
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v ? v.split(",")[0].trim() : null;
}

function uaFromReq(req: { headers?: HeaderBag } | undefined): string | null {
  const v = req?.headers?.["user-agent"];
  return (Array.isArray(v) ? v[0] : v) ?? null;
}

const userInclude = {
  memberships: {
    where: { isActive: true },
    include: { organization: true },
    take: 1,
  },
} as const;

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    // ── Regular app login ────────────────────────────────────────────────────
    CredentialsProvider({
      id: "credentials",
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
          include: userInclude,
        });

        if (!user || !user.passwordHash || !user.isActive) return null;
        if (user.lockedUntil && user.lockedUntil > new Date()) return null;

        const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!isValid) {
          await registerFailedLogin(user.id);
          return null;
        }

        if (user.failedLoginAttempts > 0 || user.lockedUntil) {
          await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
        }

        const membership = user.memberships[0];
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatar,
          // Shows the "Admin panel" link; real access still requires /admin/login.
          isSuperAdmin: !!(user.adminRoleId || user.adminRole || user.isSuperAdmin),
          organizationId: membership?.organizationId ?? null,
          organizationSlug: membership?.organization?.slug ?? null,
          role: membership?.role ?? null,
          adminRole: null,
          adminAuthAt: null,
        };
      },
    }),

    // ── Super admin panel login (step 2: email OTP) ──────────────────────────
    // Step 1 (password check + OTP email) lives in /api/admin-auth/login.
    CredentialsProvider({
      id: "admin-otp",
      name: "admin-otp",
      credentials: {
        challenge: { label: "Challenge", type: "text" },
        code: { label: "Code", type: "text" },
      },
      async authorize(credentials, req) {
        const ip = ipFromReq(req as { headers?: HeaderBag });
        const userAgent = uaFromReq(req as { headers?: HeaderBag });
        const challengeToken = credentials?.challenge?.trim();
        const code = credentials?.code?.replace(/\D/g, "");
        if (!challengeToken || !code || code.length !== 6) return null;
        if (await ipIsThrottled(ip)) return null;

        const challenge = await prisma.adminLoginChallenge.findUnique({
          where: { tokenHash: secretHash(challengeToken) },
          include: { user: { include: { ...userInclude, adminRoleDef: { select: ROLE_SELECT } } } },
        });

        if (!challenge || challenge.usedAt || challenge.expiresAt < new Date() || challenge.attempts >= OTP_MAX_ATTEMPTS) {
          await audit(null, "admin.otp.failed", { ip, userAgent, metadata: { reason: "invalid_or_expired_challenge" } });
          return null;
        }

        const user = challenge.user;
        const role = await resolveAdminRole(user);
        const meta = { ip, userAgent, actorId: user.id, actorEmail: user.email };

        if (!user.isActive || !role || (user.lockedUntil && user.lockedUntil > new Date())) {
          await audit(null, "admin.otp.failed", { ...meta, metadata: { reason: "account_unavailable" } });
          return null;
        }

        if (!safeEqualHex(secretHash(`${challenge.id}:${code}`), challenge.codeHash)) {
          await prisma.adminLoginChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
          const locked = await registerFailedLogin(user.id);
          await audit(null, "admin.otp.failed", { ...meta, metadata: { reason: "wrong_code", locked } });
          return null;
        }

        const now = new Date();
        await prisma.$transaction([
          prisma.adminLoginChallenge.update({ where: { id: challenge.id }, data: { usedAt: now } }),
          prisma.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: now, lastLoginIp: ip },
          }),
        ]);
        await audit(null, "admin.login.success", { ...meta, metadata: { role: role.name } });

        const membership = user.memberships[0];
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatar,
          isSuperAdmin: role.key === "SUPER_ADMIN",
          organizationId: membership?.organizationId ?? null,
          organizationSlug: membership?.organization?.slug ?? null,
          role: membership?.role ?? null,
          adminRole: role.key,
          adminAuthAt: now.getTime(),
        };
      },
    }),

    // ── "Login as user": Super Admin enters a user's account (ticket from /api/admin/users/[id]/impersonate) ──
    CredentialsProvider({
      id: "impersonate",
      name: "impersonate",
      credentials: { ticket: { label: "Ticket", type: "text" } },
      async authorize(credentials, req) {
        const t = verifyToken<{ a: string; t: string; aa: number }>("imp", credentials?.ticket);
        if (!t) return null;
        const admin = await activeSuperAdmin(t.a, t.aa);
        if (!admin) return null;
        const user = await prisma.user.findUnique({
          where: { id: t.t },
          include: { ...userInclude, adminRoleDef: { select: ROLE_SELECT } },
        });
        if (!user || !user.isActive || user.id === admin.id) return null;
        if ((await resolveAdminRole(user))?.key === "SUPER_ADMIN") return null;

        const now = Date.now();
        await audit(null, "user.impersonate.start", {
          ip: ipFromReq(req as { headers?: HeaderBag }), userAgent: uaFromReq(req as { headers?: HeaderBag }),
          actorId: admin.id, actorEmail: admin.email, entity: "User", entityId: user.id, metadata: { target: user.email },
        });
        const membership = user.memberships[0];
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatar,
          isSuperAdmin: false, // never carries admin powers into the user's session
          organizationId: membership?.organizationId ?? null,
          organizationSlug: membership?.organization?.slug ?? null,
          role: membership?.role ?? null,
          adminRole: null,
          adminAuthAt: null,
          impersonator: { id: admin.id, email: admin.email, name: admin.name, adminAuthAt: t.aa, startedAt: now, expiresAt: now + IMPERSONATION_MAX_MS },
        };
      },
    }),

    // ── Exit "Login as user": restores the Super Admin's own admin session ──
    CredentialsProvider({
      id: "impersonate-return",
      name: "impersonate-return",
      credentials: { ticket: { label: "Ticket", type: "text" } },
      async authorize(credentials, req) {
        const t = verifyToken<{ a: string; t: string; aa: number }>("ret", credentials?.ticket);
        if (!t) return null;
        const admin = await activeSuperAdmin(t.a, t.aa);
        if (!admin) return null;
        await audit(null, "user.impersonate.end", {
          ip: ipFromReq(req as { headers?: HeaderBag }), userAgent: uaFromReq(req as { headers?: HeaderBag }),
          actorId: admin.id, actorEmail: admin.email, entity: "User", entityId: t.t,
        });
        const membership = admin.memberships[0];
        return {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          image: admin.avatar,
          isSuperAdmin: true,
          organizationId: membership?.organizationId ?? null,
          organizationSlug: membership?.organization?.slug ?? null,
          role: membership?.role ?? null,
          adminRole: "SUPER_ADMIN",
          adminAuthAt: t.aa, // keeps the original 8h admin session window
          impersonator: null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
        token.isSuperAdmin = user.isSuperAdmin;
        token.organizationId = user.organizationId;
        token.organizationSlug = user.organizationSlug;
        token.role = user.role;
        token.adminRole = user.adminRole ?? null;
        token.adminAuthAt = user.adminAuthAt ?? null;
        token.impersonator = user.impersonator ?? null;
      }
      if (trigger === "update" && session) {
        if (session.name) token.name = session.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.name = token.name as string;
        session.user.isSuperAdmin = token.isSuperAdmin as boolean;
        session.user.organizationId = token.organizationId as string;
        session.user.organizationSlug = token.organizationSlug as string;
        session.user.role = token.role as string;
        session.user.adminRole = token.adminRole ?? null;
        session.user.adminAuthAt = token.adminAuthAt ?? null;
        session.user.impersonator = token.impersonator
          ? { name: token.impersonator.name, email: token.impersonator.email, expiresAt: token.impersonator.expiresAt }
          : null;
      }
      return session;
    },
  },
};
