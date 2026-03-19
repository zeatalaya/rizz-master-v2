import crypto from "crypto";

let _client: ReturnType<typeof createLazyClient> | null = null;

function createLazyClient() {
  let clientPromise: Promise<InstanceType<typeof import("@phala/dstack-sdk").DstackClient>> | null = null;

  return {
    async getClient() {
      if (!clientPromise) {
        clientPromise = import("@phala/dstack-sdk").then((mod) => {
          const endpoint = process.env.DSTACK_SIMULATOR_ENDPOINT;
          return endpoint ? new mod.DstackClient(endpoint) : new mod.DstackClient();
        });
      }
      return clientPromise;
    },
  };
}

function getClientWrapper() {
  if (!_client) {
    _client = createLazyClient();
  }
  return _client;
}

export interface AttestationResult {
  quote: string;
  reportDataHex: string;
  timestamp: string;
}

export async function attestData(data: string | Buffer): Promise<AttestationResult> {
  const hash = crypto.createHash("sha256").update(data).digest();
  const client = await getClientWrapper().getClient();
  const result = await client.getQuote(hash);

  return {
    quote: result.quote,
    reportDataHex: hash.toString("hex"),
    timestamp: new Date().toISOString(),
  };
}

export async function deriveKey(path: string): Promise<Uint8Array> {
  const client = await getClientWrapper().getClient();
  const response = await client.getKey(path);
  return response.key;
}

export async function isDstackAvailable(): Promise<boolean> {
  try {
    const client = await getClientWrapper().getClient();
    const reachable = await client.isReachable();
    console.log(`[dstack] isReachable: ${reachable}`);
    return reachable;
  } catch (err) {
    console.error("[dstack] isDstackAvailable error:", err instanceof Error ? err.message : err);
    return false;
  }
}

export async function attestRizzMasterResult(result: {
  userId: string;
  userName: string;
  isRizzMaster: boolean;
  totalMatches: number;
  conversationsYouStarted: number;
  replyRate: number;
  platform: string;
}): Promise<AttestationResult> {
  const payload = JSON.stringify({
    type: "rizz-master-evaluation",
    platform: result.platform,
    userId: result.userId,
    userName: result.userName,
    isRizzMaster: result.isRizzMaster,
    criteria: {
      matches: { actual: result.totalMatches, required: 40, passed: result.totalMatches >= 40 },
      conversations: { actual: result.conversationsYouStarted, required: 18, passed: result.conversationsYouStarted >= 18 },
      replyRate: { actual: Math.round(result.replyRate), required: 35, passed: result.replyRate >= 35 },
    },
    evaluatedAt: new Date().toISOString(),
  });

  return attestData(payload);
}
