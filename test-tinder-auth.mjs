#!/usr/bin/env node
/**
 * 2-step Tinder auth test.
 * Step 1: node test-tinder-auth.mjs +351917470069
 * Step 2: node test-tinder-auth.mjs +351917470069 <otp> <deviceId> <appSessionId> <installId> <funnelSessionId>
 */
import protobuf from "protobufjs";
import { readFileSync } from "fs";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const protoJson = JSON.parse(readFileSync(join(__dirname, "packages/web/src/lib/platforms/tinder/tinder-proto.json"), "utf8"));
const AUTH_URL = "https://api.gotinder.com/v3/auth/login";
const root = protobuf.Root.fromJSON(protoJson);
const AuthGatewayRequest = root.lookupType("AuthGatewayRequest");
const AuthGatewayResponse = root.lookupType("AuthGatewayResponse");

const phone = process.argv[2];
const otp = process.argv[3];

if (!phone) { console.log("Usage:\n  Step 1: node test-tinder-auth.mjs <phone>\n  Step 2: node test-tinder-auth.mjs <phone> <otp> <ids...>"); process.exit(1); }

let ids;
if (process.argv[4]) {
  ids = { deviceId: process.argv[4], appSessionId: process.argv[5], installId: process.argv[6], funnelSessionId: process.argv[7] };
} else {
  ids = {
    deviceId: randomUUID().replace(/-/g, "").slice(0, 16),
    appSessionId: randomUUID(),
    installId: Buffer.from(randomUUID()).toString("base64").slice(0, 22),
    funnelSessionId: randomUUID(),
  };
}

const headers = {
  "user-agent": "Tinder Android Version 14.22.0",
  "app-version": "4525", platform: "android", "platform-variant": "Google-Play",
  "os-version": "30", "tinder-version": "14.22.0", "store-variant": "Play-Store",
  "x-supported-image-formats": "webp", "accept-language": "en-US", "accept-encoding": "gzip",
  "content-type": "application/x-google-protobuf",
  "persistent-device-id": ids.deviceId, "app-session-id": ids.appSessionId,
  "install-id": ids.installId, "app-session-time-elapsed": (Math.random() * 2).toFixed(3),
  "funnel-session-id": ids.funnelSessionId,
};

async function send(payload) {
  const msg = AuthGatewayRequest.create(payload);
  const buffer = Buffer.from(AuthGatewayRequest.encode(msg).finish());
  console.log(`\nSending ${buffer.length} bytes...`);
  const res = await fetch(AUTH_URL, { method: "POST", headers: { ...headers, "content-length": String(buffer.length) }, body: buffer });
  const respBuffer = Buffer.from(await res.arrayBuffer());
  if (!respBuffer.length) { console.log(`Empty (HTTP ${res.status})`); return null; }
  const decoded = AuthGatewayResponse.decode(respBuffer);
  console.log(`HTTP ${res.status}:`, JSON.stringify(decoded.toJSON?.() || decoded, null, 2));
  return decoded;
}

function unwrap(obj) {
  if (!obj) return obj;
  if (typeof obj === "object") {
    if (typeof obj.toJSON === "function") { const j = obj.toJSON(); return j?.value ?? j; }
    if ("value" in obj) return obj.value;
  }
  return obj;
}

async function main() {
  if (!otp) {
    console.log("=== SEND CODE ===");
    const resp = await send({ phone: { phone } });
    if (resp?.validatePhoneOtpState) {
      const rt = unwrap(resp.validatePhoneOtpState.refreshToken);
      console.log(`\nSMS sent! refreshToken=${rt ? rt.slice(0, 30) + "..." : "(empty)"}`);
      console.log(`\nTo verify, run:`);
      console.log(`node test-tinder-auth.mjs "${phone}" <OTP> ${ids.deviceId} ${ids.appSessionId} ${ids.installId} ${ids.funnelSessionId}`);
    }
  } else {
    console.log("=== VERIFY OTP ===");
    console.log(`Phone: ${phone}, OTP: ${otp}, DeviceId: ${ids.deviceId}`);
    const payload = { phone: { value: phone }, otp };
    const resp = await send({ phoneOtp: payload });
    if (resp?.loginResult) {
      console.log("\n✅ SUCCESS! Token:", resp.loginResult.authToken?.slice(0, 30) + "...");
    } else if (resp?.validateEmailOtpState) {
      console.log("\n📧 Email verification required:", resp.validateEmailOtpState.maskedEmail || resp.validateEmailOtpState.unmaskedEmail);
    }
  }
}

main().catch(e => { console.error("Error:", e.message); process.exit(1); });
