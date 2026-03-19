/**
 * Tinder stats API adapter.
 * Ported from v1.
 */

import type { PlatformStats, MatchSummary } from "@rizz/shared";
import type { PlatformAdapter } from "../types";
import { proxiedFetch } from "../../proxy";

const BASE_URL = "https://api.gotinder.com";
const BASE_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "User-Agent": "Tinder Android Version 15.20.0",
  platform: "android",
  "app-version": "5200",
  "os-version": "30",
  "accept-language": "en-US",
};

interface TinderMessage {
  _id: string;
  from: string;
  to: string;
  message: string;
  sent_date: string;
}

interface TinderMatch {
  _id: string;
  person?: {
    _id: string;
    name: string;
    photos?: { url: string }[];
  };
  messages: TinderMessage[];
  message_count: number;
}

async function tinderGet(
  path: string,
  token: string,
  params?: Record<string, string>,
  deviceHeaders?: Record<string, string>
): Promise<unknown> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const headers: Record<string, string> = {
    ...BASE_HEADERS,
    "X-Auth-Token": token,
    ...deviceHeaders,
  };
  const res = await proxiedFetch(url.toString(), { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tinder API ${res.status}: ${text}`);
  }
  return res.json();
}

function buildDeviceHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = {};
  if (extra?.deviceId) h["persistent-device-id"] = extra.deviceId;
  if (extra?.appSessionId) h["app-session-id"] = extra.appSessionId;
  if (extra?.installId) h["install-id"] = extra.installId;
  if (extra?.funnelSessionId) h["funnel-session-id"] = extra.funnelSessionId;
  return h;
}

async function getProfile(token: string, deviceHeaders?: Record<string, string>) {
  try {
    const data = (await tinderGet("/v2/profile?include=user", token, undefined, deviceHeaders)) as {
      data: { user: { _id: string; name: string } };
    };
    return data.data.user;
  } catch {
    return { _id: "unknown", name: "User" };
  }
}

async function getAllMatches(token: string, deviceHeaders?: Record<string, string>): Promise<TinderMatch[]> {
  try {
    const all: TinderMatch[] = [];
    let pageToken: string | undefined;

    for (let i = 0; i < 100; i++) {
      const params: Record<string, string> = { count: "60", is_tinder_u: "false", locale: "en" };
      if (pageToken) params.page_token = pageToken;

      const data = (await tinderGet("/v2/matches", token, params, deviceHeaders)) as {
        data: { matches: TinderMatch[]; next_page_token?: string };
      };

      const matches = data.data?.matches ?? [];
      if (matches.length === 0) break;

      all.push(...matches);
      pageToken = data.data?.next_page_token;
      if (!pageToken) break;
    }
    console.log(`[tinder-api] matches fetched: ${all.length}`);
    return all;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[tinder-api] getAllMatches failed:", msg);
    throw new Error(`Failed to fetch matches: ${msg}`);
  }
}

async function getLikesCount(token: string, deviceHeaders?: Record<string, string>): Promise<number> {
  try {
    const data = (await tinderGet("/v2/fast-match/count", token, undefined, deviceHeaders)) as {
      data: { count: number };
    };
    return data.data?.count ?? 0;
  } catch {
    try {
      const data = (await tinderGet("/v2/fast-match/teasers", token, undefined, deviceHeaders)) as {
        data: { results: unknown[] };
      };
      return data.data?.results?.length ?? 0;
    } catch {
      return 0;
    }
  }
}

async function fetchTinderStats(token: string, extra?: Record<string, string>): Promise<PlatformStats> {
  const dh = buildDeviceHeaders(extra);
  const [profile, matches, likesCount] = await Promise.all([
    getProfile(token, dh),
    getAllMatches(token, dh),
    getLikesCount(token, dh),
  ]);

  const myId = profile._id;
  let totalConversations = 0;
  let youStarted = 0;
  let youStartedWithReply = 0;
  let theyStarted = 0;

  const matchSummaries: MatchSummary[] = matches.map((match) => {
    const msgs = [...(match.messages || [])].sort(
      (a, b) => new Date(a.sent_date).getTime() - new Date(b.sent_date).getTime()
    );
    const totalMsgCount = match.message_count ?? msgs.length;

    const hasMessages = totalMsgCount > 0 || msgs.length > 0;
    let isYouStarted = false;
    let isTheyReplied = false;

    if (hasMessages) {
      totalConversations++;
      // Use the returned messages to determine who started
      const firstSender = msgs.length > 0 ? msgs[0].from : null;

      if (firstSender === myId) {
        youStarted++;
        isYouStarted = true;
        // Check for reply: either we see a message from them in the array,
        // or message_count > number of our messages (means they also sent some)
        const myMsgCount = msgs.filter((m) => m.from === myId).length;
        if (msgs.some((m) => m.from !== myId) || totalMsgCount > myMsgCount) {
          youStartedWithReply++;
          isTheyReplied = true;
        }
      } else if (firstSender !== null) {
        theyStarted++;
        // They started, but if message_count > 1, we likely replied
        // (still counts as "they started" not "you started")
      } else if (totalMsgCount > 0) {
        // No messages returned but message_count > 0 — can't determine who started
        totalConversations--; // don't count if we can't determine direction
      }
    }

    const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;

    return {
      id: match._id,
      name: match.person?.name ?? "Unknown",
      photoUrl: match.person?.photos?.[0]?.url ?? null,
      messageCount: msgs.length,
      youStarted: isYouStarted,
      theyReplied: isTheyReplied,
      lastMessage: lastMsg?.message ?? null,
      lastMessageDate: lastMsg?.sent_date ?? null,
    };
  });

  const replyRate = youStarted > 0 ? (youStartedWithReply / youStarted) * 100 : null;
  const conversationRate = matches.length > 0 ? (totalConversations / matches.length) * 100 : null;

  return {
    platform: "tinder",
    myId,
    myName: profile.name,
    totalMatches: matches.length,
    likesYouCount: likesCount,
    totalConversations,
    conversationsYouStarted: youStarted,
    conversationsStartedWithReply: youStartedWithReply,
    conversationsTheyStarted: theyStarted,
    replyRate,
    conversationRate,
    matches: matchSummaries,
  };
}

export const tinderAdapter: PlatformAdapter = {
  fetchStats: fetchTinderStats,
  validateToken: async (token) => {
    const { validateTinderToken } = await import("./auth");
    return validateTinderToken(token);
  },
};
