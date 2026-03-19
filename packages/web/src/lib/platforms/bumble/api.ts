/**
 * Bumble stats API adapter.
 * Uses session cookie + MD5-signed JSON requests via Badoo protocol.
 * Updated March 2026 — improved headers.
 */

import { createHash } from "crypto";
import type { PlatformStats, MatchSummary } from "@rizz/shared";
import type { PlatformAdapter } from "../types";
import { proxiedFetch } from "../../proxy";

const BUMBLE_API = "https://bumble.com/mwebapi.phtml";
const SIGNING_SECRET = "whitetelevisionbulbelectionroofhorseflying";

function signBody(body: string): string {
  return createHash("md5").update(body + SIGNING_SECRET).digest("hex");
}

async function bumblePost(messageType: number, data: Record<string, unknown>, sessionCookie: string): Promise<unknown> {
  const body = {
    body: [{ message_type: messageType, ...data }],
    message_type: messageType,
    version: 1,
    is_background: false,
    "$gpb": "badoo.bma.BadooMessage",
  };
  const bodyStr = JSON.stringify(body);

  const res = await proxiedFetch(BUMBLE_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
      "X-Pingback": signBody(bodyStr),
      "X-Message-type": String(messageType),
      "x-use-session-cookie": "1",
      "Origin": "https://bumble.com",
      "Referer": "https://bumble.com/",
      "Accept": "application/json",
      "Cookie": `session=${sessionCookie}; session_cookie_name=session`,
    },
    body: bodyStr,
  });

  if (!res.ok) throw new Error(`Bumble API ${res.status}`);
  return res.json();
}

async function fetchBumbleStats(token: string): Promise<PlatformStats> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let myName = "User";
  let myId = "unknown";

  // Get user profile (msg_type 403)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profileResp = await bumblePost(403, {}, token) as any;
    const user = profileResp?.body?.[0]?.client_user || profileResp?.body?.[0]?.user;
    myName = user?.name || "User";
    myId = user?.user_id || "unknown";
  } catch (err) {
    console.error("[bumble-api] profile failed:", err instanceof Error ? err.message : err);
  }

  // Get conversations (msg_type 245)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let conversations: any[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const convResp = await bumblePost(245, { folder_id: 0, offset: 0, preferred_count: 100 }, token) as any;
    conversations = convResp?.body?.[0]?.chat_instance_list || [];
  } catch {
    // Continue with empty conversations
  }

  // Get match queue / encounter count (msg_type 81)
  let likesCount = 0;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const queueResp = await bumblePost(81, {}, token) as any;
    likesCount = queueResp?.body?.[0]?.total_count || queueResp?.body?.[0]?.count || 0;
  } catch {
    // Continue with 0
  }

  let totalConversations = 0;
  let youStarted = 0;
  let youStartedWithReply = 0;
  let theyStarted = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matchSummaries: MatchSummary[] = conversations.map((conv: any) => {
    const chatMsgs = conv.chat_messages || conv.last_messages || [];
    const hasMessages = chatMsgs.length > 0;
    let isYouStarted = false;
    let isTheyReplied = false;

    if (hasMessages) {
      totalConversations++;
      const firstMsg = chatMsgs[0];
      const fromMe = firstMsg?.from_person_id === myId || firstMsg?.is_mine;

      if (fromMe) {
        youStarted++;
        isYouStarted = true;
        const hasReply = chatMsgs.some(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (m: any) => m.from_person_id !== myId && !m.is_mine
        );
        if (hasReply) {
          youStartedWithReply++;
          isTheyReplied = true;
        }
      } else {
        theyStarted++;
      }
    }

    const lastMsg = chatMsgs.length > 0 ? chatMsgs[chatMsgs.length - 1] : null;
    const otherUser = conv.other_user || conv.user || {};

    return {
      id: conv.chat_instance_id || conv.id || "",
      name: otherUser.name || "Unknown",
      photoUrl: otherUser.profile_photo?.large_url || otherUser.photo_url || null,
      messageCount: chatMsgs.length,
      youStarted: isYouStarted,
      theyReplied: isTheyReplied,
      lastMessage: lastMsg?.text || lastMsg?.mssg || null,
      lastMessageDate: lastMsg?.date_created || lastMsg?.timestamp || null,
    };
  });

  const totalMatches = conversations.length;
  const replyRate = youStarted > 0 ? (youStartedWithReply / youStarted) * 100 : null;
  const conversationRate = totalMatches > 0 ? (totalConversations / totalMatches) * 100 : null;

  return {
    platform: "bumble",
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

export const bumbleAdapter: PlatformAdapter = {
  fetchStats: fetchBumbleStats,
  validateToken: async (token) => {
    const { validateBumbleToken } = await import("./auth");
    return validateBumbleToken(token);
  },
};
