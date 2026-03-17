/**
 * Hinge auth adapter.
 * REST-based OTP via /auth/sms/v2 endpoints.
 */

import { randomUUID } from "crypto";
import type { DeviceIds, AuthStep } from "@rizz/shared";
import type { PlatformAuthAdapter } from "../types";

const HINGE_API = "https://prod-api.hingeaws.net";

function hingeHeaders(ids: DeviceIds): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "User-Agent": "Hinge/9.0.0 (Android; 13)",
    "x-device-platform": "android",
    "x-device-id": ids.deviceId,
    "x-install-id": ids.installId,
  };
}

export function generateHingeDeviceIds(): DeviceIds {
  return {
    deviceId: randomUUID(),
    appSessionId: randomUUID(),
    installId: randomUUID(),
    funnelSessionId: randomUUID(),
  };
}

async function sendHingeCode(phone: string, ids: DeviceIds): Promise<AuthStep> {
  try {
    const cleanPhone = phone.replace(/\D/g, "");
    const res = await fetch(`${HINGE_API}/auth/sms/v2/initiate`, {
      method: "POST",
      headers: hingeHeaders(ids),
      body: JSON.stringify({
        phone: cleanPhone,
        deviceId: ids.deviceId,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { step: "error", message: `Hinge send-code ${res.status}: ${text}` };
    }

    return {
      step: "otp_sent",
      refreshToken: "",
      phone: cleanPhone,
      otpLength: 6,
      smsSent: true,
    };
  } catch (err) {
    return { step: "error", message: `Hinge auth failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function verifyHingeCode(phone: string, otp: string, _refreshToken: string, ids: DeviceIds): Promise<AuthStep> {
  try {
    const cleanPhone = phone.replace(/\D/g, "");
    const res = await fetch(`${HINGE_API}/auth/sms/v2`, {
      method: "POST",
      headers: hingeHeaders(ids),
      body: JSON.stringify({
        phone: cleanPhone,
        otp,
        deviceId: ids.deviceId,
        installId: ids.installId,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { step: "error", message: `Hinge verify ${res.status}: ${text}` };
    }

    const data = await res.json();

    if (!data.token) {
      return { step: "error", message: "Hinge: No token in verify response" };
    }

    return {
      step: "login_success",
      authToken: data.token,
      refreshToken: "",
      userId: data.playerId || data.userId || "",
    };
  } catch (err) {
    return { step: "error", message: `Hinge verify failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export const hingeAuthAdapter: PlatformAuthAdapter = {
  sendCode: sendHingeCode,
  verifyCode: verifyHingeCode,
};

export async function validateHingeToken(token: string, extra?: Record<string, string>): Promise<{ valid: boolean; name?: string; error?: string }> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "Hinge/9.0.0 (Android; 13)",
      "Authorization": `Bearer ${token}`,
      "x-device-platform": "android",
    };
    if (extra?.sessionId) headers["x-session-id"] = extra.sessionId;
    if (extra?.deviceId) headers["x-device-id"] = extra.deviceId;

    const res = await fetch(`${HINGE_API}/user/v2/public`, { headers });
    if (!res.ok) return { valid: false, error: `Invalid token (${res.status})` };
    const data = await res.json();
    return { valid: true, name: data?.firstName || data?.name || "User" };
  } catch {
    return { valid: false, error: "Connection failed" };
  }
}
