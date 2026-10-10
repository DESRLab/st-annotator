import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
  loginWith,
  setRoleCheckboxes,
  validUsername,
} from "./helpers/accounts";
import {
  expectGridContains,
  expectGridDoesNotContain,
  expectGridPageSizeControl,
  expectMultiSelectButtons,
  escapeRegex,
  loginAdmin,
  loginAsRole,
  openAccountMenu,
  openAdminPage,
  openRowCommand,
  TEST_USER_PASSWORD,
  visibleModal,
} from "./helpers/ui";

async function scrollAccountsGridToTop(page: Page) {
  await page
    .locator("#accounts-grid .slick-viewport")
    .evaluateAll((elements) => {
      for (const element of elements) {
        element.scrollTop = 0;
        element.dispatchEvent(new Event("scroll", { bubbles: true }));
      }
    });
}

async function filterAccountsByUsername(page: Page, username: string) {
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
  const usernameFilter = page.getByRole("textbox", {
    name: "Username Search Filter",
  });
  await usernameFilter.fill(username);
  await usernameFilter.press("Enter");
  await scrollAccountsGridToTop(page);
  await expect(
    page.getByRole("row", {
      name: new RegExp(`^\\s*\\d+\\s+${escapeRegex(username)}(?:\\s|$)`),
    }),
  ).toBeVisible();
}

async function clearAccountUsernameFilter(page: Page) {
  const usernameFilter = page.getByRole("textbox", {
    name: "Username Search Filter",
  });
  await usernameFilter.fill("");
  await usernameFilter.press("Enter");
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
}

async function openAccountEditModal(
  page: Page,
  username: string,
): Promise<Locator> {
  await filterAccountsByUsername(page, username);
  await openRowCommand(
    page,
    new RegExp(`^\\s*\\d+\\s+${escapeRegex(username)}(?:\\s|$)`),
    "Edit Details",
  );
  return visibleModal(page);
}

