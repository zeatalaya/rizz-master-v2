import type { PlatformStats, AuthStep, DeviceIds } from "@rizz/shared";

export interface PlatformAdapter {
  fetchStats(token: string, extra?: Record<string, string>): Promise<PlatformStats>;
  validateToken(token: string, extra?: Record<string, string>): Promise<{ valid: boolean; name?: string; error?: string }>;
}

export interface PlatformAuthAdapter {
  sendCode(phone: string, ids: DeviceIds): Promise<AuthStep>;
  verifyCode(phone: string, otp: string, refreshToken: string, ids: DeviceIds): Promise<AuthStep>;
}
