import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { proxiedFetch } from "@/lib/proxy";

const BASE_URL = "https://api.gotinder.com";

function buildHeaders(token: string, deviceIds?: {
  deviceId?: string;
  appSessionId?: string;
  installId?: string;
  funnelSessionId?: string;
}): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Tinder Android Version 15.20.0",
    platform: "android",
    "app-version": "5200",
    "os-version": "30",
    "accept-language": "en-US",
    "X-Auth-Token": token,
  };
  if (deviceIds?.deviceId) h["persistent-device-id"] = deviceIds.deviceId;
  if (deviceIds?.appSessionId) h["app-session-id"] = deviceIds.appSessionId;
  if (deviceIds?.installId) h["install-id"] = deviceIds.installId;
  if (deviceIds?.funnelSessionId) h["funnel-session-id"] = deviceIds.funnelSessionId;
  return h;
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session.authToken || session.platform !== "tinder") {
      return NextResponse.json({ error: "Not authenticated as Tinder" }, { status: 401 });
    }

    const token = session.authToken;
    const deviceIds = {
      deviceId: session.deviceId,
      appSessionId: session.appSessionId,
      installId: session.installId,
      funnelSessionId: session.funnelSessionId,
    };
    const results: Record<string, unknown> = {};

    results.sessionHasDeviceIds = {
      deviceId: !!session.deviceId,
      appSessionId: !!session.appSessionId,
      installId: !!session.installId,
      funnelSessionId: !!session.funnelSessionId,
    };

    // Test 1: Matches WITHOUT device headers (old behavior)
    try {
      const matchUrl = `${BASE_URL}/v2/matches?count=10&is_tinder_u=false&locale=en`;
      const matchRes = await proxiedFetch(matchUrl, {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Tinder Android Version 15.20.0",
          platform: "android",
          "app-version": "5200",
          "X-Auth-Token": token,
        },
      });
      results.withoutDeviceHeaders = {
        status: matchRes.status,
        bodyLength: (await matchRes.text()).length,
      };
    } catch (e) {
      results.withoutDeviceHeaders = { error: e instanceof Error ? e.message : String(e) };
    }

    // Test 2: Matches WITH device headers (new behavior)
    try {
      const matchUrl = `${BASE_URL}/v2/matches?count=10&is_tinder_u=false&locale=en`;
      const headers = buildHeaders(token, deviceIds);
      results.headersSent = Object.keys(headers);
      const matchRes = await proxiedFetch(matchUrl, { headers });
      const rawText = await matchRes.text();
      results.withDeviceHeaders = { status: matchRes.status, bodyLength: rawText.length };
      if (matchRes.ok) {
        try {
          const parsed = JSON.parse(rawText);
          results.withDeviceHeaders = {
            ...results.withDeviceHeaders as object,
            matchesCount: parsed.data?.matches?.length ?? "no matches field",
            keys: parsed.data ? Object.keys(parsed.data) : Object.keys(parsed),
            firstMatchKeys: parsed.data?.matches?.[0] ? Object.keys(parsed.data.matches[0]) : [],
            firstMatchMsgCount: parsed.data?.matches?.[0]?.messages?.length ?? "no messages",
            hasNextPage: !!parsed.data?.next_page_token,
          };
        } catch {
          results.withDeviceHeaders = { ...results.withDeviceHeaders as object, rawSample: rawText.slice(0, 1000) };
        }
      } else {
        results.withDeviceHeaders = {
          ...results.withDeviceHeaders as object,
          responseHeaders: Object.fromEntries(matchRes.headers.entries()),
          rawSample: rawText.slice(0, 500),
        };
      }
    } catch (e) {
      results.withDeviceHeaders = { error: e instanceof Error ? e.message : String(e) };
    }

    // Test 3: Matches with device headers + message=1
    try {
      const matchUrl = `${BASE_URL}/v2/matches?count=10&message=1&locale=en`;
      const matchRes = await proxiedFetch(matchUrl, { headers: buildHeaders(token, deviceIds) });
      const rawText = await matchRes.text();
      results.withDeviceHeadersAndMsg = { status: matchRes.status, bodyLength: rawText.length };
      if (matchRes.ok) {
        try {
          const parsed = JSON.parse(rawText);
          results.withDeviceHeadersAndMsg = {
            ...results.withDeviceHeadersAndMsg as object,
            matchesCount: parsed.data?.matches?.length ?? "no matches",
          };
        } catch {
          results.withDeviceHeadersAndMsg = { ...results.withDeviceHeadersAndMsg as object, raw: rawText.slice(0, 500) };
        }
      }
    } catch (e) {
      results.withDeviceHeadersAndMsg = { error: e instanceof Error ? e.message : String(e) };
    }

    return NextResponse.json(results, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