test.describe.serial("handbook account workflows", () => {
  const username = validUsername("acct");
  const adminPanelUsername = `${username.slice(0, 25)}_adm`;
  const accountPanelUsername = `${username.slice(0, 25)}_own`;
  const initialPassword = TEST_USER_PASSWORD;
  const adminPanelPassword = "admin_panel_pw";
  const accountPanelPassword = "account_panel_pw";
  const profileUsername = validUsername("profile_user");

  test("opens profile and settings routes", async ({ page }) => {
    // Profile and settings are available to any signed-in user; exercise them
    // with a signed-in account that has no application roles.
    await loginAsRole(page, null, profileUsername);
    await expect(page.getByRole("button", { name: "Account" })).toBeVisible();

    // Verify the account profile page renders for the signed-in user.
    await openAccountMenu(page, "Profile");
    await expect(
      page.getByRole("heading", { name: `Profile of ${profileUsername}` }),
    ).toBeVisible();

    // Verify the settings tabs expose profile, username, password, and preference pages.
    await openAccountMenu(page, "Settings");
    await expect(page).toHaveURL(/\/settings\/profile$/);
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();

    await page
      .locator(".nav.flex-column")
      .getByRole("link", { name: "Account" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Change username" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Update username" }),
    ).toBeVisible();

    // Verify the authentication settings tab exposes the password-change form.
    await page
      .locator(".nav.flex-column")
      .getByRole("link", { name: "Authentication" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Change password" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Update password" }),
    ).toBeVisible();

    await page
      .locator(".nav.flex-column")
      .getByRole("link", { name: "Preferences" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Annotator" }),
    ).toBeVisible();
  });

  test("admin creates and updates accounts", async ({ page }) => {
    await loginAdmin(page);
    // Verify the admin account table lists the built-in role accounts.
    await openAdminPage(page, "Manage accounts");
    await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
    await expectGridContains(page, "accounts-grid", "admin");
    await expectGridContains(page, "accounts-grid", "data-manager");
    await expectGridContains(page, "accounts-grid", "project-manager");
    await expectGridContains(page, "accounts-grid", "supervisor");
    await expectGridContains(page, "accounts-grid", "annotator");

    // Verify an administrator cannot remove the admin role from their own account.
    let modal = await openAccountEditModal(page, "admin");
    await modal.getByRole("checkbox", { name: "admin", exact: true }).uncheck();
    await modal.getByRole("button", { name: "Save" }).click();
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("alert")).toContainText(
      /cannot remove.*admin.*own account/i,
    );
    // A rejected submit is reported once, inside the dialog that caused it; the
    // page must not repeat it above the table behind the backdrop.
    await expect(page.getByRole("alert")).toHaveCount(1);
    await modal.getByRole("button", { name: "Cancel" }).click();
    await expect(modal).toBeHidden();

    modal = await openAccountEditModal(page, "admin");
    await expect(
      modal.getByRole("checkbox", { name: "admin", exact: true }),
    ).toBeChecked();
    await modal.getByRole("button", { name: "Cancel" }).click();
    await expect(modal).toBeHidden();
    // Verify an administrator can create a new user with an initial role and password.
    await page.getByRole("button", { name: "Create User" }).click();
    modal = page.locator(".modal.show");
    await modal.locator('input[name="username"]').fill(username);
    await modal.locator('input[name="password"]').fill(initialPassword);
    await setRoleCheckboxes(modal, ["annotator"]);
    await modal.getByRole("button", { name: "Save" }).click();
    await expect(modal).toBeHidden();
    await filterAccountsByUsername(page, username);
    await expectGridContains(page, "accounts-grid", username);

    // Verify admin-side account updates can change username, password, and roles.
    modal = await openAccountEditModal(page, username);
    await modal.locator('input[name="username"]').fill(adminPanelUsername);
    await modal.locator('input[name="password"]').fill(adminPanelPassword);
    await setRoleCheckboxes(modal, ["admin", "supervisor", "annotator"]);
    await modal.getByRole("button", { name: "Save" }).click();
    await expect(modal).toBeHidden();
    await filterAccountsByUsername(page, adminPanelUsername);
    await expectGridContains(page, "accounts-grid", adminPanelUsername);
    await expectGridContains(page, "accounts-grid", "supervisor");
  });

  test("a user updates their own account credentials", async ({ page }) => {
    // Verify the admin-updated credentials can be used to sign in.
    await loginWith(page, adminPanelUsername, adminPanelPassword);

    await openAdminPage(page, "Manage accounts");
    await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();

    // Verify a user can update their own username from account settings.
    await openAccountMenu(page, "Settings");
    await page
      .locator(".nav.flex-column")
      .getByRole("link", { name: "Account" })
      .click();
    await page.getByLabel("Username:").fill(accountPanelUsername);
    await page.getByRole("button", { name: "Update username" }).click();
    await expect(page).toHaveURL(/\/login(?:\?returnTo=.*)?$/);
    await expect(
      page.getByText("Your session has expired. Please log in again."),
    ).toBeVisible();
    await loginWith(page, accountPanelUsername, adminPanelPassword);

    await openAccountMenu(page, "Settings");

    // Verify a user can update their own password from authentication settings.
    await page
      .locator(".nav.flex-column")
      .getByRole("link", { name: "Authentication" })
      .click();
    await page.getByLabel("Current password:").fill(adminPanelPassword);
    await page
      .getByLabel("New password:", { exact: true })
      .fill(accountPanelPassword);
    await page.getByLabel("Confirm new password:").fill(accountPanelPassword);
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page).toHaveURL("/login");
    await expect(
      page.getByText("Password updated. Please log in again."),
    ).toBeVisible();

    // The password change revokes the active session; verify the new
    // self-service username and password can establish a fresh session.
    await loginWith(page, accountPanelUsername, accountPanelPassword);
    await openAccountMenu(page, "Profile");
    await expect(
      page.getByRole("heading", {
        name: `Profile of ${accountPanelUsername}`,
      }),
    ).toBeVisible();
  });

  test("admin removes the temporary account", async ({ page }) => {
    // Verify the administrator can delete the test account.
    await loginAdmin(page);
    await openAdminPage(page, "Manage accounts");
    await filterAccountsByUsername(page, accountPanelUsername);
    await openRowCommand(page, new RegExp(accountPanelUsername), "Delete");
    const modal = await visibleModal(page);
    await modal.getByRole("button", { name: "Delete User" }).click();
    await expect(modal).toBeHidden();
    await expectGridDoesNotContain(page, "accounts-grid", accountPanelUsername);
    await clearAccountUsernameFilter(page);
    await expectGridPageSizeControl(page, "accounts-grid");
    await expectMultiSelectButtons(page, "accounts-grid");
  });
});
