import { expect, test } from "@playwright/test";

test("skill page renders json-ld and resources area", async ({ page }) => {
  await page.goto("/badminton/forehand-smash");
  await expect(page.getByRole("heading", { level: 1, name: "Forehand smash" })).toBeVisible();
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(2);
});
