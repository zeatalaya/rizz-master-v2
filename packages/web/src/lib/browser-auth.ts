/**
 * Puppeteer-based Tinder web auth.
 * Opens a real browser so user can complete login (including CAPTCHAs).
 * Captures the auth token from localStorage after successful login.
 */

import type { Browser, Page } from "puppeteer-core";

import type { CDPSession } from "puppeteer-core";

interface BrowserSession {
  browser: Browser;
  page: Page;
  cdp: CDPSession | null;
  token: string | null;
  status: "starting" | "ready" | "phone_entered" | "otp_page" | "captcha" | "logged_in" | "error";
  error: string | null;
  createdAt: number;
  screencastActive: boolean;
  latestFrame: string | null; // base64 JPEG from screencast
  frameSeq: number;
}

// Use globalThis to survive module reloads in dev mode
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;
if (!g.__browserSessions) g.__browserSessions = new Map<string, BrowserSession>();
const sessions: Map<string, BrowserSession> = g.__browserSessions;

const TINDER_URL = "https://tinder.com";
const TOKEN_KEY = "TinderWeb/APIToken";
const SESSION_TTL = 5 * 60 * 1000; // 5 minutes

// Cleanup stale sessions
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL) {
      session.browser.close().catch(() => {});
      sessions.delete(id);
    }
  }
}, 60_000);

