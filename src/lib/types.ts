export interface VerifiedCredential {
  provider: string;
  parameters: Record<string, string>;
  verifiedAt: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ArticleDraft {
  version: 1;
  title: string;
  subtitle: string;
  body: string;
  sourceStatus: "credential-proven";
  allegationStatus: "reported";
}

export interface OnchainArticle extends ArticleDraft {
  articleId: string;
  approvedDigest: string;
  publishedAt: number;
  byteLengths: { title: number; subtitle: number; body: number };
  transactionHash?: string;
}

export interface PublishedArticleSummary {
  articleId: string;
  title: string;
  subtitle: string;
  publishedAt: number;
}

export interface PublishEstimate {
  articleId: string;
  approvedDigest: string;
  feeFri: string;
  feeStrk: string;
  calldataFelts: number;
  byteLengths: { title: number; subtitle: number; body: number };
  network: "SN_SEPOLIA";
}

export interface PublishResult {
  articleId: string;
  transactionHash: string;
  readBackMatched: true;
  explorerUrl: string;
}

export type BondStatus = "blocked" | "confirmed" | "dev-bypass";

export interface CapabilityStatus {
  configured: boolean;
  enabled: boolean;
  reason: string;
  missing?: string[];
}

export interface CapabilitiesReport {
  network: "SN_SEPOLIA";
  articleRegistry: CapabilityStatus & { address?: string };
  aiInterview: CapabilityStatus & { provider: "ollama" | "openrouter" | "gemini" | "none"; model: string; external: boolean };
  anonymousBond: CapabilityStatus & { amount: string; token: "STRK" };
  encryptedTips: CapabilityStatus & { poolAddress?: string; poolClassHash?: string };
  confidentialCompute: CapabilityStatus;
}

export interface IssuedCapability {
  token: string;
  recoveryCode: string;
  expiresAt: number;
  bondStatus: BondStatus;
  credential: { provider: string; disclosedFields: string[] };
}
