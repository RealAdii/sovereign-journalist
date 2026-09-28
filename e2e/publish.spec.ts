import { expect, test } from "@playwright/test";
import { estimate, mockInterview, published, runInterview, seedSession } from "./helpers";

test.describe("publish flow (mocked backend, dev bypass)", () => {
  test("disclosure gate, interview, draft, edit, fee estimate, irreversible confirmation, published screen", async ({ page }) => {
    await seedSession(page);
    await mockInterview(page);
    await page.goto("/submit/interview");

    // The Google disclosure must appear before any message can be typed.
    await expect(page.getByText("Where your words go")).toBeVisible();
    await expect(page.getByText(/sent to Google/)).toBeVisible();
    await expect(page.getByLabel("Your message")).toHaveCount(0);

    await runInterview(page, 3);
    await expect(page.getByText("6 messages exchanged")).toBeVisible();

    await page.getByRole("button", { name: /End interview and draft article/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Your public article")).toBeVisible();
    await expect(dialog.getByText(/Exactly this text will be written to Starknet Sepolia/)).toBeVisible();

    // Editing is possible and a fee estimate is required before publishing.
    const title = dialog.getByLabel(/^Title/);
    await title.fill("Contractor invoices approved before inspection, one source says");
    await expect(dialog.getByRole("button", { name: /Publish to Starknet Sepolia/ })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Estimate fee" }).click();
    await expect(dialog.getByText(`${estimate.feeStrk} STRK`)).toBeVisible();
    await expect(dialog.getByText(estimate.articleId)).toBeVisible();

    // Preview renders the Markdown table rather than leaking pipes.
    await dialog.getByRole("button", { name: "Preview" }).click();
    await expect(dialog.locator("table")).toHaveCount(1);
    await expect(dialog.locator("code", { hasText: "reported" })).toHaveCount(1);
    await dialog.getByRole("button", { name: "Edit" }).click();

    const publish = dialog.getByRole("button", { name: /Publish to Starknet Sepolia/ });
    await expect(publish).toBeDisabled();
    await dialog.getByRole("checkbox").check();
    await expect(publish).toBeEnabled();
    await publish.click();

    await expect(page.getByText("Published on Starknet Sepolia")).toBeVisible();
    await expect(page.getByText(published.articleId)).toBeVisible();
    await expect(page.getByRole("link", { name: published.transactionHash })).toBeVisible();
    await expect(page.getByText(/read back from the contract byte for byte/)).toBeVisible();

    // The token is gone from the browser after publication.
    expect(await page.evaluate(() => sessionStorage.getItem("sj_token"))).toBeNull();
  });

  test("editing after the estimate invalidates it and over-limit text blocks the estimate", async ({ page }) => {
    await seedSession(page);
    await mockInterview(page);
    await runInterview(page, 3);
    await page.getByRole("button", { name: /End interview and draft article/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Estimate fee" }).click();
    await expect(dialog.getByText(estimate.articleId)).toBeVisible();
    await dialog.getByLabel(/^Subtitle/).fill("Changed after the estimate.");
    await expect(dialog.getByText(estimate.articleId)).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Estimate fee" })).toBeVisible();

    await dialog.getByLabel(/^Title/).fill("x".repeat(181));
    await expect(dialog.getByText(/exceed the onchain byte limit/)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Estimate fee" })).toBeDisabled();
  });
});
