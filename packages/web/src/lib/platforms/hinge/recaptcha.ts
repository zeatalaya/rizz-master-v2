/**
 * Server-side reCAPTCHA solver using Puppeteer.
 * Renders invisible reCAPTCHA on localhost to bypass hostname restrictions.
 */

import { createServer, type Server } from "http";

const FIREBASE_API_KEY = "AIzaSyB-apSzB00iSHaEIG-5nalT2DDVSAHcPXA";
const HINGE_PACKAGE = "co.hinge.app";
const HINGE_CERT = "7D5F1D2ACE98A03B2C3A1A6B0DCB2B7F5D856F67";

/** Fetch the dynamic reCAPTCHA site key from Firebase */
export async function getRecaptchaSiteKey(): Promise<string> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/recaptchaParams?alt=json&key=${FIREBASE_API_KEY}`,
    {
      headers: {
        "X-Android-Package": HINGE_PACKAGE,
        "X-Android-Cert": HINGE_CERT,
      },
    }
  );
  if (!res.ok) throw new Error(`Failed to get reCAPTCHA params: ${res.status}`);
  const data = await res.json();
  if (!data.recaptchaSiteKey) throw new Error("No recaptchaSiteKey in response");
  return data.recaptchaSiteKey;
}

function buildRecaptchaHtml(siteKey: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <script src="https://www.google.com/recaptcha/api.js"></script>
</head>
<body>
  <form>
    <button class="g-recaptcha"
      data-sitekey="${siteKey}"
      data-callback="onSubmit"
      data-action="submit"
      id="submit-btn">
      Submit
    </button>
  </form>
  <script>
    function onSubmit(token) {
      document.title = "TOKEN:" + token;
    }
  </script>
</body>
</html>`;
}

/**
 * Solve reCAPTCHA server-side using Puppeteer.
 * Starts a temporary HTTP server on localhost, loads the page in Puppeteer,
 * clicks the submit button, and captures the token from the page title.
 */
export async function solveRecaptcha(siteKey: string): Promise<string> {
  const html = buildRecaptchaHtml(siteKey);

  // Start a temporary HTTP server
  let server: Server | null = null;
  const port = 18888 + Math.floor(Math.random() * 1000);

  try {
    server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    });

    await new Promise<void>((resolve, reject) => {
      server!.listen(port, "127.0.0.1", () => resolve());
      server!.on("error", reject);
    });

    console.log(`[hinge-recaptcha] Server started on localhost:${port}`);

    // Launch Puppeteer with Xvfb for non-headless mode (avoids reCAPTCHA detection)
    const puppeteer = await import("puppeteer-core");
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium";

    // Start Xvfb if available
    let xvfbProcess: import("child_process").ChildProcess | null = null;
    const display = `:${99 + Math.floor(Math.random() * 100)}`;
    try {
      const { spawn } = await import("child_process");
      xvfbProcess = spawn("Xvfb", [display, "-screen", "0", "1280x800x24", "-nolisten", "tcp"], {
        stdio: "ignore",
      });
      process.env.DISPLAY = display;
      // Give Xvfb time to start
      await new Promise(r => setTimeout(r, 500));
      console.log(`[hinge-recaptcha] Xvfb started on ${display}`);
    } catch {
      console.warn("[hinge-recaptcha] Xvfb not available, falling back to headless");
    }

    const useHeadless = !xvfbProcess;

    const browser = await puppeteer.default.launch({
      executablePath,
      headless: useHeadless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=1280,800",
        ...(useHeadless ? [] : [`--display=${display}`]),
      ],
    });

    try {
      const page = await browser.newPage();

      // Stealth overrides
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => false });
        Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
        Object.defineProperty(navigator, "plugins", {
          get: () => [1, 2, 3, 4, 5],
        });
        // @ts-ignore
        window.chrome = { runtime: {} };
      });

      await page.setUserAgent(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
      );
      await page.setViewport({ width: 1280, height: 800 });

      await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "networkidle2", timeout: 30000 });

      // Wait for reCAPTCHA to load
      await page.waitForSelector(".g-recaptcha", { timeout: 10000 });

      // Small delay to let reCAPTCHA fully initialize
      await new Promise(r => setTimeout(r, 1000));

      // Click the submit button to trigger invisible reCAPTCHA
      await page.click("#submit-btn");

      // Wait for the token to appear in the page title
      const token = await page.waitForFunction(
        () => document.title.startsWith("TOKEN:") ? document.title.slice(6) : null,
        { timeout: 45000, polling: 500 }
      );

      const tokenValue = await token.jsonValue();
      if (!tokenValue || typeof tokenValue !== "string") {
        throw new Error("Failed to extract reCAPTCHA token");
      }

      console.log(`[hinge-recaptcha] Token obtained (${tokenValue.length} chars)`);
      return tokenValue;
    } finally {
      await browser.close();
      if (xvfbProcess) {
        xvfbProcess.kill();
        console.log("[hinge-recaptcha] Xvfb stopped");
      }
    }
  } finally {
    if (server) {
      server.close();
    }
  }
}
