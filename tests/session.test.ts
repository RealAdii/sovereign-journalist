import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumePublishCapability,
  consumeVerificationRecord,
  createVerificationRecord,
  enforceRateLimit,
  getCapability,
  issueCapability,
  MAX_AI_REQUESTS,
  recordAiRequest,
  recoverCapability,
  releasePublishCapability,
  requireBondedCapability,
  resetStoreForTests,
  saveVerificationRecord,
} from "@/lib/session";

const credential = { provider: "provider-123", parameters: { role: "x" }, verifiedAt: "now" };
const version = { providerId: "provider-123", providerVersion: "4.0.0", allowedTags: [] as string[] };

beforeEach(async () => {
  await resetStoreForTests();
  delete process.env.ALLOW_DEV_WITHOUT_PRIVATE_BOND;
});

describe("verification records", () => {
  it("are one-use", async () => {
    const { verificationId, challenge } = createVerificationRecord();
    await saveVerificationRecord(verificationId, challenge, "sess", version);
    expect(await consumeVerificationRecord(verificationId)).toMatchObject({ challenge, reclaimSessionId: "sess" });
    expect(await consumeVerificationRecord(verificationId)).toBeNull();
  });

  it("expire", async () => {
    vi.useFakeTimers();
    const { verificationId, challenge } = createVerificationRecord();
    await saveVerificationRecord(verificationId, challenge, "sess", version);
    vi.advanceTimersByTime(11 * 60 * 1000);
    expect(await consumeVerificationRecord(verificationId)).toBeNull();
    vi.useRealTimers();
  });
});

describe("capabilities", () => {
  it("start blocked unless the dev bypass is on", async () => {
    expect((await issueCapability(credential)).bondStatus).toBe("blocked");
    process.env.ALLOW_DEV_WITHOUT_PRIVATE_BOND = "true";
    expect((await issueCapability(credential)).bondStatus).toBe("dev-bypass");
  });

  it("gate AI and publishing on the bond", async () => {
    const { token } = await issueCapability(credential);
    expect(await requireBondedCapability(token)).toEqual({ error: "bond-blocked" });
    expect(await requireBondedCapability("nope")).toEqual({ error: "invalid" });
    expect(await consumePublishCapability(token)).toBeNull();
  });

  it("publish is one-use and can be released after a failed transaction", async () => {
    process.env.ALLOW_DEV_WITHOUT_PRIVATE_BOND = "true";
    const { token } = await issueCapability(credential);
    expect(await consumePublishCapability(token)).not.toBeNull();
    expect(await consumePublishCapability(token)).toBeNull();
    await releasePublishCapability(token);
    expect(await consumePublishCapability(token)).not.toBeNull();
  });

  it("caps AI requests per session", async () => {
    process.env.ALLOW_DEV_WITHOUT_PRIVATE_BOND = "true";
    const { token } = await issueCapability(credential);
    for (let i = 0; i < MAX_AI_REQUESTS; i += 1) expect(await recordAiRequest(token)).toBe(true);
    expect(await recordAiRequest(token)).toBe(false);
  });

  it("recovery rotates the token and keeps state", async () => {
    process.env.ALLOW_DEV_WITHOUT_PRIVATE_BOND = "true";
    const { token, recoveryCode } = await issueCapability(credential);
    await recordAiRequest(token);
    const recovered = await recoverCapability(recoveryCode);
    expect(recovered).not.toBeNull();
    expect(recovered!.token).not.toBe(token);
    expect(await getCapability(token)).toBeNull();
    expect((await getCapability(recovered!.token))?.aiRequests).toBe(1);
    expect(await recoverCapability("definitely-not-a-code-0123456789")).toBeNull();
  });

  it("never stores the raw token or recovery code", async () => {
    const { token, recoveryCode } = await issueCapability(credential);
    const record = (await getCapability(token))!;
    expect(JSON.stringify(record)).not.toContain(token);
    expect(JSON.stringify(record)).not.toContain(recoveryCode);
  });
});

describe("rate limit", () => {
  it("allows up to the limit inside a window and resets after", async () => {
    vi.useFakeTimers();
    expect(await enforceRateLimit("ip-a", 2, 1000)).toBe(true);
    expect(await enforceRateLimit("ip-a", 2, 1000)).toBe(true);
    expect(await enforceRateLimit("ip-a", 2, 1000)).toBe(false);
    expect(await enforceRateLimit("ip-b", 2, 1000)).toBe(true);
    vi.advanceTimersByTime(1001);
    expect(await enforceRateLimit("ip-a", 2, 1000)).toBe(true);
    vi.useRealTimers();
  });
});