function getExecPath(): string {
  // Docker container has chromium at /usr/bin/chromium
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  // macOS local dev
  const paths = [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  for (const p of paths) {
    try {
      require("fs").accessSync(p);
      return p;
    } catch { /* continue */ }
  }
  return "chromium";
}

export async function startSession(sessionId: string): Promise<{ status: string }> {
  // Close existing session if any
  const existing = sessions.get(sessionId);
  if (existing) {
    await existing.browser.close().catch(() => {});
    sessions.delete(sessionId);
  }

  const puppeteerCore = await import("puppeteer-core");

  // Parse residential proxy from env
  const proxyUrl = process.env.PROXY_URL; // format: http://username:password@hostname:port
  let proxyAuth: { username: string; password: string } | null = null;
  let proxyServer = "";
  if (proxyUrl) {
    try {
      const parsed = new URL(proxyUrl);
      proxyAuth = { username: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password) };
      proxyServer = `${parsed.protocol}//${parsed.hostname}:${parsed.port}`;
      console.log("[browser-auth] Using residential proxy:", proxyServer);
    } catch (e) {
      console.error("[browser-auth] Failed to parse PROXY_URL:", e);
    }
  }

  const launchArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--window-size=1280,800",
    // Stealth flags to avoid headless detection
    "--disable-blink-features=AutomationControlled",
    "--disable-web-security",
    "--use-gl=angle",
    "--use-angle=swiftshader-webgl",
    // Performance: reduce memory usage
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-sync",
    "--disable-translate",
    "--metrics-recording-only",
    "--no-first-run",
  ];

  // Add proxy if configured
  if (proxyServer) {
    launchArgs.push(`--proxy-server=${proxyServer}`);
  }

  const browser = await puppeteerCore.default.launch({
    executablePath: getExecPath(),
    headless: "new" as unknown as boolean,
    args: launchArgs,
  });

  const page = await browser.newPage();

  // Authenticate with proxy if credentials are available
  if (proxyAuth) {
    await page.authenticate(proxyAuth);
  }

  // Block unnecessary resources for faster page load
  await page.setRequestInterception(true);
  page.on("request", (req: import("puppeteer-core").HTTPRequest) => {
    const url = req.url();
    const resourceType = req.resourceType();

    // Block analytics, ads, tracking, and heavy assets we don't need
    const blockedDomains = [
      "google-analytics.com",
      "googletagmanager.com",
      "facebook.com",
      "facebook.net",
      "fbcdn.net",
      "doubleclick.net",
      "googlesyndication.com",
      "branch.io",
      "branchster.link",
      "sentry.io",
      "amplitude.com",
      "appsflyer.com",
      "adjust.com",
      "hotjar.com",
      "intercom.io",
      "newrelic.com",
      "segment.com",
      "mixpanel.com",
      "fullstory.com",
      "onesignal.com",
    ];

    if (blockedDomains.some(d => url.includes(d))) {
      req.abort().catch(() => {});
      return;
    }

    // Block non-essential resource types
    if (["media", "font"].includes(resourceType)) {
      req.abort().catch(() => {});
      return;
    }

    req.continue().catch(() => {});
  });

  // Stealth: override navigator.webdriver + enhanced fingerprint spoofing
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });

    // Override chrome runtime
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).chrome = { runtime: {} };

    // Override permissions query
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters: PermissionDescriptor) =>
      parameters.name === "notifications"
        ? Promise.resolve({ state: "denied" } as PermissionStatus)
        : originalQuery(parameters);

    // Spoof navigator.languages
    Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });

    // Spoof navigator.plugins to have a non-empty array
    Object.defineProperty(navigator, "plugins", {
      get: () => {
        const arr = [
          { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer", description: "Portable Document Format", length: 1 },
          { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai", description: "", length: 1 },
          { name: "Native Client", filename: "internal-nacl-plugin", description: "", length: 2 },
        ];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (arr as any).item = (i: number) => arr[i] || null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (arr as any).namedItem = (name: string) => arr.find(p => p.name === name) || null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (arr as any).refresh = () => {};
        return arr;
      },
    });

    // Spoof hardwareConcurrency
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });

    // Spoof maxTouchPoints
    Object.defineProperty(navigator, "maxTouchPoints", { get: () => 5 });

    // Spoof WebGL to hide SwiftShader
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (parameter: number) {
      if (parameter === 37445) return "Apple Inc.";
      if (parameter === 37446) return "Apple GPU";
      return getParameter.call(this, parameter);
    };
    const getParameter2 = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function (parameter: number) {
      if (parameter === 37445) return "Apple Inc.";
      if (parameter === 37446) return "Apple GPU";
      return getParameter2.call(this, parameter);
    };
  });

  // Desktop viewport — desktop Chrome is more common and less suspicious in headless
  await page.setViewport({ width: 1280, height: 800, isMobile: false, deviceScaleFactor: 1 });
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
  );

  // Create CDP session for screencast
  const cdp = await page.createCDPSession();

  const session: BrowserSession = {
    browser,
    page,
    cdp,
    token: null,
    status: "starting",
    error: null,
    createdAt: Date.now(),
    screencastActive: false,
    latestFrame: null,
    frameSeq: 0,
  };
  sessions.set(sessionId, session);

  // Start CDP screencast immediately — buffers latest frame for fast polling
  startScreencastBuffering(session);

  // Monitor for token in localStorage and network
  page.on("response", async (res: import("puppeteer-core").HTTPResponse) => {
    try {
      const url = res.url();
      if (url.includes("api.gotinder.com")) {
        const headers = res.headers();
        // Some endpoints return the token in response
        if (headers["x-auth-token"]) {
          session.token = headers["x-auth-token"];
          session.status = "logged_in";
          console.log("[browser-auth] Token captured from response header");
        }
      }
    } catch { /* ignore */ }
  });

  // Navigate to Tinder — don't block on startSession, let it run in background
  // so the user sees the stream immediately while the page loads
  session.status = "ready";

  // Log browser console and errors for debugging
  page.on("console", (msg: import("puppeteer-core").ConsoleMessage) => {
    if (msg.type() === "error") {
      console.log("[browser-console] ERROR:", msg.text().substring(0, 200));
    }
  });
  page.on("pageerror", (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.log("[browser-pageerror]", msg.substring(0, 200));
  });

  // Run navigation in background (non-blocking)
  (async () => {
    try {
      console.log("[browser-auth] Navigating to", TINDER_URL);
      const startTime = Date.now();
      await page.goto(TINDER_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
      console.log(`[browser-auth] DOM loaded in ${Date.now() - startTime}ms`);

      // Wait for SPA to render — look for login-related content or interactive elements
      try {
        await page.waitForFunction(() => {
          const body = document.body?.textContent || "";
          // Check for login page content (direct /app/login URL)
          return body.includes("phone number") ||
                 body.includes("Log in") ||
                 body.includes("Create account") ||
                 body.includes("Get Started") ||
                 document.querySelectorAll('input').length > 0;
        }, { timeout: 15000 });
        console.log(`[browser-auth] SPA rendered in ${Date.now() - startTime}ms`);
      } catch {
        console.log("[browser-auth] SPA render timeout — user can interact manually");
      }

      // Auto-dismiss cookie consent
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
        const acceptBtn = buttons.find(b => /i accept|accept all|agree/i.test(b.textContent || ""));
        if (acceptBtn) (acceptBtn as HTMLElement).click();
      }).catch(() => {});

      // Remove overlays (Google One Tap, etc.)
      await page.evaluate(() => {
        document.querySelectorAll('iframe[src*="accounts.google.com"]').forEach(el => el.remove());
        document.querySelectorAll('#credential_picker_container, #credential_picker_iframe').forEach(el => el.remove());
      }).catch(() => {});

      // If we're on the login page, try to auto-click "Log in with phone number"
      await new Promise(r => setTimeout(r, 500));
      await page.evaluate(() => {
        // Remove overlays again
        document.querySelectorAll('iframe[src*="accounts.google.com"]').forEach(el => el.remove());

        const allElements = Array.from(document.querySelectorAll('a, button, div[role="button"], span'));
        const phoneBtn = allElements.find(el => {
          const text = el.textContent?.trim().toLowerCase() || "";
          return text.includes("phone number") || text.includes("log in with phone");
        });
        if (phoneBtn) {
          let clickTarget: HTMLElement = phoneBtn as HTMLElement;
          let parent = phoneBtn.parentElement;
          while (parent && parent !== document.body) {
            const tag = parent.tagName.toLowerCase();
            if (tag === "button" || tag === "a" || parent.getAttribute("role") === "button") {
              clickTarget = parent;
              break;
            }
            parent = parent.parentElement;
          }
          clickTarget.click();
        }
      }).catch(() => {});

      console.log(`[browser-auth] Navigation complete in ${Date.now() - startTime}ms`);
    } catch (err) {
      console.error("[browser-auth] Navigation error:", err instanceof Error ? err.message : "unknown");
    }
  })();

  console.log("[browser-auth] Session ready, navigation running in background");

  return { status: session.status };
}

