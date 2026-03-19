/**
 * Hinge stats API adapter.
 * REST-based with Bearer token auth.
 * Updated March 2026 — requires X-App-Version header.
 */

import type { PlatformStats, MatchSummary } from "@rizz/shared";
import type { PlatformAdapter } from "../types";
import { proxiedFetch } from "../../proxy";

const HINGE_API = "https://prod-api.hingeaws.net";
const HINGE_APP_VERSION = "9.112.0";

function hingeHeaders(token: string, extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": `Hinge/${HINGE_APP_VERSION} (Android; 14; SM-S918B)`,
    "x-app-version": HINGE_APP_VERSION,
    "Authorization": `Bearer ${token}`,
    "x-device-platform": "android",
    "accept-language": "en-US",
  };
  if (extra?.sessionId) h["x-session-id"] = extra.sessionId;
  if (extra?.deviceId) h["x-device-id"] = extra.deviceId;
  if (extra?.installId) h["x-install-id"] = extra.installId;
  return h;
}

async function hingeGet(path: string, token: string, extra?: Record<string, string>): Promise<unknown> {
  const res = await proxiedFetch(`${HINGE_API}${path}`, {
    headers: hingeHeaders(token, extra),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Hinge API ${res.status}: ${text}`);
  }
  return res.json();
}

async function fetchHingeStats(token: string, extra?: Record<string, string>): Promise<PlatformStats> {
  let myName = "User";
  let myId = "unknown";

  // Get user profile
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profile = await hingeGet("/user/v2/public", token, extra) as any;
    myName = profile?.firstName || profile?.name || "User";
    myId = profile?.identityId || profile?.id || "unknown";
  } catch (err) {
    console.error("[hinge-api] profile failed:", err instanceof Error ? err.message : err);
  }

  // Get likes / standouts count
  let likesCount = 0;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const standouts = await hingeGet("/standouts/v2", token, extra) as any;
    likesCount = standouts?.count || standouts?.results?.length || 0;
  } catch {
    // Continue with 0
  }

  // Get conversations / connections
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let connections: any[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await hingeGet("/rec/v2", token, extra) as any;
    connections = data?.connections || data?.results || data?.conversations || [];
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await hingeGet("/message/conversations", token, extra) as any;
      connections = data?.conversations || data?.results || [];
    } catch {
      // Continue with empty
    }
  }

  let totalConversations = 0;
  let youStarted = 0;
  let youStartedWithReply = 0;
  let theyStarted = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matchSummaries: MatchSummary[] = connections.map((conn: any) => {
    const messages = conn.messages || conn.chatMessages || [];
    const hasMessages = messages.length > 0;
    let isYouStarted = false;
    let isTheyReplied = false;

    if (hasMessages) {
      totalConversations++;
      const firstMsg = messages[0];
      const fromMe = firstMsg?.senderId === myId || firstMsg?.isMine;

      if (fromMe) {
        youStarted++;
        isYouStarted = true;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (messages.some((m: any) => m.senderId !== myId && !m.isMine)) {
          youStartedWithReply++;
          isTheyReplied = true;
        }
      } else {
        theyStarted++;
      }
    }

    const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
    const other = conn.subject || conn.otherUser || {};

    return {
      id: conn.id || conn.conversationId || "",
      name: other.firstName || other.name || "Unknown",
      photoUrl: other.photos?.[0]?.url || other.photoUrl || null,
      messageCount: messages.length,
      youStarted: isYouStarted,
      theyReplied: isTheyReplied,
      lastMessage: lastMsg?.body || lastMsg?.text || null,
      lastMessageDate: lastMsg?.createdAt || lastMsg?.timestamp || null,
    };
  });

  const totalMatches = connections.length;
  const replyRate = youStarted > 0 ? (youStartedWithReply / youStarted) * 100 : null;
  const conversationRate = totalMatches > 0 ? (totalConversations / totalMatches) * 100 : null;

  return {
    platform: "hinge",
    myId,
    myName,
    totalMatches,
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

export const hingeAdapter: PlatformAdapter = {
  fetchStats: fetchHingeStats,
  validateToken: async (token, extra) => {
    const { validateHingeToken } = await import("./auth");
    return validateHingeToken(token, extra);
  },
};
