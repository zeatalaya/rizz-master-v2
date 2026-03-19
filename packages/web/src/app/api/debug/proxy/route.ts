import { NextResponse } from "next/server";

export async function GET() {
  const results: Record<string, unknown> = {};

  // 1. Check PROXY_URL is set
  const proxyUrl = process.env.PROXY_URL;
  results.proxyUrlSet = !!proxyUrl;
  if (proxyUrl) {
    const u = new URL(proxyUrl);
    results.proxyHost = u.hostname;
    results.proxyPort = u.port;
  }

  // 2. Test direct fetch (no proxy)
  try {
    const res = await fetch("https://httpbin.org/ip");
    const data = await res.json();
    results.directIp = data.origin;
  } catch (e) {
    results.directIp = `error: ${e instanceof Error ? e.message : e}`;
  }

  // 3. Test proxy via undici ProxyAgent
  try {
    const { getProxyDispatcher } = await import("@/lib/proxy");
    const dispatcher = await getProxyDispatcher("debug-test", "1");
    results.dispatcherCreated = !!dispatcher;

    if (dispatcher) {
      const undici = await import("undici");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await undici.fetch("https://httpbin.org/ip", { dispatcher } as any);
      const data = await res.json() as { origin: string };
      results.proxiedIp = data.origin;
    }
  } catch (e) {
    results.proxiedIp = `error: ${e instanceof Error ? e.message : e}`;
    if (e instanceof Error && e.cause) {
      results.proxyCause = String(e.cause);
    }
  }

  // 4. Test raw TCP connectivity to proxy
  try {
    const net = await import("net");
    const host = proxyUrl ? new URL(proxyUrl).hostname : "";
    const port = proxyUrl ? parseInt(new URL(proxyUrl).port) : 0;
    if (host && port) {
      const connected = await new Promise<boolean>((resolve) => {
        const sock = net.createConnection({ host, port, timeout: 5000 }, () => {
          sock.destroy();
          resolve(true);
        });
        sock.on("error", () => resolve(false));
        sock.on("timeout", () => { sock.destroy(); resolve(false); });
      });
      results.tcpConnectToProxy = connected;
    }
  } catch (e) {
    results.tcpConnectToProxy = `error: ${e instanceof Error ? e.message : e}`;
  }

  return NextResponse.json(results);
}