function startScreencastBuffering(session: BrowserSession) {
  if (!session.cdp || session.screencastActive) return;

  const cdp = session.cdp;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cdp.on("Page.screencastFrame", (params: any) => {
    // ACK immediately
    cdp.send("Page.screencastFrameAck", { sessionId: params.sessionId }).catch(() => {});
    // Buffer latest frame
    session.latestFrame = params.data;
    session.frameSeq++;
    // Check for token periodically (every 5th frame)
    if (session.frameSeq % 5 === 0) {
      checkToken(session);
    }
  });

  cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 55,
    maxWidth: 1280,
    maxHeight: 800,
    everyNthFrame: 1,
  }).then(() => {
    session.screencastActive = true;
    console.log("[browser-auth] Screencast buffering started");
  }).catch((err) => {
    console.error("[browser-auth] Screencast start failed:", err);
  });
}

export function getLatestFrame(sessionId: string): { frame: string | null; seq: number; token: string | null } {
  const session = sessions.get(sessionId);
  if (!session) return { frame: null, seq: 0, token: null };
  return { frame: session.latestFrame, seq: session.frameSeq, token: session.token };
}

export async function getScreenshot(sessionId: string): Promise<Buffer | null> {
  const session = sessions.get(sessionId);
  if (!session) return null;

  try {
    // Check for token in localStorage and IndexedDB before screenshot
    const token = await session.page.evaluate((key) => {
      try {
        // Method 1: localStorage (older Tinder web versions)
        const lsToken = localStorage.getItem(key);
        if (lsToken) return lsToken;
      } catch { /* ignore */ }

      // Method 2: IndexedDB (current Tinder web stores token in keyval-store)
      return new Promise<string | null>((resolve) => {
        try {
          const req = indexedDB.open("keyval-store");
          req.onsuccess = () => {
            try {
              const db = req.result;
              const tx = db.transaction("keyval", "readonly");
              const store = tx.objectStore("keyval");
              const getReq = store.get("persist::mfa");
              getReq.onsuccess = () => {
                try {
                  const data = getReq.result;
                  if (data?.authToken) resolve(data.authToken);
                  else if (typeof data === "string") {
                    const parsed = JSON.parse(data);
                    if (parsed?.authToken) resolve(parsed.authToken);
                    else resolve(null);
                  } else resolve(null);
                } catch { resolve(null); }
              };
              getReq.onerror = () => resolve(null);
            } catch { resolve(null); }
          };
          req.onerror = () => resolve(null);
          // Timeout after 500ms
          setTimeout(() => resolve(null), 500);
        } catch { resolve(null); }
      });
    }, TOKEN_KEY);

    if (token) {
      session.token = token;
      session.status = "logged_in";
      console.log("[browser-auth] Token captured from browser storage");
    }

    return (await session.page.screenshot({
      type: "jpeg",
      quality: 80,
      encoding: "binary",
    })) as Buffer;
  } catch {
    return null;
  }
}

