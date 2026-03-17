import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAuthAdapter, generateDeviceIds } from "@/lib/platforms";
import type { Platform, DeviceIds } from "@rizz/shared";

const VALID_PLATFORMS: Platform[] = ["tinder", "bumble", "hinge"];

export async function POST(req: NextRequest) {
  try {
    const { phone, platform, deviceIds: clientDeviceIds } = await req.json();

    if (!phone || typeof phone !== "string") {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
    }
    if (!platform || !VALID_PLATFORMS.includes(platform)) {
      return NextResponse.json({ error: "Valid platform is required (tinder, bumble, hinge)" }, { status: 400 });
    }

    const cleanPhone = phone.replace(/[\s()-]/g, "");
    const session = await getSession();

    // Reuse existing device IDs if available, otherwise generate new ones
    let ids: DeviceIds;
    if (clientDeviceIds?.deviceId) {
      ids = clientDeviceIds;
    } else if (session.deviceId) {
      ids = {
        deviceId: session.deviceId,
        appSessionId: session.appSessionId || "",
        installId: session.installId || "",
        funnelSessionId: session.funnelSessionId || "",
      };
    } else {
      ids = generateDeviceIds(platform);
    }

    const authAdapter = getAuthAdapter(platform);
    let result = await authAdapter.sendCode(cleanPhone, ids);

    // On transient error, retry ONCE
    if (result.step === "error") {
      const msg = result.message;
      if (msg.includes("42901") || msg.includes("fetch failed")) {
        console.log(`[send-code] Transient error on ${platform}, retrying once...`);
        result = await authAdapter.sendCode(cleanPhone, ids);
      }
    }

    if (result.step === "error") {
      console.error(`[send-code] ${platform} auth error:`, result.message);
      return NextResponse.json(
        { error: result.message, step: "error" },
        { status: 400 }
      );
    }

    // Store auth state in session
    session.phone = cleanPhone;
    session.platform = platform;
    session.deviceId = ids.deviceId;
    session.appSessionId = ids.appSessionId;
    session.installId = ids.installId;
    session.funnelSessionId = ids.funnelSessionId;
    if ("refreshToken" in result) {
      session.refreshToken = result.refreshToken;
    }
    await session.save();

    return NextResponse.json({ ...result, _deviceIds: ids });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send code" },
      { status: 500 }
    );
  }
}
