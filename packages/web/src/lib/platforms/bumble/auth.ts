/**
 * Bumble auth adapter.
 * Uses JSON-RPC-like protocol via mwebapi.phtml with MD5 signing.
 */

import { createHash } from "crypto";
import type { DeviceIds, AuthStep } from "@rizz/shared";
import type { PlatformAuthAdapter } from "../types";

const BUMBLE_API = "https://bumble.com/mwebapi.phtml";
const SIGNING_SECRET = "whitetelevisionbulbelectionroofhorseflying";

function signBody(body: string): string {
  return createHash("md5").update(body + SIGNING_SECRET).digest("hex");
}

function bumbleMessage(messageType: number, messageData: Record<string, unknown>) {
  return {
    body: [
      {
        message_type: messageType,
        server_app_startup: messageType === 2 ? messageData : undefined,
        ...messageData,
      },
    ],
    message_type: messageType,
    version: 1,
    is_background: false,
    "$gpb": "badoo.bma.BadooMessage",
  };
}

async function bumblePost(body: Record<string, unknown>, sessionCookie?: string): Promise<unknown> {
  const bodyStr = JSON.stringify(body);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    "X-Pingback": signBody(bodyStr),
  };
  if (sessionCookie) {
    headers["Cookie"] = `session=${sessionCookie}`;
  }

  const res = await fetch(BUMBLE_API, {
    method: "POST",
    headers,
    body: bodyStr,
  });

  if (!res.ok) {
    throw new Error(`Bumble API ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

async function sendBumbleCode(phone: string, _ids: DeviceIds): Promise<AuthStep> {
  try {
    // Step 1: App startup to get initial session
    await bumblePost(bumbleMessage(2, {
      app_build: "MoxieWebapp",
      app_name: "mwebapi",
      app_version: "1.0.0",
      can_send_sms: false,
      user_agent: "Mozilla/5.0",
      screen_width: 375,
      screen_height: 812,
      language: 0,
      is_cold_start: true,
      supported_features: [362],
      supported_minor_features: [],
      supported_notifications: [],
      dev_features: [],
      first_launch: true,
    }));

    // Step 2: Send phone number for OTP
    const cleanPhone = phone.replace(/\D/g, "");
    const msg = bumbleMessage(15, {
      phone_number: cleanPhone,
      screen_context: { screen: 10 },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resp = await bumblePost(msg) as any;

    // Check for errors in response
    const body = resp?.body?.[0];
    if (body?.error_code && body.error_code !== 0) {
      return { step: "error", message: `Bumble error: ${body.error_message || `code ${body.error_code}`}` };
    }

    return {
      step: "otp_sent",
      refreshToken: "",
      phone: cleanPhone,
      otpLength: 6,
      smsSent: true,
    };
  } catch (err) {
    return { step: "error", message: `Bumble auth failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function verifyBumbleCode(phone: string, otp: string, _refreshToken: string, _ids: DeviceIds): Promise<AuthStep> {
  try {
    const cleanPhone = phone.replace(/\D/g, "");
    const msg = bumbleMessage(16, {
      phone_number: cleanPhone,
      verification_code: otp,
      screen_context: { screen: 11 },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resp = await bumblePost(msg) as any;
    const body = resp?.body?.[0];

    if (body?.error_code && body.error_code !== 0) {
      return { step: "error", message: `Bumble verify error: ${body.error_message || `code ${body.error_code}`}` };
    }

    // Extract session from response or cookies
    const sessionToken = body?.access_token || body?.session_id || "";

    if (!sessionToken) {
      return { step: "error", message: "Bumble: No session token in verify response" };
    }

    return {
      step: "login_success",
      authToken: sessionToken,
      refreshToken: "",
      userId: body?.user_id || "",
    };
  } catch (err) {
    return { step: "error", message: `Bumble verify failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export const bumbleAuthAdapter: PlatformAuthAdapter = {
  sendCode: sendBumbleCode,
  verifyCode: verifyBumbleCode,
};

export async function validateBumbleToken(token: string): Promise<{ valid: boolean; name?: string; error?: string }> {
  try {
    const msg = bumbleMessage(403, {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resp = await bumblePost(msg, token) as any;
    const body = resp?.body?.[0];

    if (body?.error_code && body.error_code !== 0) {
      return { valid: false, error: `Invalid session (${body.error_code})` };
    }

    const name = body?.client_user?.name || body?.user?.name || "User";
    return { valid: true, name };
  } catch {
    return { valid: false, error: "Connection failed" };
  }
}
