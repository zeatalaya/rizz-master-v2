/**
 * Bumble auth adapter.
 * Uses Badoo protocol via mwebapi.phtml with MD5 signing.
 * Updated March 2026 — correct message types: 678 (submit phone) and 680 (check PIN).
 */

import { createHash } from "crypto";
import type { DeviceIds, AuthStep } from "@rizz/shared";
import type { PlatformAuthAdapter } from "../types";
import { proxiedFetch } from "../../proxy";

const BUMBLE_API = "https://bumble.com/mwebapi.phtml";
const SIGNING_SECRET = "whitetelevisionbulbelectionroofhorseflying";

function signBody(body: string): string {
  return createHash("md5").update(body + SIGNING_SECRET).digest("hex");
}

function bumbleHeaders(bodyStr: string, messageType: number, sessionCookie?: string): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
    "X-Pingback": signBody(bodyStr),
    "X-Message-type": String(messageType),
    "x-use-session-cookie": "1",
    "Origin": "https://bumble.com",
    "Referer": "https://bumble.com/get-started",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
  };
  if (sessionCookie) {
    h["Cookie"] = `session=${sessionCookie}; session_cookie_name=session`;
  }
  return h;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function bumblePost(body: Record<string, unknown>, messageType: number, sessionCookie?: string, proxyOpts?: { sessionId?: string; phone?: string }): Promise<{ json: any; setCookie?: string }> {
  const bodyStr = JSON.stringify(body);
  const headers = bumbleHeaders(bodyStr, messageType, sessionCookie);

  const res = await proxiedFetch(BUMBLE_API, {
    method: "POST",
    headers,
    body: bodyStr,
  }, proxyOpts);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bumble API ${res.status}: ${text}`);
  }

  // Capture session cookie from response
  const setCookie = res.headers.get("set-cookie") || undefined;
  const json = await res.json();
  return { json, setCookie };
}

function makeMessage(messageType: number, data: Record<string, unknown>) {
  return {
    body: [{ message_type: messageType, ...data }],
    message_type: messageType,
    version: 1,
    is_background: false,
    "$gpb": "badoo.bma.BadooMessage",
  };
}

async function sendBumbleCode(phone: string, ids: DeviceIds): Promise<AuthStep> {
  try {
    const cleanPhone = phone.replace(/\D/g, "");
    const proxyOpts = { sessionId: ids.deviceId, phone: cleanPhone };

    // Step 1: App startup to get initial session
    const startupMsg = makeMessage(2, {
      server_app_startup: {
        app_build: "MoxieWebapp",
        app_name: "moxie",
        app_version: "1.0.0",
        can_send_sms: false,
        user_agent: "Mozilla/5.0",
        screen_width: 375,
        screen_height: 812,
        language: 0,
        is_cold_start: true,
        app_platform_type: 5,
        app_product_type: 400,
        supported_features: [362],
        supported_minor_features: [],
        supported_notifications: [],
        dev_features: [],
        first_launch: true,
      },
    });
    const startupResp = await bumblePost(startupMsg, 2, undefined, proxyOpts);
    console.log("[bumble-auth] Startup done, got session cookie:", !!startupResp.setCookie);

    // Extract session cookie
    let sessionCookie = "";
    if (startupResp.setCookie) {
      const match = startupResp.setCookie.match(/session=([^;]+)/);
      if (match) sessionCookie = match[1];
    }

    // Step 2: Submit phone number (message type 678)
    const phoneMsg = makeMessage(678, {
      server_submit_phone_number: {
        phone: cleanPhone.startsWith("+") ? cleanPhone : `+${cleanPhone}`,
      },
    });
    const phoneResp = await bumblePost(phoneMsg, 678, sessionCookie, proxyOpts);
    const phoneBody = phoneResp.json?.body?.[0];
    console.log("[bumble-auth] Phone submit response type:", phoneBody?.message_type, "error:", phoneBody?.error_code);

    if (phoneBody?.error_code && phoneBody.error_code !== 0) {
      return { step: "error", message: `Bumble error: ${phoneBody.error_message || `code ${phoneBody.error_code}`}` };
    }

    return {
      step: "otp_sent",
      refreshToken: sessionCookie, // Store session cookie for verify step
      phone: cleanPhone,
      otpLength: 6,
      smsSent: true,
    };
  } catch (err) {
    return { step: "error", message: `Bumble auth failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function verifyBumbleCode(phone: string, otp: string, refreshToken: string, ids: DeviceIds): Promise<AuthStep> {
  try {
    const cleanPhone = phone.replace(/\D/g, "");
    const proxyOpts = { sessionId: ids.deviceId, phone: cleanPhone };
    const sessionCookie = refreshToken; // Session cookie stored from send step

    // Step 3: Check phone PIN (message type 680)
    const pinMsg = makeMessage(680, {
      server_check_phone_pin: {
        pin: otp,
      },
    });
    const pinResp = await bumblePost(pinMsg, 680, sessionCookie, proxyOpts);
    const pinBody = pinResp.json?.body?.[0];
    console.log("[bumble-auth] PIN check response type:", pinBody?.message_type, "error:", pinBody?.error_code);

    if (pinBody?.error_code && pinBody.error_code !== 0) {
      return { step: "error", message: `Bumble verify error: ${pinBody.error_message || `code ${pinBody.error_code}`}` };
    }

    // Extract session from response — could be in cookie or body
    let finalSession = sessionCookie;
    if (pinResp.setCookie) {
      const match = pinResp.setCookie.match(/session=([^;]+)/);
      if (match) finalSession = match[1];
    }
    const accessToken = pinBody?.access_token || pinBody?.session_id || finalSession;

    if (!accessToken) {
      const keys = pinBody ? Object.keys(pinBody).join(",") : "empty";
      return { step: "error", message: `Bumble: No session token. Response keys: ${keys}` };
    }

    return {
      step: "login_success",
      authToken: accessToken,
      refreshToken: "",
      userId: pinBody?.user_id || "",
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
    const msg = makeMessage(403, {});
    const resp = await bumblePost(msg, 403, token, { sessionId: "validate" });
    const body = resp.json?.body?.[0];

    if (body?.error_code && body.error_code !== 0) {
      return { valid: false, error: `Invalid session (${body.error_code})` };
    }

    const name = body?.client_user?.name || body?.user?.name || "User";
    return { valid: true, name };
  } catch {
    return { valid: false, error: "Connection failed" };
  }
}
