import type { Page } from "@playwright/test";

export const FAKE_TOKEN = "e2e-token-not-a-real-capability";

export async function seedSession(page: Page, bondStatus: "dev-bypass" | "blocked" = "dev-bypass") {
  await page.addInitScript(
    ({ token, status }) => {
      sessionStorage.setItem("sj_token", token);
      sessionStorage.setItem("sj_bond_status", status);
      sessionStorage.setItem("sj_provider", "provider-e2e");
      sessionStorage.setItem("sj_expires", String(Date.now() + 60 * 60 * 1000));
    },
    { token: FAKE_TOKEN, status: bondStatus },
  );
}

export const draft = {
  version: 1,
  title: "Contractor invoices approved before inspection, source says",
  subtitle: "A source with a proven credential describes a procurement pattern. The account has not been independently corroborated.",
  body: "## What has been proven\n\nThe source proved a credential.\n\n## Account\n\nThe source says invoices were approved early.\n\n| Element | Status |\n| --- | --- |\n| Credential | proven |\n| Claim | `reported` |\n\n## What has not been independently corroborated\n\nEverything above.",
  sourceStatus: "credential-proven",
  allegationStatus: "reported",
};

export const estimate = {
  articleId: "0x1f2e3d4c5b6a79880123456789abcdef0123456789abcdef0123456789abcd",
  approvedDigest: "0x1f2e3d4c5b6a79880123456789abcdef0123456789abcdef0123456789abcd",
  feeFri: "1234500000000000",
  feeStrk: "0.0012345",
  calldataFelts: 42,
  byteLengths: { title: 60, subtitle: 120, body: 400 },
  network: "SN_SEPOLIA",
};

export const published = {
  articleId: estimate.articleId,
  transactionHash: "0x0abc0abc0abc0abc0abc0abc0abc0abc0abc0abc0abc0abc0abc0abc0abc0abc",
  readBackMatched: true,
  explorerUrl: "https://sepolia.voyager.online/tx/0x0abc",
};

export async function mockInterview(page: Page, opts: { interviewStatus?: number; estimateStatus?: number; publishStatus?: number } = {}) {
  await page.route("**/api/interview", (route) => {
    if (opts.interviewStatus && opts.interviewStatus !== 200) {
      return route.fulfill({ status: opts.interviewStatus, contentType: "application/json", body: JSON.stringify({ error: "The AI provider returned status 503" }) });
    }
    return route.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", body: "Thank you. What happened first, and when did you notice it?" });
  });
  await page.route("**/api/generate", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ article: draft }) }),
  );
  await page.route("**/api/publish/estimate", (route) => {
    if (opts.estimateStatus && opts.estimateStatus !== 200) {
      return route.fulfill({ status: opts.estimateStatus, contentType: "application/json", body: JSON.stringify({ error: "Fee estimation failed on Sepolia. Try again in a moment." }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(estimate) });
  });
  await page.route("**/api/publish", (route) => {
    if (opts.publishStatus && opts.publishStatus !== 200) {
      return route.fulfill({ status: opts.publishStatus, contentType: "application/json", body: JSON.stringify({ error: "Sepolia rejected the publication transaction" }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(published) });
  });
}

export async function runInterview(page: Page, turns = 3) {
  await page.goto("/submit/interview");
  await page.getByRole("button", { name: /I understand, start the interview/ }).click();
  for (let i = 0; i < turns; i += 1) {
    await page.getByLabel("Your message").fill(`Message ${i + 1} about the procurement issue.`);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await page.getByText("What happened first").nth(i).waitFor();
  }
}
