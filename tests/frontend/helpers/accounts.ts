import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import {
  expectGridDoesNotContain,
  openAdminPage,
  openRowCommand,
  uniqueName,
  visibleModal,
} from "./ui";

export function validUsername(prefix: string) {
  return uniqueName(prefix).replaceAll("-", "_").slice(0, 31);
}

export async function loginWith(
  page: Page,
  username: string,
  password: string,
) {
  await page.goto("/login");
  await page.getByLabel("Username:").fill(username);
  await page.getByLabel("Password:").fill(password);
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL("/");
}

export async function logout(page: Page) {
  await page.goto("/logout");
  await expect(page).toHaveURL("/login");
}

// Mirrors ALL_ROLES in core/frontend/app/models/user.ts. The boxes are addressed
// by their own accessible name, so the list order carries no meaning here.
const ACCOUNT_ROLES = [
  "admin",
  "data-manager",
  "project-manager",
  "supervisor",
  "annotator",
];

export async function setRoleCheckboxes(modal: Locator, roles: string[]) {
  for (const role of ACCOUNT_ROLES) {
    const checkbox = modal.getByRole("checkbox", { name: role, exact: true });
    if (roles.includes(role)) {
      await checkbox.check();
    } else {
      await checkbox.uncheck();
    }
  }
}

export async function openAccountsPage(page: Page) {
  if (
    !(await page
      .getByRole("heading", { name: "Accounts" })
      .isVisible()
      .catch(() => false))
  ) {
    await openAdminPage(page, "Manage accounts");
  }

  const url = new URL(page.url());
  if (
    url.searchParams.get("page") !== "1" ||
    url.searchParams.get("pageSize") !== "100"
  ) {
    await page.goto(`${url.pathname}?page=1&pageSize=100`);
  }
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
}

export async function createUserThroughUi(
  page: Page,
  username: string,
  password: string,
  roles: string[],
) {
  await openAccountsPage(page);
  await page.getByRole("button", { name: "Create User" }).click();
  const modal = await visibleModal(page);
  await modal.locator('input[name="username"]').fill(username);
  await modal.locator('input[name="password"]').fill(password);
  await setRoleCheckboxes(modal, roles);
  await modal.getByRole("button", { name: "Save" }).click();
  await expect(modal).toBeHidden();
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
}

export async function deleteUserThroughUi(page: Page, username: string) {
  await page.goto("/admin/accounts?page=1&pageSize=500");
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
  const usernameFilter = page.getByLabel("Username Search Filter");
  await usernameFilter.fill(username);
  await usernameFilter.press("Enter");
  await expect(
    page.getByRole("row", { name: new RegExp(username) }),
  ).toBeVisible();
  await openRowCommand(page, new RegExp(username), "Delete");
  const modal = await visibleModal(page);
  await modal.getByRole("button", { name: "Delete User" }).click();
  await expect(modal).toBeHidden();
  await expectGridDoesNotContain(page, "accounts-grid", username);
}

// Mirrors BRANCH_PERMISSION_LABELS in core/frontend/app/routes/label/repo/branches.tsx
// for the levels the e2e specs grant through the branch permission editor.
export type BranchPermissionLabel = "Read" | "Write" | "Write Elevated";

export async function setBranchPermission(
  modal: Locator,
  username: string,
  permission: BranchPermissionLabel,
) {
  const row = modal
    .locator(".d-flex.align-items-center")
    .filter({ hasText: username })
    .first();
  await expect(row).toBeVisible();
  await row.locator("select").selectOption({ label: permission });
}
