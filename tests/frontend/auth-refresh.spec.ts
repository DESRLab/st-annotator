import { expect, test } from "@playwright/test";

import { loginAdmin } from "./helpers/ui";

async function sessionCookieValue(page: Parameters<typeof loginAdmin>[0]) {
  const cookie = (await page.context().cookies()).find(
    ({ name }) => name === "__session",
  );
  expect(cookie).toBeDefined();
  return cookie?.value;
}

test("expired access tokens rotate transparently through the refresh loop", async ({
  page,
}) => {
  await loginAdmin(page);
  const initialSession = await sessionCookieValue(page);

  await page.waitForTimeout(2_500);
  await page.goto("/settings/profile");
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  const firstRotation = await sessionCookieValue(page);
  expect(firstRotation).not.toBe(initialSession);

  // The refresh endpoint rotates both tokens and the backend login epoch.
  // Expire the replacement token and prove that a second rotation also works.
  await page.waitForTimeout(2_500);
  await page.goto("/settings/preferences");
  await expect(page).toHaveURL(/\/settings\/preferences$/);
  await expect(page.getByRole("heading", { name: "Annotator" })).toBeVisible();
  expect(await sessionCookieValue(page)).not.toBe(firstRotation);
});
