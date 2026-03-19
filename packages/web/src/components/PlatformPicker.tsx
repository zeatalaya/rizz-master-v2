"use client";

import type { Platform } from "@rizz/shared";
import { PLATFORM_CONFIGS } from "@rizz/shared";

interface PlatformPickerProps {
  onSelect: (platform: Platform) => void;
}

const PLATFORMS: Platform[] = ["tinder", "bumble", "hinge"];

const PLATFORM_ICONS: Record<Platform, React.ReactNode> = {
  tinder: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
      <path d="M11.7 2c-.1 0-.3.1-.4.2C8 5.3 7.2 7.3 7.8 9.4c.1.3 0 .5-.2.7-.2.1-.5.1-.7 0C5.5 9 4.6 7.2 4.5 5.3c0-.2-.1-.3-.3-.3s-.3.1-.4.2C1.5 8.4.5 12 2.1 15.3c1.5 3 4.7 4.8 8.1 4.7 3.4.1 6.5-1.7 8.1-4.7 1.7-3.4.5-7.1-2-10.1-.6-.7-1.3-1.4-2-2-.1-.1-.2-.2-.4-.2-.1 0-.3.1-.3.3-.1 1.6-.7 3.2-1.7 4.4-.1.1-.2.2-.4.2-.2 0-.3-.1-.4-.2-.4-.6-.5-1.3-.3-2-.1-1.3-.2-2.5-.8-3.5-.1-.1-.2-.2-.3-.2z" />
    </svg>
  ),
  bumble: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-2h2v2zm0-4h-2V7h2v6zm4 4h-2v-2h2v2zm0-4h-2V7h2v6z" />
    </svg>
  ),
  hinge: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
      <path d="M4 4h4v16H4V4zm6 0h4v16h-4V4zm6 0h4v16h-4V4z" opacity="0.6" />
      <path d="M3 10h18v4H3z" />
    </svg>
  ),
};

export default function PlatformPicker({ onSelect }: PlatformPickerProps) {
  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center mb-10">
        <div className="flex items-center justify-center gap-3 mb-1">
          <img src="/smoothly-logo.svg" alt="Smoothly" className="w-10 h-10" />
          <h1 className="text-4xl font-extrabold">
            <span style={{ background: "var(--smoothly-gradient)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Rizz Master
            </span>
          </h1>
        </div>
        <p className="text-gray-500">Choose your platform to check your rizz</p>
      </div>

      <div className="space-y-4">
        {PLATFORMS.map((p) => {
          const config = PLATFORM_CONFIGS[p];
          return (
            <button
              key={p}
              onClick={() => onSelect(p)}
              className="w-full group relative overflow-hidden rounded-2xl border border-white/5 p-6 text-left transition-all duration-300 hover:border-white/15 hover:translate-y-[-2px] active:scale-[0.98]"
              style={{ background: "#1a1a1a" }}
            >
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-15 transition-opacity duration-300"
                style={{ background: config.gradient }}
              />
              <div className="relative flex items-center gap-5">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: config.gradient }}
                >
                  {PLATFORM_ICONS[p]}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">{config.name}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {p === "tinder" && "Phone OTP or token paste"}
                    {p === "bumble" && "Phone OTP or session cookie"}
                    {p === "hinge" && "Phone OTP or Bearer token"}
                  </p>
                </div>
                <div className="ml-auto flex-shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-gray-600 group-hover:text-white transition-colors">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* TEE badge */}
      <div className="flex items-center justify-center gap-2 mt-8 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <span className="text-[10px] text-green-400">Secure TEE — your credentials never leave this server</span>
      </div>
    </div>
  );
}
