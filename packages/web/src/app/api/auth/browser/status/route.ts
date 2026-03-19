import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getStatus, closeSession } from "@/lib/browser-auth";
import { getAdapter } from "@/lib/platforms";

export async function GET() {
  try {
    const session = await getSession();
    if (!session.deviceId) {
      return NextResponse.json({ status: "none", token: null, error: null });
    }

    const result = await getStatus(session.deviceId);

    // If token captured, validate it and save to session
    if (result.token && !session.authToken) {
      session.authToken = result.token;
      session.platform = "tinder";
      session.verifiedAt = new Date().toISOString();

      // Validate and get user name
      try {
        const adapter = getAdapter("tinder");
        const validation = await adapter.validateToken(result.token);
        if (validation.valid) {
          session.userName = validation.name;
        }
      } catch { /* validation failed, token might still work for stats */ }

      await session.save();

      // Close the browser session — we have the token
      await closeSession(session.deviceId);
    }

    return NextResponse.json({
      ...result,
      userName: session.userName || null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Status check failed" },
      { status: 500 }
    );
  }
}
