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
    };
  }

  interface User {
    id: string;
    isSuperAdmin?: boolean;
    organizationId?: string | null;
    organizationSlug?: string | null;
    role?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    isSuperAdmin?: boolean;
    organizationId?: string | null;
    organizationSlug?: string | null;
    role?: string | null;
  }
}
