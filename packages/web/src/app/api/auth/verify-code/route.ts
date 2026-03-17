import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAuthAdapter, getAdapter } from "@/lib/platforms";
import type { DeviceIds } from "@rizz/shared";

export async function POST(req: NextRequest) {
  try {
    const { code, type, phone, email: clientEmail, refreshToken: clientRefreshToken, deviceIds: clientDeviceIds, platform: clientPlatform } = await req.json();
    const session = await getSession();

    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "Code is required" }, { status: 400 });
    }

    const platform = session.platform || clientPlatform;
    if (!platform) {
      return NextResponse.json({ error: "No platform set. Start over." }, { status: 400 });
    }

    const refreshToken = session.refreshToken || clientRefreshToken || "";
    const phoneNumber = session.phone || phone;

    const ids: DeviceIds = {
      deviceId: session.deviceId || clientDeviceIds?.deviceId || "",
      appSessionId: session.appSessionId || clientDeviceIds?.appSessionId || "",
      installId: session.installId || clientDeviceIds?.installId || "",
      funnelSessionId: session.funnelSessionId || clientDeviceIds?.funnelSessionId || "",
    };

    if (!ids.deviceId) {
      return NextResponse.json({ error: "No device ID. Start over." }, { status: 400 });
    }

    let result;

    if (type === "email" && platform === "tinder") {
      // Email OTP is Tinder-specific
      if (!refreshToken) {
        return NextResponse.json({ error: "No refresh token for email step. Start over." }, { status: 400 });
      }
      const { verifyEmailOtp } = await import("@/lib/platforms/tinder/auth");
      const email = clientEmail || session.email || "";
      result = await verifyEmailOtp(code, refreshToken, email, phoneNumber || "", ids);
    } else {
      if (!phoneNumber) {
        return NextResponse.json({ error: "No phone number. Start over." }, { status: 400 });
      }
      const authAdapter = getAuthAdapter(platform);
      result = await authAdapter.verifyCode(phoneNumber, code, refreshToken, ids);
    }

    if (result.step === "error") {
      console.error(`[verify-code] ${platform} auth error:`, result.message);
      return NextResponse.json(
        { error: result.message, step: "error" },
        { status: 400 }
      );
    }

    if ("refreshToken" in result && result.refreshToken) {
      session.refreshToken = result.refreshToken;
    }

    if (result.step === "email_required" && result.email) {
      session.email = result.email;
    }

    if (result.step === "login_success") {
      session.authToken = result.authToken;
      session.verifiedAt = new Date().toISOString();
      session.phone = phoneNumber;

      const adapter = getAdapter(platform);
      const validation = await adapter.validateToken(result.authToken);
      if (validation.valid) {
        session.userName = validation.name;
      }

      await session.save();
      return NextResponse.json({ ...result, userName: session.userName });
    }

    await session.save();
    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Verification failed" },
      { status: 500 }
    );
  }
}
