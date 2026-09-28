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

beforeEach(() => {
  resetStoreForTests();
  delete process.env.ALLOW_DEV_WITHOUT_PRIVATE_BOND;
});

describe("verification records", () => {
  it("are one-use", () => {
    const { verificationId, challenge } = createVerificationRecord();
    saveVerificationRecord(verificationId, challenge, "sess", { providerId: "provider-123", providerVersion: "4.0.0", allowedTags: [] });
    expect(consumeVerificationRecord(verificationId)).toMatchObject({ challenge, reclaimSessionId: "sess" });
    expect(consumeVerificationRecord(verificationId)).toBeNull();
  });

  it("expire", () => {
    vi.useFakeTimers();
    const { verificationId, challenge } = createVerificationRecord();
    saveVerificationRecord(verificationId, challenge, "sess", { providerId: "provider-123", providerVersion: "4.0.0", allowedTags: [] });
    vi.advanceTimersByTime(11 * 60 * 1000);
    expect(consumeVerificationRecord(verificationId)).toBeNull();
    vi.useRealTimers();
  });
});

describe("capabilities", () => {
  it("start blocked unless the dev bypass is on", () => {
    expect(issueCapability(credential).bondStatus).toBe("blocked");
    process.env.ALLOW_DEV_WITHOUT_PRIVATE_BOND = "true";
    expect(issueCapability(credential).bondStatus).toBe("dev-bypass");
  });

  it("gate AI and publishing on the bond", () => {
    const { token } = issueCapability(credential);
    expect(requireBondedCapability(token)).toEqual({ error: "bond-blocked" });
    expect(requireBondedCapability("nope")).toEqual({ error: "invalid" });
    expect(consumePublishCapability(token)).toBeNull();
  });

  it("publish is one-use and can be released after a failed transaction", () => {
    process.env.ALLOW_DEV_WITHOUT_PRIVATE_BOND = "true";
    const { token } = issueCapability(credential);
    expect(consumePublishCapability(token)).not.toBeNull();
    expect(consumePublishCapability(token)).toBeNull();
    releasePublishCapability(token);
    expect(consumePublishCapability(token)).not.toBeNull();
  });

  it("caps AI requests per session", () => {
    process.env.ALLOW_DEV_WITHOUT_PRIVATE_BOND = "true";
    const { token } = issueCapability(credential);
    for (let i = 0; i < MAX_AI_REQUESTS; i += 1) expect(recordAiRequest(token)).toBe(true);
    expect(recordAiRequest(token)).toBe(false);
  });

  it("recovery rotates the token and keeps state", () => {
    process.env.ALLOW_DEV_WITHOUT_PRIVATE_BOND = "true";
    const { token, recoveryCode } = issueCapability(credential);
    recordAiRequest(token);
    const recovered = recoverCapability(recoveryCode);
    expect(recovered).not.toBeNull();
    expect(recovered!.token).not.toBe(token);
    expect(getCapability(token)).toBeNull();
    expect(getCapability(recovered!.token)?.aiRequests).toBe(1);
    expect(recoverCapability("definitely-not-a-code-0123456789")).toBeNull();
  });

  it("never stores the raw token or recovery code", () => {
    const { token, recoveryCode } = issueCapability(credential);
    const record = getCapability(token)!;
    expect(JSON.stringify(record)).not.toContain(token);
    expect(JSON.stringify(record)).not.toContain(recoveryCode);
  });
});

describe("rate limit", () => {
  it("allows up to the limit inside a window and resets after", () => {
    vi.useFakeTimers();
    expect(enforceRateLimit("ip-a", 2, 1000)).toBe(true);
    expect(enforceRateLimit("ip-a", 2, 1000)).toBe(true);
    expect(enforceRateLimit("ip-a", 2, 1000)).toBe(false);
    expect(enforceRateLimit("ip-b", 2, 1000)).toBe(true);
    vi.advanceTimersByTime(1001);
    expect(enforceRateLimit("ip-a", 2, 1000)).toBe(true);
    vi.useRealTimers();
  });
});
