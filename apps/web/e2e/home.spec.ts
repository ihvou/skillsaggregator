import { expect, test } from "@playwright/test";

test("home renders the badminton skill list", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /best free resources/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /forehand smash/i })).toBeVisible();
});
