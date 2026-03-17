export type Platform = "tinder" | "bumble" | "hinge";

export interface DeviceIds {
  deviceId: string;
  appSessionId: string;
  installId: string;
  funnelSessionId: string;
}

export type AuthStep =
  | { step: "otp_sent"; refreshToken: string; phone: string; otpLength: number; smsSent: boolean }
  | { step: "email_required"; refreshToken: string; email: string; otpLength: number }
  | { step: "login_success"; authToken: string; refreshToken: string; userId: string }
  | { step: "captcha_required"; referenceToken: string }
  | { step: "google_needs_email"; refreshToken: string; email: string }
  | { step: "google_no_account"; refreshToken: string; email: string }
  | { step: "error"; message: string };

export interface MatchSummary {
  id: string;
  name: string;
  photoUrl: string | null;
  messageCount: number;
  youStarted: boolean;
  theyReplied: boolean;
  lastMessage: string | null;
  lastMessageDate: string | null;
}

export interface PlatformStats {
  platform: Platform;
  myId: string;
  myName: string;
  totalMatches: number;
  likesYouCount: number;
  totalConversations: number;
  conversationsYouStarted: number;
  conversationsStartedWithReply: number;
  conversationsTheyStarted: number;
  replyRate: number | null;
  conversationRate: number | null;
  matches: MatchSummary[];
}

export interface RizzCriterion {
  label: string;
  required: number;
  actual: number;
  passed: boolean;
  icon: string;
}

export interface AttestationResult {
  quote: string;
  reportDataHex: string;
  timestamp: string;
}
