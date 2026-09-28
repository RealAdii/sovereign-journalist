import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const verifyProof = vi.fn();
vi.mock("@reclaimprotocol/js-sdk", () => ({
  verifyProof: (...args: unknown[]) => verifyProof(...args),
  ReclaimProofRequest: {
    init: vi.fn(async () => {
      let context = { contextAddress: "", contextMessage: "" };
      return {
        setContext: (address: string, message: string) => {
          context = { contextAddress: address, contextMessage: message };
        },
        // Mirrors the real SDK: the serialized request carries the context but never the secret.
        toJsonString: () => JSON.stringify({ applicationId: "0xapp", signature: "0xsig", context }),
        getSessionId: () => "sess",
        getProviderVersion: () => ({ providerId: "provider-123", providerVersion: "4.0.0", allowedTags: [] }),
      };
    }),
  },
}));

const publishArticle = vi.fn();
const estimatePublication = vi.fn();
vi.mock("@/lib/onchain", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/onchain")>();
  return {
    ...original,
    publisherConfigured: () => true,
    publishArticle: (...args: unknown[]) => publishArticle(...args),
    estimatePublication: (...args: unknown[]) => estimatePublication(...args),
  };
});

import { POST as startVerify } from "@/app/api/verify/start/route";
import { POST as completeVerify } from "@/app/api/verify/route";
import { POST as interview } from "@/app/api/interview/route";
import { POST as publish } from "@/app/api/publish/route";
import { POST as estimate } from "@/app/api/publish/estimate/route";
import { POST as bond, GET as bondStatus } from "@/app/api/bond/route";
import { POST as tips } from "@/app/api/tips/route";
import { POST as recover } from "@/app/api/recover/route";
import { GET as attestation } from "@/app/api/attestation/route";
import { resetStoreForTests, getCapability } from "@/lib/session";

// The verify route looks the session up at api.reclaimprotocol.org. Stub it.
const sessionLookup = vi.fn();
vi.stubGlobal("fetch", (input: string | URL | Request) => {
  const url = String(input);
  if (url.startsWith("https://api.reclaimprotocol.org/api/sdk/session/")) {
    return Promise.resolve(new Response(JSON.stringify(sessionLookup(url)), { status: 200 }));
  }
  return Promise.reject(new Error(`unexpected fetch ${url}`));
});

