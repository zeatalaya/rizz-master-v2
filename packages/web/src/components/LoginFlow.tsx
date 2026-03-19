"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Platform } from "@rizz/shared";
import { PLATFORM_CONFIGS } from "@rizz/shared";
import BrowserLogin from "./BrowserLogin";

interface LoginFlowProps {
  platform: Platform;
  onAuthenticated: () => void;
  onBack: () => void;
}

type Step = "phone" | "captcha" | "otp" | "email_otp" | "verifying" | "token" | "browser";

interface AuthState {
  refreshToken: string;
  phone: string;
  otpLength: number;
  email?: string;
  captchaSiteKey?: string;
  deviceIds?: {
    deviceId: string;
    appSessionId: string;
    installId: string;
    funnelSessionId: string;
  };
}

export default function LoginFlow({ platform, onAuthenticated, onBack }: LoginFlowProps) {
  const config = PLATFORM_CONFIGS[platform];
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const [manualToken, setManualToken] = useState("");
  const [emailRetries, setEmailRetries] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  const captchaSentRef = useRef(false);

  const startCooldown = (seconds: number) => {
    setResendCooldown(seconds);
    const timer = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const sendCode = async (isResend = false) => {
    const cleaned = phone.replace(/[\s()\-+]/g, "");
    if (cleaned.length < 10) {
      setError("Enter a valid phone number with country code");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.startsWith("+") ? phone : `+${phone}`,
          platform,
          deviceIds: authState?.deviceIds,
        }),
      });
      const data = await res.json();

      if (!res.ok || data.step === "error") {
        if (isResend && step === "otp") {
          setError("Resend failed — check your messages, the code may already be on its way.");
          startCooldown(60);
          return;
        }
        throw new Error(data.error || "Failed to send code");
      }

      // Hinge returns captcha_required — show reCAPTCHA widget
      if (data.step === "captcha_required") {
        setAuthState({
          refreshToken: "",
          phone: data.phone || phone,
          otpLength: 6,
          captchaSiteKey: data.referenceToken,
          deviceIds: data._deviceIds,
        });
        setStep("captcha");
        return;
      }

      setAuthState({
        refreshToken: data.refreshToken || "",
        phone: data.phone || phone,
        otpLength: data.otpLength || 6,
        deviceIds: data._deviceIds,
      });
      setCode("");
      setStep("otp");
      startCooldown(30);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (type: "phone" | "email" = "phone") => {
    if (!code.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          type: type === "email" ? "email" : "phone",
          phone: authState?.phone || phone,
          email: authState?.email,
          refreshToken: authState?.refreshToken,
          deviceIds: authState?.deviceIds,
          platform,
        }),
      });
      const data = await res.json();

      if (!res.ok || data.step === "error") {
        if (type === "email") {
          const retries = emailRetries + 1;
          setEmailRetries(retries);
          if (retries >= 2) {
            setError("Email verification failed. Try using token paste instead.");
            setStep("token");
            return;
          }
        }
        throw new Error(data.error || "Verification failed");
      }

      if (data.step === "login_success") {
        setStep("verifying");
        setTimeout(() => onAuthenticated(), 800);
        return;
      }

      if (data.step === "email_required") {
        setAuthState((prev) => ({
          ...prev!,
          refreshToken: data.refreshToken || prev?.refreshToken || "",
          email: data.email,
          otpLength: data.otpLength || 6,
        }));
        setCode("");
        setEmailRetries(0);
        setStep("email_otp");
        return;
      }

      if (data.step === "otp_sent") {
        setAuthState((prev) => ({
          ...prev!,
          refreshToken: data.refreshToken || prev?.refreshToken || "",
        }));
        setError("Code was incorrect. A new code has been sent.");
        setCode("");
        return;
      }

      throw new Error("Unexpected response");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const submitManualToken = async () => {
    const cleaned = manualToken.trim().replace(/^["']+|["']+$/g, "").trim();
    if (!cleaned) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/set-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: cleaned, platform }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onAuthenticated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid token");
    } finally {
      setLoading(false);
    }
  };

  const tokenPlaceholder = platform === "tinder" ? "Paste your X-Auth-Token here"
    : platform === "bumble" ? "Paste your session cookie here"
    : "Paste your Bearer token here";

  // Browser login is rendered standalone (has its own card)
  if (step === "browser") {
    return (
      <BrowserLogin
        onAuthenticated={onAuthenticated}
        onBack={() => { setStep("phone"); setError(null); }}
      />
    );
  }

  return (
    <div className="max-w-sm mx-auto">
      <div className="rounded-3xl bg-[#1a1a1a] border border-white/5 p-8">
        {/* Platform icon */}
        <div className="flex justify-center mb-5">
          <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: config.gradient }}>
            <span className="text-2xl font-bold text-white">{config.name[0]}</span>
          </div>
        </div>

        {/* TEE badge */}
        <div className="flex items-center justify-center gap-2 mb-5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span className="text-[10px] text-green-400">Secure TEE — your credentials never leave this server</span>
        </div>

        {/* STEP 1: Phone number */}
        {step === "phone" && (
          <div className="space-y-4">
            <div className="text-center mb-4">
              <h2 className="text-lg font-bold text-white">Verify your identity</h2>
              <p className="text-gray-500 text-xs mt-1">
                Enter your {config.name} phone number to get started
              </p>
            </div>

            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendCode()}
              placeholder="+1 (555) 123-4567"
              className="w-full px-4 py-3.5 rounded-xl bg-[#111] border border-white/10 text-white placeholder-gray-600 focus:outline-none focus:border-white/30 text-center text-lg tracking-wide"
              style={{ caretColor: config.primaryColor }}
              autoFocus
            />

            <button
              onClick={() => sendCode()}
              disabled={loading || !phone.trim()}
              className="w-full py-3.5 rounded-xl font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
              style={{ background: config.gradient }}
            >
              {loading ? <Spinner text="Sending code..." /> : "Send verification code"}
            </button>

            <p className="text-[10px] text-gray-600 text-center">
              We&apos;ll send a code to this number via {config.name}.
            </p>

            <div className="flex justify-between">
              <button
                onClick={onBack}
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
              >
                Change platform
              </button>
              <button
                onClick={() => { setStep("token"); setError(null); }}
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
              >
                Use token paste instead
              </button>
            </div>

            {platform === "tinder" && (
              <div className="text-center pt-1">
                <button
                  onClick={() => { setStep("browser"); setError(null); }}
                  className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
                >
                  Or login via browser
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 1b: reCAPTCHA (Hinge Firebase auth) */}
        {step === "captcha" && authState?.captchaSiteKey && (
          <div className="space-y-4">
            <div className="text-center mb-4">
              <h2 className="text-lg font-bold text-white">One more step</h2>
              <p className="text-gray-500 text-xs mt-1">
                Complete the verification to receive your SMS code
              </p>
            </div>

            <RecaptchaWidget
              siteKey={authState.captchaSiteKey}
              onSolved={async (token) => {
                if (captchaSentRef.current) return; // Prevent double submission
                captchaSentRef.current = true;
                setLoading(true);
                setError(null);
                try {
                  const res = await fetch("/api/auth/send-code", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      phone: phone.startsWith("+") ? phone : `+${phone}`,
                      platform,
                      deviceIds: authState.deviceIds,
                      recaptchaToken: token,
                    }),
                  });
                  const data = await res.json();
                  if (!res.ok || data.step === "error") {
                    throw new Error(data.error || "Failed to send SMS");
                  }
                  setAuthState((prev) => ({
                    ...prev!,
                    refreshToken: data.refreshToken || "",
                    otpLength: data.otpLength || 6,
                  }));
                  setCode("");
                  setStep("otp");
                  startCooldown(30);
                } catch (err) {
                  captchaSentRef.current = false; // Allow retry
                  setError(err instanceof Error ? err.message : "Failed to send code");
                } finally {
                  setLoading(false);
                }
              }}
            />

            {loading && (
              <div className="flex justify-center py-2">
                <Spinner text="Sending SMS..." />
              </div>
            )}

            <button
              onClick={() => { setStep("phone"); setError(null); captchaSentRef.current = false; }}
              className="w-full text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Go back
            </button>
          </div>
        )}

        {/* STEP 2: SMS OTP */}
        {step === "otp" && (
          <div className="space-y-4">
            <div className="text-center mb-4">
              <h2 className="text-lg font-bold text-white">Enter your code</h2>
              <p className="text-gray-500 text-xs mt-1">
                We sent a {authState?.otpLength || 6}-digit code to{" "}
                <span className="text-gray-300">{authState?.phone || phone}</span>
              </p>
            </div>

            <input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, authState?.otpLength || 6))}
              onKeyDown={(e) => e.key === "Enter" && verifyCode("phone")}
              placeholder={"0".repeat(authState?.otpLength || 6)}
              className="w-full px-4 py-3.5 rounded-xl bg-[#111] border border-white/10 text-white placeholder-gray-600 focus:outline-none focus:border-white/30 text-center text-2xl tracking-[0.5em] font-mono"
              autoFocus
              maxLength={authState?.otpLength || 6}
            />

            <button
              onClick={() => verifyCode("phone")}
              disabled={loading || code.length < (authState?.otpLength || 6)}
              className="w-full py-3.5 rounded-xl font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
              style={{ background: config.gradient }}
            >
              {loading ? <Spinner text="Verifying..." /> : "Verify"}
            </button>

            <p className="text-[10px] text-gray-600 text-center">
              SMS may take up to 60 seconds.
            </p>

            <div className="flex justify-between">
              <button
                onClick={() => { setStep("phone"); setError(null); setCode(""); }}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Change number
              </button>
              <button
                onClick={() => { setCode(""); sendCode(true); }}
                disabled={loading || resendCooldown > 0}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-40"
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
              </button>
            </div>

            <div className="text-center pt-1">
              <button
                onClick={() => { setStep("token"); setError(null); }}
                className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
              >
                SMS not arriving? Use token instead
              </button>
            </div>
          </div>
        )}

        {/* STEP 2b: Email OTP (Tinder-specific) */}
        {step === "email_otp" && (
          <div className="space-y-4">
            <div className="text-center mb-4">
              <h2 className="text-lg font-bold text-white">Email verification</h2>
              <p className="text-gray-500 text-xs mt-1">
                {config.name} sent a code to{" "}
                <span className="text-gray-300">{authState?.email || "your email"}</span>
              </p>
            </div>

            <input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, authState?.otpLength || 6))}
              onKeyDown={(e) => e.key === "Enter" && verifyCode("email")}
              placeholder={"0".repeat(authState?.otpLength || 6)}
              className="w-full px-4 py-3.5 rounded-xl bg-[#111] border border-white/10 text-white placeholder-gray-600 focus:outline-none focus:border-white/30 text-center text-2xl tracking-[0.5em] font-mono"
              autoFocus
              maxLength={authState?.otpLength || 6}
            />

            <button
              onClick={() => verifyCode("email")}
              disabled={loading || code.length < (authState?.otpLength || 6)}
              className="w-full py-3.5 rounded-xl font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
              style={{ background: config.gradient }}
            >
              {loading ? <Spinner text="Verifying..." /> : "Verify email code"}
            </button>

            <button
              onClick={() => { setStep("phone"); setError(null); setCode(""); }}
              className="w-full text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Start over
            </button>
          </div>
        )}

        {/* Success animation */}
        {step === "verifying" && (
          <div className="space-y-5">
            <div className="text-center">
              <h2 className="text-lg font-bold text-white mb-2">You&apos;re in!</h2>
              <p className="text-gray-500 text-xs">Securely fetching your {config.name} stats...</p>
            </div>
            <div className="flex justify-center py-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-2 border-green-500 border-t-transparent animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Token paste */}
        {step === "token" && (
          <div className="space-y-4">
            <div className="text-center mb-4">
              <h2 className="text-lg font-bold text-white">{config.tokenInstructions.title}</h2>
              <p className="text-gray-500 text-xs mt-1">
                Log in to {config.name} in your own browser, then paste your token here
              </p>
            </div>

            <input
              type="text"
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitManualToken()}
              placeholder={tokenPlaceholder}
              className="w-full px-4 py-3.5 rounded-xl bg-[#111] border border-white/10 text-white placeholder-gray-600 focus:outline-none focus:border-white/30 text-center text-sm font-mono"
              autoFocus
            />

            <button
              onClick={submitManualToken}
              disabled={loading || !manualToken.trim()}
              className="w-full py-3.5 rounded-xl font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
              style={{ background: config.gradient }}
            >
              {loading ? <Spinner text="Verifying..." /> : "Connect"}
            </button>

            <div className="rounded-xl bg-[#111] border border-white/10 p-4 text-left space-y-2">
              <p className="text-[11px] text-gray-300 font-medium">How to get your token:</p>
              <ol className="text-[11px] text-gray-500 space-y-1.5 list-decimal list-inside">
                {config.tokenInstructions.steps.map((s, i) => (
                  <li key={i}><span className="text-gray-400">{s}</span></li>
                ))}
              </ol>
              {config.tokenInstructions.code && (
                <div className="bg-black/30 rounded-lg p-2 mt-1 relative group">
                  <code className="text-[10px] text-green-400 font-mono break-all select-all">
                    {config.tokenInstructions.code}
                  </code>
                  <button
                    onClick={() => navigator.clipboard?.writeText(config.tokenInstructions.code || "")}
                    className="absolute top-1 right-1 p-1 rounded bg-white/5 hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Copy command"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            <div className="flex justify-between">
              <button
                onClick={onBack}
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
              >
                Change platform
              </button>
              {platform === "tinder" && (
                <button
                  onClick={() => { setStep("browser"); setError(null); }}
                  className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
                >
                  Use browser login
                </button>
              )}
            </div>
            <button
              onClick={() => { setStep("phone"); setError(null); setManualToken(""); }}
              className="w-full text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Try phone OTP instead
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function RecaptchaWidget({ siteKey, onSolved }: { siteKey: string; onSolved: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef(false);

  const handleSolved = useCallback((token: string) => {
    onSolved(token);
  }, [onSolved]);

  useEffect(() => {
    if (renderedRef.current) return;
    renderedRef.current = true;

    const cbName = `__recaptchaCb_${Date.now()}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any)[cbName] = handleSolved;

    const existingScript = document.querySelector('script[src*="recaptcha/api.js"]');
    if (!existingScript) {
      const script = document.createElement("script");
      script.src = "https://www.google.com/recaptcha/api.js?render=explicit";
      script.async = true;
      document.head.appendChild(script);
      script.onload = () => tryRender();
    } else {
      setTimeout(tryRender, 200);
    }

    function tryRender() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = (window as any).grecaptcha;
      if (g?.render && containerRef.current) {
        try {
          g.render(containerRef.current, {
            sitekey: siteKey,
            callback: cbName,
            theme: "dark",
          });
        } catch {
          // already rendered
        }
      } else {
        setTimeout(tryRender, 500);
      }
    }

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any)[cbName];
    };
  }, [siteKey, handleSolved]);

  return (
    <div className="flex justify-center py-2">
      <div ref={containerRef} />
    </div>
  );
}

function Spinner({ text }: { text: string }) {
  return (
    <span className="flex items-center justify-center gap-2">
      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      {text}
    </span>
  );
}

