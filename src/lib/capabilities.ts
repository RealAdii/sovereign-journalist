import { RpcProvider } from "starknet";
import { geminiConfigured, GEMINI_MODEL } from "./gemini";
import { publisherConfigured, registryConfigured } from "./onchain";
import type { CapabilitiesReport } from "./types";

export const BOND_AMOUNT_STRK = "1";

export const BOND_MISSING = [
  "A verified STRK20 Sepolia pool address, pinned in configuration after a live class-hash check",
  "A Sepolia wallet exposing Wallet API 0.10.3 or newer with strk20InvokeTransaction (Ready extension on Sepolia was not verified in this environment)",
  "A private escrow helper contract that returns a session-bound admission receipt to the server without exposing the payer address",
  "An unlinkable refund path (private transfer to a fresh note) demonstrated with two unrelated funded wallets and RPC inspection",
  "A metadata analysis showing IP address and timing do not relink bond payment and interview session",
];

export const TIP_MISSING = [
  "Deployment of contracts/tip_inbox on Sepolia after an audit of its privacy_invoke calldata shape against the live pool",
  "Confirmation that the live Sepolia pool forwards arbitrary invoke calldata to a helper with no token movement (the STRK20 messaging page is an RFP, not a shipped sendMessage API)",
  "A Sepolia wallet that can build the invoke action so that the sender is the relayer, not the source",
  "An editorial recipient key ceremony, a recipient discovery indexer, and a decryption client that were tested end to end",
];

export const DEV_BYPASS_ACTIVE =
  process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_WITHOUT_PRIVATE_BOND === "true";

export async function poolStatus() {
  const poolAddress = process.env.NEXT_PUBLIC_STRK20_POOL_ADDRESS;
  const rpc = process.env.STARKNET_SEPOLIA_RPC_URL;
  if (!poolAddress || !rpc) return { poolAddress, poolClassHash: undefined, reachable: false };
  try {
    const provider = new RpcProvider({ nodeUrl: rpc });
    const poolClassHash = await provider.getClassHashAt(poolAddress, "latest");
    return { poolAddress, poolClassHash, reachable: true };
  } catch {
    return { poolAddress, poolClassHash: undefined, reachable: false };
  }
}

export async function capabilitiesReport(): Promise<CapabilitiesReport> {
  const pool = await poolStatus();
  const tipInboxConfigured = Boolean(process.env.NEXT_PUBLIC_TIP_INBOX_ADDRESS);
  return {
    network: "SN_SEPOLIA",
    articleRegistry: {
      configured: registryConfigured(),
      enabled: publisherConfigured(),
      address: process.env.NEXT_PUBLIC_ARTICLE_REGISTRY_ADDRESS || undefined,
      reason: publisherConfigured()
        ? "Articles are written to the Sepolia registry by the server-held publisher key and read back before they are shown as published."
        : "Set STARKNET_SEPOLIA_RPC_URL, NEXT_PUBLIC_ARTICLE_REGISTRY_ADDRESS, STARKNET_PUBLISHER_ADDRESS and STARKNET_PUBLISHER_PRIVATE_KEY.",
    },
    aiInterview: {
      configured: geminiConfigured(),
      enabled: geminiConfigured(),
      provider: "google-gemini",
      model: GEMINI_MODEL,
      reason: geminiConfigured()
        ? "Interview messages and the draft article are sent to Google's Gemini API. Google receives the full text. This server does not hide it from Google."
        : "GEMINI_API_KEY is not set. The interview is unavailable. The encrypted tip path is the only alternative and it is also blocked.",
    },
    anonymousBond: {
      configured: false,
      enabled: DEV_BYPASS_ACTIVE,
      amount: BOND_AMOUNT_STRK,
      token: "STRK",
      reason: DEV_BYPASS_ACTIVE
        ? "Development bypass is active. No bond is collected and no anonymity is claimed. This mode is refused in production."
        : "The anonymous bonded interview is blocked. A public ERC-20 transfer would link the payer to the interview, so it is not offered as a substitute.",
      missing: BOND_MISSING,
    },
    encryptedTips: {
      configured: tipInboxConfigured,
      enabled: false,
      poolAddress: pool.poolAddress,
      poolClassHash: pool.poolClassHash,
      reason: pool.reachable
        ? "The STRK20 Sepolia pool exists, but the encrypted tip path has not been proven end to end and stays blocked."
        : "The STRK20 Sepolia pool could not be checked from this server. The encrypted tip path stays blocked.",
      missing: TIP_MISSING,
    },
    confidentialCompute: {
      configured: false,
      enabled: false,
      reason:
        "No hardware attestation is verified in this build. The operator of this server can read interview text, and Google receives it. Do not treat this deployment as confidential compute.",
    },
  };
}
