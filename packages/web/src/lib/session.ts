/**
 * TEE-style encrypted session management.
 * Multi-platform: stores authToken + platform instead of tinderToken.
 */

import { getIronSession, IronSession } from "iron-session";
import { cookies } from "next/headers";
import type { Platform } from "@rizz/shared";

export interface SessionData {
  authToken?: string;
  platform?: Platform;
  refreshToken?: string;
  phone?: string;
  email?: string;
  userName?: string;
  verifiedAt?: string;
  deviceId?: string;
  appSessionId?: string;
  installId?: string;
  funnelSessionId?: string;
  // Hinge-specific
  sessionId?: string;
}

const SESSION_OPTIONS = {
  password:
    process.env.SESSION_SECRET ||
    "TEE-rizz-master-v2-32char-secret-key!!!!!",
  cookieName: "rizz_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24, // 24 hours
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, SESSION_OPTIONS);
}
