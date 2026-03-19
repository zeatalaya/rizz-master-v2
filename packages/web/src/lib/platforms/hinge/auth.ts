/**
 * Hinge auth adapter.
 * Uses Firebase Phone Auth: client solves reCAPTCHA → server sends SMS via Firebase → OTP verify.
 * Updated March 2026.
 */

import { randomUUID } from "crypto";
import type { DeviceIds, AuthStep } from "@rizz/shared";
import type { PlatformAuthAdapter } from "../types";
import { proxiedFetch } from "../../proxy";

const HINGE_API = "https://prod-api.hingeaws.net";
const HINGE_APP_VERSION = "9.112.0";
const FIREBASE_API_KEY = "AIzaSyB-apSzB00iSHaEIG-5nalT2DDVSAHcPXA";
const HINGE_PACKAGE = "co.hinge.app";
const HINGE_CERT = "7D5F1D2ACE98A03B2C3A1A6B0DCB2B7F5D856F67";

export function generateHingeDeviceIds(): DeviceIds {
  return {
    deviceId: randomUUID(),
    appSessionId: randomUUID(),
    installId: randomUUID(),
    funnelSessionId: randomUUID(),
  };
}

/** Step 1: Register install ID with Hinge */
async function registerInstall(installId: string): Promise<void> {
  try {
    await proxiedFetch(`${HINGE_API}/identity/install`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-app-version": HINGE_APP_VERSION,
        "x-device-platform": "android",
      },
      body: JSON.stringify({ installId }),
    });
  } catch (err) {
    console.warn("[hinge-auth] registerInstall failed:", err instanceof Error ? err.message : err);
  }
}

/** Get reCAPTCHA site key from Firebase */
export async function getRecaptchaSiteKey(): Promise<string> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/recaptchaParams?alt=json&key=${FIREBASE_API_KEY}`,
    {
      headers: {
        "X-Android-Package": HINGE_PACKAGE,
        "X-Android-Cert": HINGE_CERT,
      },
    }
  );
  if (!res.ok) throw new Error(`Failed to get reCAPTCHA params: ${res.status}`);
  const data = await res.json();
  return data.recaptchaSiteKey;
}

/**
 * Phase 1: Register install + get reCAPTCHA site key.
 * Returns captcha_required so the client renders the reCAPTCHA widget.
 */
async function sendHingeCode(phone: string, ids: DeviceIds): Promise<AuthStep> {
  try {
    await registerInstall(ids.installId);
    const siteKey = await getRecaptchaSiteKey();
    console.log("[hinge-auth] Install registered, reCAPTCHA site key obtained");

    return {
      step: "captcha_required",
      referenceToken: siteKey,
      phone,
    };
  } catch (err) {
    return { step: "error", message: `Hinge auth failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Phase 2: Send SMS via Firebase using the reCAPTCHA token from the client.
 * Uses v1 endpoint which may handle hostname validation differently.
 */
