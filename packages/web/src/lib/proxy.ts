/**
 * Per-flow sticky proxy with country targeting for auth requests.
 * Ported from v1 — works for all platforms.
 */

const PHONE_TO_COUNTRY: Record<string, string> = {
  "1": "us", "7": "ru", "20": "eg", "27": "za", "30": "gr", "31": "nl",
  "32": "be", "33": "fr", "34": "es", "36": "hu", "39": "it", "40": "ro",
  "41": "ch", "43": "at", "44": "gb", "45": "dk", "46": "se", "47": "no",
  "48": "pl", "49": "de", "51": "pe", "52": "mx", "53": "cu", "54": "ar",
  "55": "br", "56": "cl", "57": "co", "58": "ve", "60": "my", "61": "au",
  "62": "id", "63": "ph", "64": "nz", "65": "sg", "66": "th", "81": "jp",
  "82": "kr", "84": "vn", "86": "cn", "90": "tr", "91": "in", "92": "pk",
  "93": "af", "94": "lk", "95": "mm", "98": "ir", "212": "ma", "213": "dz",
  "216": "tn", "218": "ly", "220": "gm", "221": "sn", "234": "ng",
  "254": "ke", "255": "tz", "256": "ug", "260": "zm", "263": "zw",
  "351": "pt", "352": "lu", "353": "ie", "354": "is", "355": "al",
  "356": "mt", "357": "cy", "358": "fi", "359": "bg", "370": "lt",
  "371": "lv", "372": "ee", "380": "ua", "381": "rs", "385": "hr",
  "386": "si", "387": "ba", "389": "mk", "420": "cz", "421": "sk",
  "852": "hk", "853": "mo", "855": "kh", "856": "la", "880": "bd",
  "886": "tw", "960": "mv", "961": "lb", "962": "jo", "963": "sy",
  "964": "iq", "965": "kw", "966": "sa", "968": "om", "971": "ae",
  "972": "il", "973": "bh", "974": "qa", "975": "bt", "976": "mn",
  "977": "np", "992": "tj", "993": "tm", "994": "az", "995": "ge",
  "996": "kg", "998": "uz",
};

export function phoneToCountry(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  for (const len of [3, 2, 1]) {
    const prefix = digits.slice(0, len);
    if (PHONE_TO_COUNTRY[prefix]) return PHONE_TO_COUNTRY[prefix];
  }
  return "us";
}

let ProxyAgentClass: typeof import("undici").ProxyAgent | null = null;
let proxyAgentPromise: Promise<void> | null = null;

async function ensureLoaded() {
  if (ProxyAgentClass) return;
  if (!proxyAgentPromise) {
    proxyAgentPromise = import("undici").then((m) => {
      ProxyAgentClass = m.ProxyAgent;
    });
  }
  await proxyAgentPromise;
}

const stickyAgents = new Map<string, {
  agent: InstanceType<typeof import("undici").ProxyAgent>;
  createdAt: number;
}>();

function cleanup() {
  const now = Date.now();
  for (const [key, entry] of stickyAgents) {
    if (now - entry.createdAt > 30 * 60 * 1000) {
      stickyAgents.delete(key);
    }
  }
}

function buildProxyAgent(
  baseUrl: string,
  extraParams: string,
  sessionId: string
): InstanceType<typeof import("undici").ProxyAgent> {
  const url = new URL(baseUrl);
  const username = decodeURIComponent(url.username);
  const password = `${decodeURIComponent(url.password)}${extraParams}_session-${sessionId}_lifetime-30m`;
  const token = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");

  return new ProxyAgentClass!({
    uri: `http://${url.hostname}:${url.port}`,
    token,
  });
}

export async function getProxyDispatcher(
  sessionId: string,
  phone: string
): Promise<unknown | undefined> {
  const baseUrl = process.env.PROXY_URL;
  if (!baseUrl) return undefined;

  await ensureLoaded();
  if (!ProxyAgentClass) return undefined;

  cleanup();

  const country = phoneToCountry(phone);
  const cacheKey = `${country}:${sessionId}`;

  const existing = stickyAgents.get(cacheKey);
  if (existing) return existing.agent;

  const agent = buildProxyAgent(baseUrl, `_country-${country}`, sessionId);
  stickyAgents.set(cacheKey, { agent, createdAt: Date.now() });

  console.log(`[proxy] New auth agent: country=${country}, session=${sessionId}`);
  return agent;
}
