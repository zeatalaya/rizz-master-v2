/**
 * Tinder v3 protobuf auth adapter.
 * Ported from v1 — unchanged protocol.
 */

import protobuf from "protobufjs";
import protoJson from "./tinder-proto.json";
import { randomUUID } from "crypto";
import type { DeviceIds, AuthStep } from "@rizz/shared";
import type { PlatformAuthAdapter } from "../types";

const AUTH_URL = "https://api.gotinder.com/v3/auth/login";

const root = protobuf.Root.fromJSON(protoJson);
const AuthGatewayRequest = root.lookupType("AuthGatewayRequest");
const AuthGatewayResponse = root.lookupType("AuthGatewayResponse");

export function generateDeviceIds(): DeviceIds {
  return {
    deviceId: randomUUID().replace(/-/g, "").slice(0, 16),
    appSessionId: randomUUID(),
    installId: Buffer.from(randomUUID()).toString("base64").slice(0, 22),
    funnelSessionId: randomUUID(),
  };
}

function getHeaders(ids: DeviceIds): Record<string, string> {
  return {
    "user-agent": "Tinder Android Version 15.20.0",
    "app-version": "5200",
    "platform": "android",
    "platform-variant": "Google-Play",
    "os-version": "34",
    "tinder-version": "15.20.0",
    "store-variant": "Play-Store",
    "x-supported-image-formats": "webp",
    "accept-language": "en-US",
    "accept-encoding": "gzip",
    "content-type": "application/x-google-protobuf",
    "persistent-device-id": ids.deviceId,
    "app-session-id": ids.appSessionId,
    "install-id": ids.installId,
    "app-session-time-elapsed": (Math.random() * 2 + 0.5).toFixed(3),
    "funnel-session-id": ids.funnelSessionId,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrapValue(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "object") {
    if (typeof obj.toJSON === "function") {
      const json = obj.toJSON();
      if (json && typeof json === "object" && "value" in json) return json.value;
      return json;
    }
    if ("value" in obj) return obj.value;
  }
  return obj;
}

async function sendAuthRequest(payload: Record<string, unknown>, ids: DeviceIds, phone?: string): Promise<AuthStep> {
  const errMsg = AuthGatewayRequest.verify(payload);
  if (errMsg) return { step: "error", message: `Proto verify: ${errMsg}` };

  const message = AuthGatewayRequest.create(payload);
  const encoded = AuthGatewayRequest.encode(message).finish();
  const buffer = Buffer.from(encoded);

  let dispatcher: unknown | undefined;
  if (phone) {
    try {
      const { getProxyDispatcher } = await import("../../proxy");
      dispatcher = await getProxyDispatcher(ids.deviceId, phone);
      console.log(`[tinder-auth] Proxy dispatcher: ${dispatcher ? "YES" : "NO"}, phone=${phone}, deviceId=${ids.deviceId}`);
    } catch (e) {
      console.warn("[tinder-auth] Failed to get proxy dispatcher:", e);
    }
  }

  let res!: Response;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetchInit: any = {
      method: "POST",
      headers: {
        ...getHeaders(ids),
        "content-length": String(buffer.length),
      },
      body: buffer,
    };
    if (dispatcher) {
      fetchInit.dispatcher = dispatcher;
      const undici = await import("undici");
      // Try proxy up to 2 times, then fall back to direct
      let proxyOk = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          res = await undici.fetch(AUTH_URL, fetchInit) as unknown as Response;
          proxyOk = true;
          break;
        } catch (proxyErr) {
          console.warn(`[tinder-auth] Proxy attempt ${attempt + 1}/2 failed:`, proxyErr instanceof Error ? proxyErr.message : proxyErr);
          if (attempt < 1) await new Promise(r => setTimeout(r, 1000));
        }
      }
      if (!proxyOk) {
        // Fall back to direct connection — better to try without proxy than fail entirely
        console.warn("[tinder-auth] Proxy failed 5 times, falling back to direct connection");
        try {
          res = await fetch(AUTH_URL, {
            method: "POST",
            headers: {
              ...getHeaders(ids),
              "content-length": String(buffer.length),
            },
            body: buffer,
          });
        } catch (directErr) {
          const msg = directErr instanceof Error ? directErr.message : String(directErr);
          return { step: "error", message: `Proxy and direct connection both failed: ${msg}` };
        }
      }
    } else {
      res = await fetch(AUTH_URL, fetchInit);
    }
  } catch (fetchErr: unknown) {
    const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    return { step: "error", message: `Tinder fetch failed: ${msg}` };
  }

  let respBuffer: Buffer;
  try {
    respBuffer = Buffer.from(await res.arrayBuffer());
  } catch (readErr: unknown) {
    const msg = readErr instanceof Error ? readErr.message : String(readErr);
    return { step: "error", message: `Failed to read Tinder response body (HTTP ${res.status}): ${msg}` };
  }

  if (respBuffer.length === 0) {
    return { step: "error", message: `Empty response from Tinder (HTTP ${res.status})` };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let decoded: any;
  try {
    decoded = AuthGatewayResponse.decode(respBuffer);
  } catch (decodeErr: unknown) {
    const msg = decodeErr instanceof Error ? decodeErr.message : String(decodeErr);
    const hexPreview = respBuffer.slice(0, 64).toString("hex");
    const textPreview = respBuffer.slice(0, 128).toString("utf8").replace(/[^\x20-\x7E]/g, ".");
    return {
      step: "error",
      message: `Protobuf decode failed (HTTP ${res.status}, ${respBuffer.length} bytes): ${msg}. Hex: ${hexPreview}. Text: ${textPreview}`,
    };
  }

  if (decoded.error && decoded.error.code && decoded.error.code !== 0) {
    const protoMsg = decoded.error.message || "";
    return {
      step: "error",
      message: `Tinder auth error code=${decoded.error.code}: ${protoMsg || "no message"}`,
    };
  }

  if (!res.ok) {
    const dataField = decoded.data || "none";
    return {
      step: "error",
      message: `Tinder HTTP ${res.status} but no protobuf error field. Response data oneof: ${dataField}`,
    };
  }

  const resp = decoded;

  if (resp.validatePhoneOtpState) {
    const s = resp.validatePhoneOtpState;
    const rt = unwrapValue(s.refreshToken);
    const rawSmsSent = unwrapValue(s.smsSent);
    return {
      step: "otp_sent",
      refreshToken: rt || "",
      phone: s.phone || "",
      otpLength: unwrapValue(s.otpLength) || 6,
      smsSent: rawSmsSent === true,
    };
  }

  if (resp.validateEmailOtpState) {
    const s = resp.validateEmailOtpState;
    return {
      step: "email_required",
      refreshToken: unwrapValue(s.refreshToken) || "",
      email: s.maskedEmail || s.unmaskedEmail || "",
      otpLength: unwrapValue(s.otpLength) || 6,
    };
  }

  if (resp.loginResult) {
    const r = resp.loginResult;
    return {
      step: "login_success",
      authToken: r.authToken || "",
      refreshToken: r.refreshToken || "",
      userId: r.userId || "",
    };
  }

  if (resp.captchaState) {
    return { step: "captcha_required", referenceToken: resp.captchaState.referenceToken || "" };
  }

  if (resp.validateGoogleState) {
    const s = resp.validateGoogleState;
    return { step: "google_needs_email", refreshToken: unwrapValue(s.refreshToken) || "", email: s.maskedEmail || "" };
  }

  if (resp.googleAccountNotFound) {
    const s = resp.googleAccountNotFound;
    return { step: "google_no_account", refreshToken: unwrapValue(s.refreshToken) || "", email: s.maskedEmail || "" };
  }

  if (resp.getPhoneState) {
    return {
      step: "otp_sent",
      refreshToken: unwrapValue(resp.getPhoneState.refreshToken) || "",
      phone: "",
      otpLength: 6,
      smsSent: false,
    };
  }

  return { step: "error", message: "Unexpected auth response state" };
}

