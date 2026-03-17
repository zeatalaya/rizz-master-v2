export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const proxyUrl = process.env.PROXY_URL;
    if (!proxyUrl) {
      console.log("[proxy] No PROXY_URL set, using direct connections");
      return;
    }
    console.log("[proxy] PROXY_URL configured for auth flows (tproxy-net handles general traffic)");
  }
}
