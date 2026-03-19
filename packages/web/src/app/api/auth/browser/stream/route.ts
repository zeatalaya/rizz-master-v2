import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getLatestFrame, getStatus } from "@/lib/browser-auth";

export const dynamic = "force-dynamic";

// Returns the latest buffered screencast frame as base64 JSON
// Much faster than taking a screenshot on demand (~0ms vs ~200ms)
export async function GET() {
  try {
    const session = await getSession();
    if (!session.deviceId) {
      return NextResponse.json({ error: "No browser session" }, { status: 400 });
    }

    const { frame, seq, token } = getLatestFrame(session.deviceId);

    // If token was captured, save to session
    if (token && !session.authToken) {
      session.authToken = token;
      session.platform = "tinder";
      session.verifiedAt = new Date().toISOString();
      await session.save();
    }

    if (token) {
      return NextResponse.json({ type: "token", token });
    }

    if (!frame) {
      // No frame yet — check status
      const status = await getStatus(session.deviceId);
      return NextResponse.json({ type: "status", status: status.status });
    }

    return NextResponse.json({
      type: "frame",
      data: frame,
      seq,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Frame failed" },
      { status: 500 }
    );
  }
}
