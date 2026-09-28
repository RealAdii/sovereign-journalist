import { expect, test } from "@playwright/test";

test("encrypted tip path is visibly blocked and the real route stores nothing", async ({ page, request }) => {
  await page.goto("/submit/tip");
  await expect(page.getByRole("heading", { name: "Encrypted tip path" })).toBeVisible();
  await expect(page.getByText("blocked", { exact: true })).toBeVisible();
  await expect(page.getByText(/missing before this can be enabled/)).toBeVisible();
  await expect(page.locator("form")).toHaveCount(0);
  await expect(page.locator("textarea")).toHaveCount(0);

  const res = await request.post("/api/tips", { data: { message: "should not be stored" } });
  expect(res.status()).toBe(503);
  const body = await res.json();
  expect(body.error).toMatch(/Nothing you typed was stored/);
  expect(body.missing.length).toBeGreaterThan(2);
});

test("recovery code issues a fresh session and continues the flow", async ({ page }) => {
  await page.route("**/api/recover", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ token: "recovered-token", expiresAt: Date.now() + 3_600_000, bondStatus: "dev-bypass" }),
    }),
  );
  await page.goto("/submit/recover");
  const submit = page.getByRole("button", { name: "Recover" });
  await expect(submit).toBeDisabled();
  await page.getByLabel("Recovery code").fill("abcdefghijklmnopqrstuvwxyz");
  await submit.click();
  await page.waitForURL("**/submit/interview");
  expect(await page.evaluate(() => sessionStorage.getItem("sj_token"))).toBe("recovered-token");
});

test("a wrong recovery code is rejected by the real route", async ({ page }) => {
  await page.goto("/submit/recover");
  await page.getByLabel("Recovery code").fill("not-a-real-code-but-long-enough");
  await page.getByRole("button", { name: "Recover" }).click();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("No active session matches");
});

test("submit overview states the limits and the blocked paths; capabilities and attestation are honest", async ({ page, request }) => {
  await page.goto("/submit");
  await expect(page.getByText("The interview stays on this server.")).toBeVisible();
  await expect(page.getByText("The article is public forever.")).toBeVisible();
  await expect(page.getByText("Bond: 1 STRK on Sepolia, refundable.")).toBeVisible();
  const caps = await (await request.get("/api/capabilities")).json();
  expect(caps.network).toBe("SN_SEPOLIA");
  expect(caps.encryptedTips.enabled).toBe(false);
  expect(caps.aiInterview.provider).toBe("ollama");
  expect(caps.aiInterview.external).toBe(false);
  expect(caps.aiInterview.enabled).toBe(false); // unreachable dummy URL in e2e
  expect(caps.confidentialCompute.enabled).toBe(false);
  const att = await (await request.get("/api/attestation")).json();
  expect(att.tee).toBe(false);
});