export async function clickAt(sessionId: string, x: number, y: number): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) return;
  // Use mouse click for coordinate-based clicks (works for inputs and general UI)
  await session.page.mouse.click(x, y);
  // Wait for any navigation/state change
  await new Promise(r => setTimeout(r, 1000));
}

export async function clickText(sessionId: string, text: string): Promise<boolean> {
  const session = sessions.get(sessionId);
  if (!session) return false;

  // Strategy 1: Find element and dispatch a real click() + touch events via JS
  const clicked = await session.page.evaluate((searchText: string) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const content = node.textContent?.trim() || "";
      if (content.toLowerCase().includes(searchText.toLowerCase())) {
        // Walk up to find the clickable ancestor (button, a, or role=button)
        let el = node.parentElement;
        while (el && el !== document.body) {
          const tag = el.tagName.toLowerCase();
          const role = el.getAttribute("role");
          if (tag === "button" || tag === "a" || role === "button" || el.onclick) {
            break;
          }
          el = el.parentElement;
        }
        if (!el || el === document.body) el = node.parentElement;
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            // Dispatch touch events (Tinder mobile uses touch listeners)
            const touchStart = new TouchEvent("touchstart", {
              bubbles: true,
              cancelable: true,
              touches: [new Touch({ identifier: 1, target: el, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 })],
            });
            const touchEnd = new TouchEvent("touchend", {
              bubbles: true,
              cancelable: true,
              changedTouches: [new Touch({ identifier: 1, target: el, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 })],
            });
            el.dispatchEvent(touchStart);
            el.dispatchEvent(touchEnd);
            // Also fire click as fallback
            el.click();
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, found: true };
          }
        }
      }
    }
    return null;
  }, text);

  if (clicked) {
    // Also fire a mouse click as backup (touchscreen.tap can hang in headless)
    await session.page.mouse.click(clicked.x, clicked.y);
    await new Promise(r => setTimeout(r, 2000));
    return true;
  }
  return false;
}

export async function scrollPage(sessionId: string, direction: "up" | "down"): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) return;
  await session.page.evaluate((dir: string) => {
    window.scrollBy(0, dir === "down" ? 300 : -300);
  }, direction);
  await new Promise(r => setTimeout(r, 300));
}

export async function focusInput(sessionId: string, placeholder?: string): Promise<boolean> {
  const session = sessions.get(sessionId);
  if (!session) return false;

  const focused = await session.page.evaluate((ph: string | undefined) => {
    // Find input by placeholder or just the first visible text/tel/number input
    const inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="tel"], input[type="number"], input:not([type])'));
    let target: HTMLInputElement | null = null;

    if (ph) {
      target = inputs.find(el => {
        const input = el as HTMLInputElement;
        return input.placeholder?.toLowerCase().includes(ph.toLowerCase()) ||
               input.getAttribute("aria-label")?.toLowerCase().includes(ph.toLowerCase());
      }) as HTMLInputElement | null;
    }

    if (!target) {
      // Find first visible input
      target = inputs.find(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }) as HTMLInputElement | null;
    }

    if (target) {
      target.focus();
      target.click();
      return true;
    }
    return false;
  }, placeholder);

  return focused;
}

export async function typeText(sessionId: string, text: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) return;
  await session.page.keyboard.type(text, { delay: 50 });
}

export async function pressKey(sessionId: string, key: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) return;
  await session.page.keyboard.press(key as Parameters<typeof session.page.keyboard.press>[0]);
}

export async function getStatus(sessionId: string): Promise<{
  status: string;
  token: string | null;
  error: string | null;
}> {
  const session = sessions.get(sessionId);
  if (!session) return { status: "none", token: null, error: null };

  // Check localStorage + IndexedDB for token
  if (!session.token) {
    try {
      const token = await session.page.evaluate((key) => {
        try {
          const lsToken = localStorage.getItem(key);
          if (lsToken) return Promise.resolve(lsToken);
        } catch { /* ignore */ }

        return new Promise<string | null>((resolve) => {
          try {
            const req = indexedDB.open("keyval-store");
            req.onsuccess = () => {
              try {
                const db = req.result;
                const tx = db.transaction("keyval", "readonly");
                const store = tx.objectStore("keyval");
                const getReq = store.get("persist::mfa");
                getReq.onsuccess = () => {
                  try {
                    const data = getReq.result;
                    if (data?.authToken) resolve(data.authToken);
                    else if (typeof data === "string") {
                      const parsed = JSON.parse(data);
                      resolve(parsed?.authToken || null);
                    } else resolve(null);
                  } catch { resolve(null); }
                };
                getReq.onerror = () => resolve(null);
              } catch { resolve(null); }
            };
            req.onerror = () => resolve(null);
            setTimeout(() => resolve(null), 500);
          } catch { resolve(null); }
        });
      }, TOKEN_KEY);
      if (token) {
        session.token = token;
        session.status = "logged_in";
        console.log("[browser-auth] Token found in browser storage (status check)");
      }
    } catch { /* page might be navigating */ }
  }

  return {
    status: session.status,
    token: session.token,
    error: session.error,
  };
}

