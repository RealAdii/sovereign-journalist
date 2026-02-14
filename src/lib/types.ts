export interface VerifiedCredential {
  provider: string;
  parameters: Record<string, string>;
  verifiedAt: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface InterviewSession {
  credential: VerifiedCredential;
  sessionToken: string;
  messages: ChatMessage[];
}

export interface IPFSArticle {
  version: "1.0";
  publishedAt: string;
  article: {
    title: string;
    subtitle: string;
    body: string;
    confidence: number;
    confidenceReason: string;
  };
  verification: {
    sourceCredential: string;
    proofHash: string;
    verificationMethod: "zkTLS (Reclaim Protocol)";
    identityKnown: false;
  };
  metadata: {
    agentModel: string;
    interviewTurns: number;
    tags: string[];
  };
}

export interface PublishedArticle {
  cid: string;
  title: string;
  subtitle: string;
  confidenceScore: number;
  tags: string[];
  publishedAt: string;
}