export async function sendPhoneCode(phone: string, ids: DeviceIds): Promise<AuthStep> {
  const result = await sendAuthRequest({ phone: { phone } }, ids, phone);
  console.log(`[tinder-auth] sendPhoneCode v3 result: step=${result.step}, smsSent=${(result as any).smsSent}, refreshToken=${(result as any).refreshToken ? "yes" : "empty"}`);

  // If v3 says sent but smsSent is false, or if it errors, try v2 REST as fallback
  if (result.step === "otp_sent" && (result as any).smsSent === false) {
    console.log("[tinder-auth] v3 smsSent=false, trying v2 REST fallback for send-code...");
    return sendPhoneCodeV2(phone, ids);
  }
  if (result.step === "error") {
    console.log("[tinder-auth] v3 send-code failed, trying v2 REST fallback...");
    return sendPhoneCodeV2(phone, ids);
  }
  return result;
}

async function sendPhoneCodeV2(phone: string, ids: DeviceIds): Promise<AuthStep> {
  const { proxiedFetch } = await import("../../proxy");
  try {
    const res = await proxiedFetch(
      "https://api.gotinder.com/v2/auth/sms/send?auth_type=sms",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Tinder Android Version 15.20.0",
          "app-version": "5200",
          "platform": "android",
          "os-version": "34",
          "persistent-device-id": ids.deviceId,
          "install-id": ids.installId,
          "app-session-id": ids.appSessionId,
        },
        body: JSON.stringify({ phone_number: phone }),
      },
      { sessionId: ids.deviceId, phone }
    );
    const data = await res.json();
    console.log("[tinder-auth] v2 send-code response:", JSON.stringify(data));
    if (data?.data?.sms_sent) {
      return { step: "otp_sent", refreshToken: "", phone, otpLength: 6, smsSent: true };
    }
    return { step: "error", message: `v2 send-code: sms_sent=${data?.data?.sms_sent}, full=${JSON.stringify(data)}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { step: "error", message: `v2 send-code failed: ${msg}` };
  }
}

export async function verifyPhoneOtp(phone: string, otp: string, refreshToken: string, ids: DeviceIds): Promise<AuthStep> {
  console.log(`[tinder-auth] verifyPhoneOtp: phone=${phone}, otp=${otp}, hasRT=${!!refreshToken}, rtLen=${refreshToken?.length}, deviceId=${ids.deviceId}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const phoneOtp: any = { phone: { value: phone }, otp };
  // Only include refreshToken if we actually have one (empty wrapper causes 40120)
  if (refreshToken) phoneOtp.refreshToken = { value: refreshToken };
  const result = await sendAuthRequest({ phoneOtp }, ids, phone);

  // If v3 protobuf fails, try v2 REST API as fallback
  if (result.step === "error" && (result.message.includes("41201") || result.message.includes("40120"))) {
    console.log(`[tinder-auth] v3 protobuf failed, trying v2 REST fallback...`);
    return verifyPhoneOtpV2(phone, otp, refreshToken, ids);
  }
  return result;
}

