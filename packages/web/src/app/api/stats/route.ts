import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAdapter } from "@/lib/platforms";
import { attestRizzMasterResult } from "@/lib/dstack";
import type { Platform } from "@rizz/shared";

export async function GET(req: NextRequest) {
  try {
    // Support mobile auth via Authorization header
    const authHeader = req.headers.get("Authorization");
    const platformHeader = req.headers.get("X-Platform") as Platform | null;

    let token: string;
    let platform: Platform;

    if (authHeader?.startsWith("Bearer ") && platformHeader) {
      // Mobile client
      token = authHeader.slice(7);
      platform = platformHeader;
    } else {
      // Web client — use session
      const session = await getSession();
      if (!session.authToken || !session.platform) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      }
      token = session.authToken;
      platform = session.platform;

      // Cache user name if needed
      const adapter = getAdapter(platform);
      const extra: Record<string, string> = {};
      if (session.deviceId) extra.deviceId = session.deviceId;
      if (session.appSessionId) extra.appSessionId = session.appSessionId;
      if (session.installId) extra.installId = session.installId;
      if (session.funnelSessionId) extra.funnelSessionId = session.funnelSessionId;
      const stats = await adapter.fetchStats(token, extra);

      if (stats.myName) {
        session.userName = stats.myName;
        await session.save();
      }

      // Attempt TEE attestation
      const replyRate = stats.replyRate ?? 0;
      let attestation = null;
      try {
        attestation = await attestRizzMasterResult({
          userId: stats.myId,
          userName: stats.myName,
          isRizzMaster:
            stats.totalMatches >= 40 &&
            stats.conversationsYouStarted >= 18 &&
            replyRate >= 35,
          totalMatches: stats.totalMatches,
          conversationsYouStarted: stats.conversationsYouStarted,
          replyRate,
          platform,
        });
        console.log(`[stats] TEE attestation succeeded for ${platform}`);
      } catch (attestErr) {
        console.error("[stats] TEE attestation failed:", attestErr instanceof Error ? attestErr.message : attestErr);
      }

      return NextResponse.json({ ...stats, attestation, teeVerified: !!attestation });
    }

    // Mobile path
    const adapter = getAdapter(platform);
    const stats = await adapter.fetchStats(token);

    const mobileReplyRate = stats.replyRate ?? 0;
    let attestation = null;
    try {
      attestation = await attestRizzMasterResult({
        userId: stats.myId,
        userName: stats.myName,
        isRizzMaster:
          stats.totalMatches >= 40 &&
          stats.conversationsYouStarted >= 18 &&
          mobileReplyRate >= 35,
        totalMatches: stats.totalMatches,
        conversationsYouStarted: stats.conversationsYouStarted,
        replyRate: mobileReplyRate,
        platform,
      });
    } catch {
      // TEE not available
    }

    return NextResponse.json({ ...stats, attestation, teeVerified: !!attestation });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("401")) {
      return NextResponse.json({ error: "Session expired. Please log in again." }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