function post(path: string, body: unknown, ip = "1.1.1.1") {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

function proofFor(verificationId: string, sessionId = "sess", challenge = "") {
  // The mocked verifyProof reads the binding it should report from the proof context.
  return {
    identifier: "0x1",
    signatures: ["0xsig"],
    witnesses: [],
    claimData: {
      provider: "http",
      parameters: "{}",
      owner: "0xowner",
      timestampS: 1,
      context: JSON.stringify({ contextAddress: verificationId, contextMessage: challenge, reclaimSessionId: sessionId, providerHash: "0xhash", extractedParameters: { role: "staff" } }),
      identifier: "0x1",
      epoch: 1,
    },
  };
}

function verifiedFrom(proof: ReturnType<typeof proofFor>) {
  const { extractedParameters, ...context } = JSON.parse(proof.claimData.context);
  return { isVerified: true, error: undefined, publicData: [], data: [{ context, extractedParameters }] };
}
const REJECTED = { isVerified: false, error: new Error("Identifier mismatch"), data: [], publicData: [] };

async function verifiedSession(ip = "1.1.1.1") {
  const start = await startVerify(post("/api/verify/start", {}, ip));
  const { verificationId, requestJson } = await start.json();
  const challenge = JSON.parse(requestJson).context.contextMessage as string;
  return { verificationId, challenge, ip };
}

beforeEach(async () => {
  await resetStoreForTests();
  verifyProof.mockReset();
  sessionLookup.mockReset();
  sessionLookup.mockReturnValue({ session: { appId: "0xapp", providerId: "provider-123", providerVersionString: "4.0.0", httpProviderId: ["provider-123"], proofs: [{ identifier: "0x1" }], statusV2: "PROOF_SUBMITTED" } });
  publishArticle.mockReset();
  estimatePublication.mockReset();
  delete process.env.ALLOW_DEV_WITHOUT_PRIVATE_BOND;
  delete process.env.GEMINI_API_KEY;
});

const article = {
  version: 1,
  title: "T",
  subtitle: "S",
  body: "B",
  sourceStatus: "credential-proven",
  allegationStatus: "reported",
};

describe("verification routes", () => {
  it("start returns a request without the app secret", async () => {
    const res = await startVerify(post("/api/verify/start", {}));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.verificationId).toBeTruthy();
    expect(data.requestJson).not.toContain("0xsecret");
  });

  it("rejects a proof for an unknown verification id and a replay of a used one", async () => {
    verifyProof.mockImplementation(async (p: ReturnType<typeof proofFor>) => verifiedFrom(p));
    const unknown = await completeVerify(post("/api/verify", { verificationId: "nope", proofs: [proofFor("nope")] }));
    expect(unknown.status).toBe(410);

    const { verificationId, challenge } = await verifiedSession();
    const wrongChallenge = await completeVerify(post("/api/verify", { verificationId, proofs: [proofFor(verificationId, "sess", "stale")] }));
    expect(wrongChallenge.status).toBe(401);
    // The record was consumed by the failed attempt, so even a correct proof is now a replay.
    const replay = await completeVerify(post("/api/verify", { verificationId, proofs: [proofFor(verificationId, "sess", challenge)] }));
    expect(replay.status).toBe(410);
  });

  it("issues a one-use capability with a recovery code for a valid bound proof", async () => {
    verifyProof.mockImplementation(async (p: ReturnType<typeof proofFor>) => verifiedFrom(p));
    const { verificationId, challenge } = await verifiedSession();
    const res = await completeVerify(post("/api/verify", { verificationId, proofs: [proofFor(verificationId, "sess", challenge)] }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.token).toBeTruthy();
    expect(data.recoveryCode).toBeTruthy();
    expect(data.bondStatus).toBe("blocked");
    expect(data.credential).toEqual({ provider: "provider-123", disclosedFields: ["role"] });
    expect(JSON.stringify(data)).not.toContain("staff");

    const replay = await completeVerify(post("/api/verify", { verificationId, proofs: [proofFor(verificationId, "sess", challenge)] }));
    expect(replay.status).toBe(410);

    expect(sessionLookup).toHaveBeenCalledWith("https://api.reclaimprotocol.org/api/sdk/session/sess");

    const recovered = await recover(post("/api/recover", { recoveryCode: data.recoveryCode }));
    expect(recovered.status).toBe(200);
    expect((await recovered.json()).token).not.toBe(data.token);
    expect(await getCapability(data.token)).toBeNull();
  });

  it("rejects a forged proof and consumes the record", async () => {
    verifyProof.mockResolvedValue(REJECTED);
    const { verificationId } = await verifiedSession();
    const res = await completeVerify(post("/api/verify", { verificationId, proofs: [proofFor(verificationId)] }));
    expect(res.status).toBe(401);
    const again = await completeVerify(post("/api/verify", { verificationId, proofs: [proofFor(verificationId)] }));
    expect(again.status).toBe(410);
  });

  it("rejects a valid proof that the initiated session did not produce", async () => {
    verifyProof.mockImplementation(async (p: ReturnType<typeof proofFor>) => verifiedFrom(p));
    sessionLookup.mockReturnValue({ session: { appId: "0xapp", providerId: "provider-123", proofs: [{ identifier: "0xforeign" }] } });
    const { verificationId, challenge } = await verifiedSession();
    const res = await completeVerify(post("/api/verify", { verificationId, proofs: [proofFor(verificationId, "sess", challenge)] }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/not produced/);
  });

  it("rate limits verification starts per client", async () => {
    let last = 200;
    for (let i = 0; i < 12; i += 1) last = (await startVerify(post("/api/verify/start", {}, "9.9.9.9"))).status;
    expect(last).toBe(429);
  });
});

describe("bond gating", () => {
  it("reports the bond as blocked with the missing dependencies and refuses receipts", async () => {
    const status = await (await bondStatus()).json();
    expect(status).toMatchObject({ network: "SN_SEPOLIA", token: "STRK", amount: "1", status: "blocked" });
    expect(status.missing.length).toBeGreaterThan(3);
    const res = await bond(post("/api/bond", { token: "x", transactionHash: "0xpublic" }));
    expect(res.status).toBe(401);
  });

  it("status and refund routes require a session and a configured treasury", async () => {
    const { POST: status } = await import("@/app/api/bond/status/route");
    const { POST: refund } = await import("@/app/api/bond/refund/route");
    expect((await status(post("/api/bond/status", { token: "bad" }))).status).toBe(401);
    expect((await refund(post("/api/bond/refund", { token: "bad" }))).status).toBe(401);
    const { issueCapability } = await import("@/lib/session");
    const { token } = await issueCapability({ provider: "provider-123", parameters: {}, verifiedAt: "now" });
    // No BOND_* env in tests: the private path is not configured, so nothing can be confirmed or refunded.
    expect((await status(post("/api/bond/status", { token }))).status).toBe(503);
    expect((await refund(post("/api/bond/refund", { token }))).status).toBe(503);
    const quoteRes = await bond(post("/api/bond", { token, recipient: "0x1" }));
    expect(quoteRes.status).toBe(503);
    expect((await quoteRes.json()).missing.some((m: string) => m.includes("BOND_TREASURY_PRIVATE_KEY"))).toBe(true);
  });

  it("blocks interview, estimate, and publish for a session without a bond", async () => {
    const { issueCapability } = await import("@/lib/session");
    const { token } = await issueCapability({ provider: "provider-123", parameters: {}, verifiedAt: "now" });
    const bondRes = await bond(post("/api/bond", { token, transactionHash: "0xpublic" }));
    expect(bondRes.status).toBe(503);
    expect((await interview(post("/api/interview", { token, messages: [{ role: "user", content: "hi" }] }))).status).toBe(403);
    expect((await estimate(post("/api/publish/estimate", { token, article }))).status).toBe(403);
    expect((await publish(post("/api/publish", { token, article, approvedDigest: "0x1" }))).status).toBe(403);
    expect(publishArticle).not.toHaveBeenCalled();
  });

  it("rejects an invalid token everywhere", async () => {
    expect((await interview(post("/api/interview", { token: "bad", messages: [{ role: "user", content: "hi" }] }))).status).toBe(401);
    expect((await publish(post("/api/publish", { token: "bad", article, approvedDigest: "0x1" }))).status).toBe(401);
  });
});

describe("publish with the development bypass", () => {
  it("publishes once, refuses a duplicate, and releases the session if the chain rejects", async () => {
    process.env.ALLOW_DEV_WITHOUT_PRIVATE_BOND = "true";
    const { issueCapability } = await import("@/lib/session");
    const { token } = await issueCapability({ provider: "provider-123", parameters: {}, verifiedAt: "now" });

    publishArticle.mockRejectedValueOnce(new Error("Sepolia rejected the publication transaction"));
    const failed = await publish(post("/api/publish", { token, article, approvedDigest: "0xabc" }));
    expect(failed.status).toBe(502);
    expect((await getCapability(token))?.usedForPublish).toBe(false);

    publishArticle.mockResolvedValueOnce({ articleId: "0xabc", transactionHash: "0xtx", readBackMatched: true, explorerUrl: "u" });
    const ok = await publish(post("/api/publish", { token, article, approvedDigest: "0xabc" }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ articleId: "0xabc", transactionHash: "0xtx" });

    const dup = await publish(post("/api/publish", { token, article, approvedDigest: "0xabc" }));
    expect(dup.status).toBe(409);
    expect(publishArticle).toHaveBeenCalledTimes(2);
  });

  it("returns a field-level error when the article exceeds the byte limit", async () => {
    process.env.ALLOW_DEV_WITHOUT_PRIVATE_BOND = "true";
    const { issueCapability } = await import("@/lib/session");
    const { token } = await issueCapability({ provider: "provider-123", parameters: {}, verifiedAt: "now" });
    const { ArticleValidationError } = await import("@/lib/onchain");
    estimatePublication.mockRejectedValueOnce(new ArticleValidationError("too long", "body", 30000, 24576));
    const res = await estimate(post("/api/publish/estimate", { token, article }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ field: "body", size: 30000, max: 24576 });
  });
});

describe("tips, recovery, attestation", () => {
  it("tips are refused with the blocker list and store nothing", async () => {
    const res = await tips();
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.missing.length).toBeGreaterThan(2);
  });

  it("recovery needs a real code", async () => {
    expect((await recover(post("/api/recover", { recoveryCode: "short" }))).status).toBe(400);
    expect((await recover(post("/api/recover", { recoveryCode: "not-a-real-code-but-long-enough" }))).status).toBe(404);
  });

  it("attestation never claims a TEE", async () => {
    const data = await (await attestation()).json();
    expect(data.tee).toBe(false);
    expect(data.attestationVerified).toBe(false);
    expect(data.dataProcessing.aiProvider).toMatch(/Google/);
  });
});

describe("server-driven verification status", () => {
  it("stays pending without a proof, issues once when Reclaim has one, then reports the record as used", async () => {
    const { POST: statusRoute } = await import("@/app/api/verify/status/route");
    verifyProof.mockImplementation(async (p: ReturnType<typeof proofFor>) => verifiedFrom(p));
    const { verificationId, challenge } = await verifiedSession();

    sessionLookup.mockReturnValue({ session: { appId: "0xapp", providerId: "provider-123", proofs: [], statusV2: "SESSION_INIT" } });
    const pending = await statusRoute(post("/api/verify/status", { verificationId }));
    expect(await pending.json()).toMatchObject({ status: "pending" });

    sessionLookup.mockReturnValue({ session: { appId: "0xapp", providerId: "provider-123", proofs: [proofFor(verificationId, "sess", challenge)], statusV2: "PROOF_SUBMITTED" } });
    const issued = await statusRoute(post("/api/verify/status", { verificationId }));
    expect(issued.status).toBe(200);
    const data = await issued.json();
    expect(data.status).toBe("issued");
    expect(data.token).toBeTruthy();
    expect(data.credential.disclosedFields).toEqual(["role"]);

    const again = await statusRoute(post("/api/verify/status", { verificationId }));
    expect(again.status).toBe(410);
  });

  it("fails closed when Reclaim reports an error state or the proof does not verify", async () => {
    const { POST: statusRoute } = await import("@/app/api/verify/status/route");
    const a = await verifiedSession("5.5.5.5");
    sessionLookup.mockReturnValue({ session: { appId: "0xapp", providerId: "provider-123", proofs: [], statusV2: "ERROR_SUBMISSION_FAILED" } });
    const failed = await statusRoute(post("/api/verify/status", { verificationId: a.verificationId }, "5.5.5.5"));
    expect(failed.status).toBe(409);

    verifyProof.mockResolvedValue(REJECTED);
    const b = await verifiedSession("6.6.6.6");
    sessionLookup.mockReturnValue({ session: { appId: "0xapp", providerId: "provider-123", proofs: [proofFor(b.verificationId, "sess", b.challenge)], statusV2: "PROOF_SUBMITTED" } });
    const rejected = await statusRoute(post("/api/verify/status", { verificationId: b.verificationId }, "6.6.6.6"));
    expect(rejected.status).toBe(401);
    expect((await statusRoute(post("/api/verify/status", { verificationId: b.verificationId }, "6.6.6.6"))).status).toBe(410);
  });
});