async function verifyPhoneOtpV2(phone: string, otp: string, _refreshToken: string, ids: DeviceIds): Promise<AuthStep> {
  const { proxiedFetch } = await import("../../proxy");
  try {
    const res = await proxiedFetch(
      "https://api.gotinder.com/v2/auth/sms/validate?auth_type=sms",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Tinder Android Version 15.20.0",
          "app-version": "5200",
          "platform": "android",
          "os-version": "34",
          "persistent-device-id": ids.deviceId,
          "install-id": ids.installId,
          "app-session-id": ids.appSessionId,
        },
        body: JSON.stringify({
          otp_code: otp,
          phone_number: phone,
          is_update: false,
        }),
      },
      { sessionId: ids.deviceId, phone }
    );
    const text = await res.text();
    console.log(`[tinder-auth] v2 REST response (${res.status}, ${text.length} bytes):`, text.slice(0, 500));

    if (!text || text.length === 0) {
      return { step: "error", message: `Tinder v2 returned empty response (HTTP ${res.status})` };
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text);
    } catch {
      return { step: "error", message: `Tinder v2 non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}` };
    }

    if (!res.ok) {
      return { step: "error", message: `Tinder v2 API error (${res.status}): ${JSON.stringify(data).slice(0, 200)}` };
    }

    // v2 returns { data: { refresh_token, validated, ... } } on success
    const d = data.data as Record<string, unknown> | undefined;
    if (d?.validated === true || d?.refresh_token) {
      if (typeof d._id === "string" && typeof d.api_token === "string") {
        return { step: "login_success", authToken: d.api_token as string, refreshToken: (d.refresh_token as string) || "", userId: d._id as string };
      }
      return { step: "otp_sent", refreshToken: (d.refresh_token as string) || "", phone, otpLength: 6, smsSent: true };
    }
    return { step: "error", message: `Tinder v2 unexpected: ${JSON.stringify(data).slice(0, 200)}` };
  } catch (err) {
    return { step: "error", message: `Tinder v2 fallback failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function verifyEmailOtp(otp: string, refreshToken: string, _email: string, phone: string, ids: DeviceIds): Promise<AuthStep> {
  // Note: do NOT include the email field — Tinder rejects it (error 50000).
  // The refreshToken alone is sufficient to link the email OTP to the session.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emailOtp: any = { otp };
  if (refreshToken) emailOtp.refreshToken = { value: refreshToken };
  return sendAuthRequest({ emailOtp }, ids, phone);
}

export async function validateTinderToken(token: string): Promise<{ valid: boolean; name?: string; error?: string }> {
  try {
    const { proxiedFetch } = await import("../../proxy");
    const res = await proxiedFetch("https://api.gotinder.com/v2/profile?include=user", {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Tinder Android Version 15.20.0",
        "X-Auth-Token": token,
        platform: "android",
        "app-version": "5200",
      },
    });
    if (!res.ok) return { valid: false, error: `Invalid token (${res.status})` };
    const data = await res.json();
    return { valid: true, name: data?.data?.user?.name || "User" };
  } catch {
    return { valid: false, error: "Connection failed" };
  }
}

export const tinderAuthAdapter: PlatformAuthAdapter = {
  sendCode: sendPhoneCode,
  verifyCode: (phone, otp, refreshToken, ids) => verifyPhoneOtp(phone, otp, refreshToken, ids),
};
