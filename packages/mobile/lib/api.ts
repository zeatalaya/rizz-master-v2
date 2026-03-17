/**
 * Mobile API client.
 * Calls the web backend with Bearer token auth instead of cookies.
 */

import * as SecureStore from "expo-secure-store";
import type { Platform, PlatformStats } from "@rizz/shared";

// TODO: Replace with your deployed backend URL
const API_BASE = process.env.EXPO_PUBLIC_API_URL || "https://your-backend.example.com";

const TOKEN_KEY = "rizz_auth_token";
const PLATFORM_KEY = "rizz_platform";

async function getStoredAuth(): Promise<{ token: string; platform: Platform } | null> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  const platform = await SecureStore.getItemAsync(PLATFORM_KEY) as Platform | null;
  if (token && platform) return { token, platform };
  return null;
}

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const auth = await getStoredAuth();
  if (!auth) throw new Error("Not authenticated");

  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${auth.token}`,
      "X-Platform": auth.platform,
      ...init?.headers,
    },
  });
}

export const api = {
  async sendCode(phone: string, platform: Platform) {
    const res = await fetch(`${API_BASE}/api/auth/send-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, platform }),
    });
    return res.json();
  },

  async verifyCode(code: string, phone: string, refreshToken: string, platform: Platform) {
    const res = await fetch(`${API_BASE}/api/auth/verify-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, phone, refreshToken, platform }),
    });
    return res.json();
  },

  async saveToken(token: string, platform: Platform) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(PLATFORM_KEY, platform);
  },

  async clearToken() {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(PLATFORM_KEY);
  },

  async fetchStats(platform: Platform): Promise<PlatformStats> {
    const res = await authedFetch("/api/stats");
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  async checkAuth(): Promise<boolean> {
    const auth = await getStoredAuth();
    return !!auth;
  },

  getStoredAuth,
};
