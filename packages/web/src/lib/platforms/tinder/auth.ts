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
    "user-agent": "Tinder Android Version 14.22.0",
    "app-version": "4525",
    "platform": "android",
    "platform-variant": "Google-Play",
    "os-version": "30",
    "tinder-version": "14.22.0",
    "store-variant": "Play-Store",
    "x-supported-image-formats": "webp",
    "accept-language": "en-US",
    "accept-encoding": "gzip",
    "content-type": "application/x-google-protobuf",
    "persistent-device-id": ids.deviceId,
    "app-session-id": ids.appSessionId,
    "install-id": ids.installId,
    "app-session-time-elapsed": (Math.random() * 2).toFixed(3),
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
    } catch (e) {
      console.warn("[tinder-auth] Failed to get proxy dispatcher:", e);
    }
  }

  let res: Response;
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
      res = await undici.fetch(AUTH_URL, fetchInit) as unknown as Response;
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
  return sendAuthRequest({ phone: { phone } }, ids, phone);
}

export async function verifyPhoneOtp(phone: string, otp: string, refreshToken: string, ids: DeviceIds): Promise<AuthStep> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const phoneOtp: any = { phone: { value: phone }, otp };
  if (refreshToken) phoneOtp.refreshToken = { value: refreshToken };
  return sendAuthRequest({ phoneOtp }, ids, phone);
}

export async function verifyEmailOtp(otp: string, refreshToken: string, email: string, phone: string, ids: DeviceIds): Promise<AuthStep> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emailOtp: any = { otp };
  if (refreshToken) emailOtp.refreshToken = { value: refreshToken };
  if (email) emailOtp.email = { value: email };
  return sendAuthRequest({ emailOtp }, ids, phone);
}

export async function validateTinderToken(token: string): Promise<{ valid: boolean; name?: string; error?: string }> {
  try {
    const res = await fetch("https://api.gotinder.com/v2/profile?include=user", {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Tinder Android Version 14.22.0",
        "X-Auth-Token": token,
        platform: "android",
        "app-version": "4525",
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