export async function closeSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) return;
  if (session.screencastActive && session.cdp) {
    await session.cdp.send("Page.stopScreencast").catch(() => {});
  }
  await session.browser.close().catch(() => {});
  sessions.delete(sessionId);
}

// --- CDP Screencast streaming ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FrameCallback = (data: string, metadata: any) => void;

export async function startScreencast(
  sessionId: string,
  onFrame: FrameCallback,
): Promise<() => void> {
  const session = sessions.get(sessionId);
  if (!session || !session.cdp) throw new Error("No session or CDP");

  const cdp = session.cdp;

  // Listen for screencast frames
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handler = (params: any) => {
    // ACK immediately to keep frames flowing
    cdp.send("Page.screencastFrameAck", { sessionId: params.sessionId }).catch(() => {});
    // Also check for token
    checkToken(session);
    // Deliver frame
    onFrame(params.data, params.metadata);
  };

  cdp.on("Page.screencastFrame", handler);

  // Start screencast at desktop viewport resolution
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 60,
    maxWidth: 1280,
    maxHeight: 800,
    everyNthFrame: 1,
  });
  session.screencastActive = true;

  // Return cleanup function
  return () => {
    cdp.off("Page.screencastFrame", handler);
    if (session.screencastActive) {
      cdp.send("Page.stopScreencast").catch(() => {});
      session.screencastActive = false;
    }
  };
}

async function checkToken(session: BrowserSession) {
  if (session.token) return;
  try {
    const token = await session.page.evaluate((key) => {
      try {
        const lsToken = localStorage.getItem(key);
        if (lsToken) return Promise.resolve(lsToken);
      } catch { /* ignore */ }
      return new Promise<string | null>((resolve) => {
        try {
          const req = indexedDB.open("keyval-store");
          req.onsuccess = () => {
            try {
              const db = req.result;
              const tx = db.transaction("keyval", "readonly");
              const store = tx.objectStore("keyval");
              const getReq = store.get("persist::mfa");
              getReq.onsuccess = () => {
                try {
                  const data = getReq.result;
                  if (data?.authToken) resolve(data.authToken);
                  else if (typeof data === "string") {
                    const parsed = JSON.parse(data);
                    resolve(parsed?.authToken || null);
                  } else resolve(null);
                } catch { resolve(null); }
              };
              getReq.onerror = () => resolve(null);
            } catch { resolve(null); }
          };
          req.onerror = () => resolve(null);
          setTimeout(() => resolve(null), 300);
        } catch { resolve(null); }
      });
    }, TOKEN_KEY);
    if (token) {
      session.token = token;
      session.status = "logged_in";
      console.log("[browser-auth] Token captured via screencast check");
    }
  } catch { /* ignore */ }
}

// CDP input dispatch
export async function dispatchMouseEvent(
  sessionId: string,
  type: string,
  x: number,
  y: number,
  button?: string,
  clickCount?: number,
): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session?.cdp) return;
  await session.cdp.send("Input.dispatchMouseEvent", {
    type: type as "mousePressed" | "mouseReleased" | "mouseMoved" | "mouseWheel",
    x,
    y,
    button: (button || "left") as "none" | "left" | "middle" | "right",
    clickCount: clickCount || (type === "mousePressed" ? 1 : 0),
  });
}

export async function dispatchKeyEvent(
  sessionId: string,
  type: string,
  key: string,
  code?: string,
  text?: string,
): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session?.cdp) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: any = { type, key };
  if (code) params.code = code;
  if (text) params.text = text;
  // Map common keys to virtual key codes for CDP
  if (key === "Enter") params.windowsVirtualKeyCode = 13;
  else if (key === "Backspace") params.windowsVirtualKeyCode = 8;
  else if (key === "Tab") params.windowsVirtualKeyCode = 9;
  else if (key === "Escape") params.windowsVirtualKeyCode = 27;
  await session.cdp.send("Input.dispatchKeyEvent", params);
}
