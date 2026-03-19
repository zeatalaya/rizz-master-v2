"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface BrowserLoginProps {
  onAuthenticated: () => void;
  onBack: () => void;
}

export default function BrowserLogin({ onAuthenticated, onBack }: BrowserLoginProps) {
  const [status, setStatus] = useState<"idle" | "starting" | "active" | "captured" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [frameCount, setFrameCount] = useState(0);
  const lastSeqRef = useRef(0);
  const mountedRef = useRef(true);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; stopPolling(); };
  }, [stopPolling]);

  const startBrowser = useCallback(async () => {
    setStatus("starting");
    setError(null);
    stopPolling();
    try {
      const res = await fetch("/api/auth/browser/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start browser");
      setStatus("active");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start");
      setStatus("error");
    }
  }, [stopPolling]);

  // Fast frame polling via buffered screencast
  useEffect(() => {
    if (status !== "active") return;

    let errorCount = 0;

    const poll = async () => {
      if (!mountedRef.current) return;

      try {
        const res = await fetch("/api/auth/browser/stream");
        if (!res.ok) {
          errorCount++;
          if (errorCount > 10) {
            setError("Browser session lost. Please try again.");
            setStatus("error");
            return;
          }
          pollingRef.current = setTimeout(poll, 500);
          return;
        }

        errorCount = 0;
        const msg = await res.json();

        if (msg.type === "token") {
          setStatus("captured");
          // Fetch user name
          fetch("/api/auth/browser/status")
            .then((r) => r.json())
            .then((d) => { if (d.userName) setUserName(d.userName); })
            .catch(() => {});
          setTimeout(() => onAuthenticated(), 1200);
          return;
        }

        if (msg.type === "frame" && msg.data) {
          // Only render if new frame
          if (msg.seq !== lastSeqRef.current) {
            lastSeqRef.current = msg.seq;
            const canvas = canvasRef.current;
            if (canvas) {
              const ctx = canvas.getContext("2d");
              if (ctx) {
                const img = new Image();
                img.onload = () => {
                  canvas.width = img.width;
                  canvas.height = img.height;
                  ctx.drawImage(img, 0, 0);
                };
                img.src = `data:image/jpeg;base64,${msg.data}`;
              }
            }
            setFrameCount((c) => c + 1);
          }
        }

        // Poll again — 200ms for smooth updates (~5fps)
        pollingRef.current = setTimeout(poll, 200);
      } catch {
        errorCount++;
        if (errorCount > 10) {
          setError("Connection lost. Please try again.");
          setStatus("error");
          return;
        }
        pollingRef.current = setTimeout(poll, 500);
      }
    };

    poll();
    return () => stopPolling();
  }, [status, onAuthenticated, stopPolling]);

  // CDP mouse dispatch
  const sendMouse = async (eventType: string, x: number, y: number, button = "left", clickCount = 0) => {
    fetch("/api/auth/browser/interact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mouse", eventType, x, y, button, clickCount }),
    }).catch(() => {});
  };

  // CDP keyboard dispatch
  const sendKey = async (eventType: string, key: string, code?: string, text?: string) => {
    fetch("/api/auth/browser/interact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "keyboard", eventType, key, code, text }),
    }).catch(() => {});
  };

  const getScaledCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = (canvas.width || 430) / rect.width;
    const scaleY = (canvas.height || 932) / rect.height;
    return {
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top) * scaleY),
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getScaledCoords(e);
    if (!coords) return;
    sendMouse("mousePressed", coords.x, coords.y, "left", 1);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getScaledCoords(e);
    if (!coords) return;
    sendMouse("mouseReleased", coords.x, coords.y, "left");
    // Also focus any input at this position
    fetch("/api/auth/browser/interact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "focus" }),
    }).catch(() => {});
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault();
    if (e.key.length === 1) {
      sendKey("keyDown", e.key, e.code);
      sendKey("char", e.key, e.code, e.key);
    } else {
      sendKey("rawKeyDown", e.key, e.code);
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent) => {
    e.preventDefault();
    sendKey("keyUp", e.key, e.code);
  };

  return (
    <div className="max-w-sm mx-auto">
      <div className="rounded-3xl bg-[#1a1a1a] border border-white/5 p-6">
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, #FD297B 0%, #FF5864 50%, #FF655B 100%)" }}>
            <span className="text-2xl font-bold text-white">T</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 mb-4 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span className="text-[10px] text-green-400">Secure TEE — login happens inside the trusted environment</span>
        </div>

        {status === "idle" && (
          <div className="space-y-4">
            <div className="text-center mb-2">
              <h2 className="text-lg font-bold text-white">Login via Browser</h2>
              <p className="text-gray-500 text-xs mt-1">
                A secure browser opens Tinder inside the TEE. Complete the login flow and your token is captured automatically.
              </p>
            </div>
            <button
              onClick={startBrowser}
              className="w-full py-3.5 rounded-xl font-semibold text-white transition-all active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #FD297B 0%, #FF5864 50%, #FF655B 100%)" }}
            >
              Open Tinder Login
            </button>
            <button onClick={onBack} className="w-full text-xs text-gray-500 hover:text-gray-300 transition-colors">
              Back
            </button>
          </div>
        )}

        {status === "starting" && (
          <div className="text-center py-8">
            <div className="w-12 h-12 mx-auto border-2 border-pink-500/30 border-t-pink-500 rounded-full animate-spin mb-4" />
            <p className="text-gray-400 text-sm">Starting secure browser...</p>
            <p className="text-gray-600 text-xs mt-1">This may take a few seconds</p>
          </div>
        )}

        {status === "active" && (
          <div className="space-y-3">
            <p className="text-gray-400 text-xs text-center">
              Click and type below to complete the Tinder login.
              {frameCount === 0 && " Loading..."}
            </p>
            <div
              className="relative rounded-xl overflow-hidden border border-white/10 focus:outline-none focus:ring-2 focus:ring-pink-500/50"
              tabIndex={0}
              onKeyDown={handleKeyDown}
              onKeyUp={handleKeyUp}
            >
              <canvas
                ref={canvasRef}
                className="w-full cursor-pointer"
                style={{ imageRendering: "auto", aspectRatio: "1280/800", background: "#111" }}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
              />
              {frameCount === 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#111]">
                  <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                </div>
              )}
            </div>
            <p className="text-gray-600 text-[10px] text-center">
              Click the area above, then type to enter text. Your token is captured automatically.
            </p>
            <button
              onClick={() => { stopPolling(); onBack(); }}
              className="w-full text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {status === "captured" && (
          <div className="text-center py-6 space-y-3">
            <div className="w-16 h-16 mx-auto rounded-full bg-green-500/10 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-white">
              {userName ? `Welcome, ${userName}!` : "You're in!"}
            </h2>
            <p className="text-gray-500 text-xs">Token captured securely. Fetching your stats...</p>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
              {error}
            </div>
            <button
              onClick={startBrowser}
              className="w-full py-3 rounded-xl font-semibold text-white transition-all active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #FD297B 0%, #FF5864 50%, #FF655B 100%)" }}
            >
              Try again
            </button>
            <button onClick={onBack} className="w-full text-xs text-gray-500 hover:text-gray-300 transition-colors">
              Back to login options
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
