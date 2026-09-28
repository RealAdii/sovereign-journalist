import { expect, test } from "@playwright/test";
import { FAKE_TOKEN, mockInterview, runInterview, seedSession } from "./helpers";

test.describe("failure cases (mocked backend)", () => {
  test("AI failure shows the error and restores the message", async ({ page }) => {
    await seedSession(page);
    await mockInterview(page, { interviewStatus: 502 });
    await page.goto("/submit/interview");
    await page.getByRole("button", { name: /I understand, start the interview/ }).click();
    await page.getByLabel("Your message").fill("This should come back to the box.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("AI provider returned status 503");
    await expect(page.getByLabel("Your message")).toHaveValue("This should come back to the box.");
    await expect(page.getByText("0 messages exchanged")).toBeVisible();
  });

  test("RPC failure during fee estimation is shown inside the editor", async ({ page }) => {
    await seedSession(page);
    await mockInterview(page, { estimateStatus: 502 });
    await runInterview(page, 3);
    await page.getByRole("button", { name: /End interview and draft article/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Estimate fee" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Fee estimation failed on Sepolia");
    await expect(dialog.getByRole("button", { name: "Estimate fee" })).toBeVisible();
  });

  test("rejected publication keeps the editor open and never shows Published", async ({ page }) => {
    await seedSession(page);
    await mockInterview(page, { publishStatus: 502 });
    await runInterview(page, 3);
    await page.getByRole("button", { name: /End interview and draft article/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Estimate fee" }).click();
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: /Publish to Starknet Sepolia/ }).click();
    await expect(dialog.getByRole("alert")).toContainText("Sepolia rejected the publication transaction");
    await expect(page.getByText("Published on Starknet Sepolia")).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem("sj_token"))).toBe(FAKE_TOKEN);
  });

  test("a session without a bond is sent to the bond page and the bond page shows the blocker", async ({ page }) => {
    await seedSession(page, "blocked");
    await page.route("**/api/bond", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ network: "SN_SEPOLIA", token: "STRK", amount: "1", refundable: true, status: "blocked", missing: ["A verified STRK20 Sepolia pool", "An unlinkable refund path"] }),
      }),
    );
    await page.goto("/submit/interview");
    await page.waitForURL("**/submit/bond");
    await expect(page.getByText("1 STRK")).toBeVisible();
    await expect(page.getByText("anonymous bond is blocked on Sepolia")).toBeVisible();
    await expect(page.getByText("An unlinkable refund path")).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue/ })).toHaveCount(0);
  });

  test("wallet receipts are refused by the real bond route", async ({ request }) => {
    const res = await request.post("/api/bond", { data: { token: FAKE_TOKEN, transactionHash: "0xpublic" } });
    expect([401, 503]).toContain(res.status());
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test("no session redirects to verification", async ({ page }) => {
    await page.goto("/submit/interview");
    await page.waitForURL("**/submit/verify");
    await expect(page.getByText("Prove a credential")).toBeVisible();
    await expect(page.getByText(/what a proof can reveal/)).toBeVisible();
  });
});