export async function sendHingeCodeWithCaptcha(phone: string, recaptchaToken: string): Promise<AuthStep> {
  try {
    const cleanPhone = phone.startsWith("+") ? phone : `+${phone}`;

    // Try v1 endpoint first
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Android-Package": HINGE_PACKAGE,
          "X-Android-Cert": HINGE_CERT,
        },
        body: JSON.stringify({
          phoneNumber: cleanPhone,
          recaptchaToken: recaptchaToken,
        }),
      }
    );

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const errMsg = errData?.error?.message || `HTTP ${res.status}`;

      // If v1 fails with hostname error, try v3 endpoint
      if (errMsg.includes("Hostname")) {
        console.log("[hinge-auth] v1 hostname error, trying v3...");
        const res2 = await fetch(
          `https://www.googleapis.com/identitytoolkit/v3/relyingparty/sendVerificationCode?alt=json&key=${FIREBASE_API_KEY}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Android-Package": HINGE_PACKAGE,
              "X-Android-Cert": HINGE_CERT,
            },
            body: JSON.stringify({
              phone_number: cleanPhone,
              recaptcha_token: recaptchaToken,
            }),
          }
        );
        if (!res2.ok) {
          const errData2 = await res2.json().catch(() => ({}));
          throw new Error(errData2?.error?.message || `Firebase v3 ${res2.status}`);
        }
        const data2 = await res2.json();
        if (!data2.sessionInfo) throw new Error("No sessionInfo from Firebase v3");
        return {
          step: "otp_sent",
          refreshToken: data2.sessionInfo,
          phone: cleanPhone,
          otpLength: 6,
          smsSent: true,
        };
      }

      throw new Error(`Firebase sendVerificationCode: ${errMsg}`);
    }

    const data = await res.json();
    if (!data.sessionInfo) throw new Error("No sessionInfo in Firebase response");

    return {
      step: "otp_sent",
      refreshToken: data.sessionInfo,
      phone: cleanPhone,
      otpLength: 6,
      smsSent: true,
    };
  } catch (err) {
    return { step: "error", message: `Hinge SMS failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Verify OTP: Firebase verify → exchange for Hinge token
 */
async function verifyHingeCode(phone: string, otp: string, refreshToken: string, ids: DeviceIds): Promise<AuthStep> {
  try {
    // refreshToken contains the Firebase sessionInfo
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Android-Package": HINGE_PACKAGE,
          "X-Android-Cert": HINGE_CERT,
        },
        body: JSON.stringify({
          sessionInfo: refreshToken,
          code: otp,
        }),
      }
    );

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));

      // Try v3 endpoint as fallback
      const res2 = await fetch(
        `https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPhoneNumber?alt=json&key=${FIREBASE_API_KEY}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Android-Package": HINGE_PACKAGE,
            "X-Android-Cert": HINGE_CERT,
          },
          body: JSON.stringify({
            sessionInfo: refreshToken,
            code: otp,
          }),
        }
      );
      if (!res2.ok) {
        const errData2 = await res2.json().catch(() => ({}));
        throw new Error(errData2?.error?.message || errData?.error?.message || "Firebase verify failed");
      }
      const data2 = await res2.json();
      if (!data2.idToken) throw new Error("No idToken from Firebase");

      // Exchange for Hinge token
      return await exchangeForHingeToken(ids.installId, data2.idToken);
    }

    const data = await res.json();
    if (!data.idToken) throw new Error("No idToken in Firebase response");

    return await exchangeForHingeToken(ids.installId, data.idToken);
  } catch (err) {
    return { step: "error", message: `Hinge verify failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function exchangeForHingeToken(installId: string, firebaseJwt: string): Promise<AuthStep> {
  const res = await proxiedFetch(`${HINGE_API}/auth/sms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-app-version": HINGE_APP_VERSION,
      "x-device-platform": "android",
    },
    body: JSON.stringify({ installId, token: firebaseJwt }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Hinge auth/sms ${res.status}: ${text}`);
  }
  const data = await res.json();
  if (!data.token) throw new Error(`No token in Hinge response`);

  return {
    step: "login_success",
    authToken: data.token,
    refreshToken: "",
    userId: data.identityId || "",
  };
}

export const hingeAuthAdapter: PlatformAuthAdapter = {
  sendCode: sendHingeCode,
  verifyCode: verifyHingeCode,
};

export async function validateHingeToken(token: string, extra?: Record<string, string>): Promise<{ valid: boolean; name?: string; error?: string }> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": `Hinge/${HINGE_APP_VERSION} (Android; 14; SM-S918B)`,
      "x-app-version": HINGE_APP_VERSION,
      "Authorization": `Bearer ${token}`,
      "x-device-platform": "android",
    };
    if (extra?.deviceId) headers["x-device-id"] = extra.deviceId;
    if (extra?.installId) headers["x-install-id"] = extra.installId;

    const res = await proxiedFetch(`${HINGE_API}/user/v2/public`, { headers });
    if (!res.ok) return { valid: false, error: `Invalid token (${res.status})` };
    const data = await res.json();
    return { valid: true, name: data?.firstName || data?.name || "User" };
  } catch {
    return { valid: false, error: "Connection failed" };
  }
}
