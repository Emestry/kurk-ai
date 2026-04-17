import type { auth } from "./auth.js";
import type { UserRole } from "@/generated/prisma/enums.js";

export interface HonoEnv {
  Variables: {
    user: typeof auth.$Infer.Session.user & { role?: UserRole };
    session: typeof auth.$Infer.Session.session;
    roomDeviceSession: {
      id: string;
      roomId: string;
      roomDeviceId: string;
      token: string;
      expiresAt: Date;
      revokedAt: Date | null;
    };
  };
}
