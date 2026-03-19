import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getScreenshot, getStatus } from "@/lib/browser-auth";

export async function GET() {
  try {
    const session = await getSession();
    if (!session.deviceId) {
      return NextResponse.json({ error: "No browser session" }, { status: 400 });
    }

    // Check if token was captured
    const status = await getStatus(session.deviceId);
    if (status.token) {
      // Token captured — save to session and return success
      session.authToken = status.token;
      session.verifiedAt = new Date().toISOString();
      await session.save();

      return NextResponse.json(
        { captured: true, token: status.token },
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const screenshot = await getScreenshot(session.deviceId);
    if (!screenshot) {
      return NextResponse.json({ error: "No screenshot available" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(screenshot), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Screenshot failed" },
      { status: 500 }
    );
  }
}
