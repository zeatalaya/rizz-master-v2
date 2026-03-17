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
  conversationsStartedWithReply: number;
  likesYouCount: number;
  platform: string;
}): Promise<AttestationResult> {
  const payload = JSON.stringify({
    type: "rizz-master-evaluation",
    platform: result.platform,
    userId: result.userId,
    userName: result.userName,
    isRizzMaster: result.isRizzMaster,
    criteria: {
      matches: { actual: result.totalMatches, required: 10, passed: result.totalMatches >= 10 },
      conversations: { actual: result.conversationsStartedWithReply, required: 5, passed: result.conversationsStartedWithReply >= 5 },
      likes: { actual: result.likesYouCount, required: 50, passed: result.likesYouCount >= 50 },
    },
    evaluatedAt: new Date().toISOString(),
  });

  return attestData(payload);
}
