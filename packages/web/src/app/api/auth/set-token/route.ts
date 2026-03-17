import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAdapter } from "@/lib/platforms";
import type { Platform } from "@rizz/shared";

const VALID_PLATFORMS: Platform[] = ["tinder", "bumble", "hinge"];

async function sealToken(token: string, platform: Platform, userId?: string) {
  const session = await getSession();
  session.authToken = token;
  session.platform = platform;
  session.verifiedAt = new Date().toISOString();
  if (userId) session.phone = userId;

  try {
    const adapter = getAdapter(platform);
    const validation = await adapter.validateToken(token);
    if (validation.valid) {
      session.userName = validation.name;
    }
  } catch {
    session.userName = "User";
  }

  await session.save();
  return session.userName || "User";
}

export async function POST(req: NextRequest) {
  try {
    const { token, platform, userId } = await req.json();
    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }
    if (!platform || !VALID_PLATFORMS.includes(platform)) {
      return NextResponse.json({ error: "Valid platform is required" }, { status: 400 });
    }

    const cleanToken = token.replace(/^["']+|["']+$/g, "").trim();
    if (!cleanToken) {
      return NextResponse.json({ error: "Token is empty after cleaning" }, { status: 400 });
    }

    const userName = await sealToken(cleanToken, platform, userId);
    return NextResponse.json({ success: true, userName });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to set token" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const platform = (req.nextUrl.searchParams.get("platform") || "tinder") as Platform;
  if (!token) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  await sealToken(token, platform);
  return NextResponse.redirect(new URL("/", req.url));
}
