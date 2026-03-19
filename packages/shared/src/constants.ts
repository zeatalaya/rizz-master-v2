import type { Platform, PlatformStats, RizzCriterion } from "./types";

export const RIZZ_CRITERIA = {
  matches: { label: "Matches", required: 40, icon: "fire" },
  conversations: { label: "Conversations started", required: 18, icon: "chat" },
  replyRate: { label: "Reply rate", required: 35, icon: "heart", isPercentage: true },
} as const;

export function evaluateRizzMaster(stats: PlatformStats): { criteria: RizzCriterion[]; isRizzMaster: boolean } {
  const replyRate = stats.replyRate ?? 0;
  const criteria: RizzCriterion[] = [
    {
      ...RIZZ_CRITERIA.matches,
      actual: stats.totalMatches,
      passed: stats.totalMatches >= RIZZ_CRITERIA.matches.required,
    },
    {
      ...RIZZ_CRITERIA.conversations,
      actual: stats.conversationsYouStarted,
      passed: stats.conversationsYouStarted >= RIZZ_CRITERIA.conversations.required,
    },
    {
      ...RIZZ_CRITERIA.replyRate,
      actual: Math.round(replyRate),
      passed: replyRate >= RIZZ_CRITERIA.replyRate.required,
    },
  ];

  return { criteria, isRizzMaster: criteria.every((c) => c.passed) };
}

export interface PlatformConfig {
  name: string;
  gradient: string;
  primaryColor: string;
  secondaryColor: string;
  bgColor: string;
  tokenInstructions: TokenInstructions;
}

export interface TokenInstructions {
  title: string;
  steps: string[];
  code?: string;
}

export const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  tinder: {
    name: "Tinder",
    gradient: "linear-gradient(135deg, #FD297B 0%, #FF5864 50%, #FF655B 100%)",
    primaryColor: "#FD297B",
    secondaryColor: "#FF5864",
    bgColor: "#FD297B",
    tokenInstructions: {
      title: "Paste your Tinder token",
      steps: [
        "Open tinder.com in your browser and log in",
        "Press F12 (or \u2318+Option+I on Mac) to open DevTools",
        "Go to the Console tab and paste the command below",
        "Copy the token value and paste it above",
      ],
      code: `(async()=>{let t=localStorage.getItem("TinderWeb/APIToken");if(t)return t;return new Promise(r=>{let q=indexedDB.open("keyval-store");q.onsuccess=()=>{let s=q.result.transaction("keyval","readonly").objectStore("keyval").get("persist::mfa");s.onsuccess=()=>{let d=s.result;r(d?.authToken||"not found")};s.onerror=()=>r("not found")};q.onerror=()=>r("not found")})})()`,
    },
  },
  bumble: {
    name: "Bumble",
    gradient: "linear-gradient(135deg, #FFC629 0%, #F5A623 100%)",
    primaryColor: "#FFC629",
    secondaryColor: "#F5A623",
    bgColor: "#FFC629",
    tokenInstructions: {
      title: "Get your Bumble session",
      steps: [
        "Open bumble.com and log in",
        "Open DevTools (F12) → Application tab",
        'Find Cookies → bumble.com → "session"',
        "Copy the session value and paste above",
      ],
    },
  },
  hinge: {
    name: "Hinge",
    gradient: "linear-gradient(135deg, #1A1A1A 0%, #333333 100%)",
    primaryColor: "#000000",
    secondaryColor: "#333333",
    bgColor: "#1A1A1A",
    tokenInstructions: {
      title: "Get your Hinge token",
      steps: [
        "Use an HTTP proxy (e.g., Charles/mitmproxy) on your phone",
        "Open Hinge app and perform any action",
        'Find a request to prod-api.hingeaws.net with "Authorization: Bearer ..."',
        "Copy the Bearer token and paste above",
      ],
    },
  },
};
