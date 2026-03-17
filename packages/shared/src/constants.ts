import type { Platform, PlatformStats, RizzCriterion } from "./types";

export const RIZZ_CRITERIA = {
  matches: { label: "Matches", required: 10, icon: "fire" },
  conversations: { label: "Conversations started with replies", required: 5, icon: "chat" },
  likes: { label: "Likes received", required: 50, icon: "heart" },
} as const;

export function evaluateRizzMaster(stats: PlatformStats): { criteria: RizzCriterion[]; isRizzMaster: boolean } {
  const criteria: RizzCriterion[] = [
    {
      ...RIZZ_CRITERIA.matches,
      actual: stats.totalMatches,
      passed: stats.totalMatches >= RIZZ_CRITERIA.matches.required,
    },
    {
      ...RIZZ_CRITERIA.conversations,
      actual: stats.conversationsStartedWithReply,
      passed: stats.conversationsStartedWithReply >= RIZZ_CRITERIA.conversations.required,
    },
    {
      ...RIZZ_CRITERIA.likes,
      actual: stats.likesYouCount,
      passed: stats.likesYouCount >= RIZZ_CRITERIA.likes.required,
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
      title: "Get your Tinder token",
      steps: [
        "Open tinder.com and log in",
        "Open DevTools (F12)",
        "Go to Console and run:",
        "Copy the result and paste above",
      ],
      code: 'localStorage.getItem("TinderWeb/APIToken")',
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
