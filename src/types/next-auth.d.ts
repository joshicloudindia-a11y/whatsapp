import "next-auth";
import "next-auth/jwt";

/** Set while a Super Admin is signed in as another user ("Login as user"). */
interface Impersonator {
  id: string;
  email: string;
  name: string | null;
  /** The Super Admin's own OTP login time, restored when they exit. */
  adminAuthAt: number;
  startedAt: number;
  expiresAt: number;
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      isSuperAdmin: boolean;
      organizationId: string;
      organizationSlug: string;
      role: string;
      /** Set only when signed in through /admin/login (OTP verified). */
      adminRole: string | null;
      /** Epoch ms of the admin OTP login; admin panel session expires 8h after this. */
      adminAuthAt: number | null;
      impersonator: { name: string | null; email: string; expiresAt: number } | null;
    };
  }

  interface User {
    id: string;
    isSuperAdmin?: boolean;
    organizationId?: string | null;
    organizationSlug?: string | null;
    role?: string | null;
    adminRole?: string | null;
    adminAuthAt?: number | null;
    impersonator?: Impersonator | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    isSuperAdmin?: boolean;
    organizationId?: string | null;
    organizationSlug?: string | null;
    role?: string | null;
    adminRole?: string | null;
    adminAuthAt?: number | null;
    impersonator?: Impersonator | null;
  }
}
