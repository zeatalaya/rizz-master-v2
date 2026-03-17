import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  // Support mobile auth via Authorization header
  const authHeader = req.headers.get("Authorization");
  const platformHeader = req.headers.get("X-Platform");

  if (authHeader?.startsWith("Bearer ") && platformHeader) {
    // Mobile client — token is in header, not session
    return NextResponse.json({
      authenticated: true,
      platform: platformHeader,
      userName: null, // mobile clients fetch name separately
      verifiedAt: null,
    });
  }

  const session = await getSession();
  return NextResponse.json({
    authenticated: !!session.authToken,
    platform: session.platform || null,
    userName: session.userName || null,
    verifiedAt: session.verifiedAt || null,
  });
}
