import { expect, test } from "@playwright/test";

import {
  createUserThroughUi,
  deleteUserThroughUi,
  loginWith,
  logout,
  validUsername,
} from "./helpers/accounts";
import { loginAdmin, TEST_USER_PASSWORD } from "./helpers/ui";

test.describe.serial("cross-layer authorization policy", () => {
  const noRoleUsername = validUsername("no_role");
  const nonAdminUsername = validUsername("non_admin");

  test("creates browser-policy principals", async ({ page }) => {
    await loginAdmin(page);
    await createUserThroughUi(page, noRoleUsername, TEST_USER_PASSWORD, []);
    await createUserThroughUi(page, nonAdminUsername, TEST_USER_PASSWORD, [
      "project-manager",
    ]);
  });

  test("a signed-in user without roles cannot reach role-protected sections", async ({
    page,
  }) => {
    await loginWith(page, noRoleUsername, TEST_USER_PASSWORD);

    for (const name of [
      "Source Data",
      "Label Data",
      "Background Jobs",
      "Administration",
    ]) {
      await expect(page.getByRole("link", { name })).toHaveCount(0);
    }

    for (const path of ["/source", "/label", "/jobs", "/admin/accounts"]) {
      await page.goto(path);
      await expect(page).toHaveURL("/");
    }
  });

  test("account administration is available to admins and refused to non-admins", async ({
    page,
  }) => {
    await loginAdmin(page);
    await page.goto("/admin/accounts");
    await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create User" }),
    ).toBeVisible();

    await logout(page);
    await loginWith(page, nonAdminUsername, TEST_USER_PASSWORD);
    await expect(
      page.getByRole("link", { name: "Administration" }),
    ).toHaveCount(0);
    await page.goto("/admin/accounts");
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "Accounts" })).toHaveCount(
      0,
    );
  });

  test("cleans up browser-policy principals", async ({ page }) => {
    await loginAdmin(page);
    await deleteUserThroughUi(page, noRoleUsername);
    await deleteUserThroughUi(page, nonAdminUsername);
  });
});
