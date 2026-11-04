import "next-auth";
import "next-auth/jwt";

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
  }
}
