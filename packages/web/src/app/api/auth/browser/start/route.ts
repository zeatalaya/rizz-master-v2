import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { startSession } from "@/lib/browser-auth";

export async function POST() {
  try {
    const session = await getSession();
    const sessionId = session.deviceId || crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    session.deviceId = sessionId;
    session.platform = "tinder";
    await session.save();

    const result = await startSession(sessionId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start browser" },
      { status: 500 }
    );
  }
}
