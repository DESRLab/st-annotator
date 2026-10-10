declare const process: { env: Record<string, string | undefined> };

import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export const TEST_USER_PASSWORD = "password";

export function backendUrl() {
  return process.env.STA_BACKEND_URL ?? "http://localhost:8000";
}

export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function uniqueName(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function loginAdmin(page: Page) {
  await page.goto("/login");
  await page
    .getByLabel("Username:")
    .fill(process.env.STA_E2E_ADMIN_USERNAME ?? "admin");
  await page
    .getByLabel("Password:")
    .fill(process.env.STA_E2E_ADMIN_PASSWORD ?? "admin");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL("/");
}

export async function createUserWithRoles(
  page: Page,
  username: string,
  roles: string[],
) {
  const adminLogin = await page.request.post(`${backendUrl()}/auth/login`, {
    form: {
      username: process.env.STA_E2E_ADMIN_USERNAME ?? "admin",
      password: process.env.STA_E2E_ADMIN_PASSWORD ?? "admin",
    },
  });
  expect(adminLogin.ok()).toBe(true);
  const token = ((await adminLogin.json()) as { access_token: string })
    .access_token;
  const existing = await page.request.get(
    `${backendUrl()}/users/?username=${encodeURIComponent(username)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  expect(existing.ok(), "look up test account").toBe(true);
  const users = (await existing.json()) as { roles: string[] }[];
  if (users.length > 0) {
    expect(users).toHaveLength(1);
    expect(users[0].roles).toEqual(expect.arrayContaining(roles));
    expect(users[0].roles).toHaveLength(roles.length);
    return;
  }
  const created = await page.request.post(`${backendUrl()}/users/`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { username, password: TEST_USER_PASSWORD, roles },
  });
  expect(created.ok(), `create test account ${username}`).toBe(true);
}

export async function loginAsRole(
  page: Page,
  role: "data-manager" | "project-manager" | "supervisor" | "annotator" | null,
  username: string,
) {
  await createUserWithRoles(page, username, role === null ? [] : [role]);
  await page.goto("/login");
  await page.getByLabel("Username:").fill(username);
  await page.getByLabel("Password:").fill(TEST_USER_PASSWORD);
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL("/");
}

export async function fillModalText(
  modal: Locator,
  label: string | RegExp,
  value: string,
) {
  await modal.getByLabel(label).fill(value);
}

export async function expectGridContains(
  page: Page,
  gridId: string,
  text: string,
) {
  await expect(page.locator(`#${gridId}`)).toContainText(text);
}

export async function expectGridDoesNotContain(
  page: Page,
  gridId: string,
  text: string,
) {
  await expect(page.locator(`#${gridId}`)).not.toContainText(text);
}

export function gridPager(page: Page, gridId: string) {
  return page
    .locator(`#${gridId}`)
    .locator("xpath=..")
    .locator(".slick-pagination-container");
}

export async function expectGridPaginationFooter(
  page: Page,
  gridId: string,
  minimumTotalItems = 0,
) {
  const pager = gridPager(page, gridId);
  await expect(pager).toBeVisible();
  await expect(pager.getByLabel("Items per Page")).toHaveValue("100");

  const totalItemsText = await pager
    .locator('[data-test="total-items"]')
    .innerText();
  const totalItems = Number.parseInt(totalItemsText, 10);
  expect(totalItems).toBeGreaterThanOrEqual(minimumTotalItems);
  await expect(pager.getByLabel("Page Number")).toHaveValue(
    totalItems === 0 ? /^(0|1)$/ : "1",
  );
}

export async function expectGridPageSizeControl(page: Page, gridId: string) {
  const pager = gridPager(page, gridId);
  const currentPath = new URL(page.url()).pathname;

  await pager.getByLabel("Items per Page").selectOption("25");
  await page.waitForURL(
    (url) =>
      url.pathname === currentPath &&
      url.searchParams.get("page") === "1" &&
      url.searchParams.get("pageSize") === "25",
  );
  await expect(
    gridPager(page, gridId).getByLabel("Items per Page"),
  ).toHaveValue("25");
  const totalItems = Number.parseInt(
    await gridPager(page, gridId)
      .locator('[data-test="total-items"]')
      .innerText(),
    10,
  );
  await expect(gridPager(page, gridId).getByLabel("Page Number")).toHaveValue(
    totalItems === 0 ? /^(0|1)$/ : "1",
  );

  await page.goto(`${currentPath}?page=1&pageSize=100`);
  await expect(page.locator(`#${gridId}`)).toBeVisible();
  await page.locator(`#${gridId} .slick-viewport`).evaluateAll((elements) => {
    for (const element of elements) {
      element.scrollTop = 0;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    }
  });
  await expect(
    gridPager(page, gridId).getByLabel("Items per Page"),
  ).toHaveValue("100");
}

export async function expectSingleSelectGridOnly(
  page: Page,
  gridId: string,
  minimumTotalItems = 0,
) {
  await expectGridPaginationFooter(page, gridId, minimumTotalItems);
  await expect(page.getByRole("button", { name: "Select All" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Deselect All/ })).toHaveCount(
    0,
  );
}

export async function expectMultiSelectButtons(page: Page, gridId: string) {
  await expectGridPaginationFooter(page, gridId, 1);
  const pager = gridPager(page, gridId);
  const currentPath = new URL(page.url()).pathname;

  await pager.getByLabel("Items per Page").selectOption("25");
  await page.waitForURL(
    (url) =>
      url.pathname === currentPath &&
      url.searchParams.get("page") === "1" &&
      url.searchParams.get("pageSize") === "25",
  );

  const totalItemsText = await gridPager(page, gridId)
    .locator('[data-test="total-items"]')
    .innerText();
  const totalItems = Number.parseInt(totalItemsText, 10);
  const pageSize = Number.parseInt(
    await gridPager(page, gridId).getByLabel("Items per Page").inputValue(),
    10,
  );
  const currentPageCount = Math.min(totalItems, pageSize);

  await page.getByRole("button", { name: "Select Current Page" }).click();
  await expect(
    page.getByRole("button", {
      name: `Deselect All (${currentPageCount} selected)`,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: `Deselect All (${currentPageCount} selected)`,
    })
    .click();

  await page.getByRole("button", { name: "Select All" }).click();
  await expect(
    page.getByRole("button", {
      name: `Deselect All (${totalItems} selected)`,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Deselect All (${totalItems} selected)` })
    .click();
  await expect(
    page.getByRole("button", { name: "Select Current Page" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Select All" })).toBeVisible();

  await page.goto(`${currentPath}?page=1&pageSize=100`);
  await expect(page.locator(`#${gridId}`)).toBeVisible();
}

export async function expectNonPaginatedMultiSelectButtons(
  page: Page,
  gridId: string,
) {
  const grid = page.locator(`#${gridId}`);
  await expect(grid).toBeVisible();
  // The grid loads its whole list in one request, so the shared selection group
  // offers a single button: there is no other page for a second one to mean.
  await expect(
    page.getByRole("button", { name: "Select Current Page" }),
  ).toHaveCount(0);
  const selectAll = page.getByRole("button", { name: "Select All" });
  if (await selectAll.isDisabled()) {
    return;
  }

  await selectAll.click();
  const deselectAll = page.getByRole("button", {
    name: /Deselect All \(\d+ selected\)/,
  });
  await expect(deselectAll).toBeVisible();
  const selectedCountLabel = await deselectAll.innerText();
  await deselectAll.click();

  await expect(
    page.getByRole("button", { name: selectedCountLabel }),
  ).toHaveCount(0);
  await expect(selectAll).toBeVisible();
}

async function clickVisibleCommand(page: Page, commandText: string) {
  const menu = page.getByRole("menu");
  if (await menu.isVisible().catch(() => false)) {
    await menu.getByText(commandText, { exact: true }).click();
    return;
  }

  // The menu is portalled, so a host that dropped the role still shows the text.
  await page.getByText(commandText, { exact: true }).click();
}

export async function openRowCommand(
  page: Page,
  rowText: string | RegExp,
  commandText: string,
  options: { keepSelection?: boolean } = {},
) {
  const row = page.getByRole("row", { name: rowText });
  await expect(row).toBeVisible();
  // Left-clicking replaces the selection with this row, so a caller reaching for
  // a batch command passes keepSelection and relies on the context menu keeping
  // a selection the right-clicked row already belongs to.
  if (!options.keepSelection) {
    await row.click();
  }
  await row.click({ button: "right" });
  await clickVisibleCommand(page, commandText);
}

/**
 * Opens a command on a row of a selection the caller built itself.
 *
 * There is no click to select first: that would collapse a multi-row selection to
 * this row, and the batch commands are only offered while several rows are picked.
 */
export async function openSelectionCommand(
  page: Page,
  row: Locator,
  commandText: string,
) {
  await expect(row).toBeVisible();
  await row.click({ button: "right" });
  await clickVisibleCommand(page, commandText);
}

/**
 * Asserts a row command is absent from the context menu of that row.
 *
 * Permission to act on a selection shows up as which commands the menu offers,
 * so a capability that moved out of the toolbar has to be tested where it lives.
 */
export async function expectRowCommandHidden(
  page: Page,
  rowText: string | RegExp,
  commandText: string,
) {
  const row = page.getByRole("row", { name: rowText });
  await expect(row).toBeVisible();
  await row.click();
  await row.click({ button: "right" });
  const menu = page.getByRole("menu");
  const scope = (await menu.isVisible().catch(() => false))
    ? menu
    : page.getByRole("document");
  await expect(scope.getByText(commandText, { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
}

export async function visibleModal(page: Page) {
  const modal = page.locator(".modal.show");
  await expect(modal).toBeVisible();
  return modal;
}

export async function clickTopNav(page: Page, name: string | RegExp) {
  const link = page.locator("#main-navbar").getByRole("link", { name });
  const href = await link.getAttribute("href");
  expect(href, "top navigation link should have a destination").toBeTruthy();
  const targetPath = new URL(href!, page.url()).pathname;
  const deadline = Date.now() + 30_000;
  const reachedTarget = (pathname: string) =>
    pathname === targetPath || pathname === `${targetPath}/groups`;

  // A modal-driven mutation can finish rendering just before React Router's
  // transition cleanup completes. In that short window an anchor click can
  // be observed without committing navigation, so verify the URL and retry
  // the real UI interaction instead of assuming click completion is enough.
  // Always activate the top-level link at least once. Being somewhere under
  // `/label/...` does not mean a click on `/label` can be skipped: nested
  // repository pages have a different sidebar from the section landing page.
  do {
    await link.click();
    await page
      .waitForURL((url) => reachedTarget(url.pathname), { timeout: 2_000 })
      .catch(() => undefined);
    if (Date.now() >= deadline) {
      throw new Error(`Top navigation did not reach ${targetPath}`);
    }
  } while (!reachedTarget(new URL(page.url()).pathname));
}

async function openDropdownItem(
  page: Page,
  buttonName: string | RegExp,
  itemName: string | RegExp,
) {
  const button = page.getByRole("button", { name: buttonName });
  const item = page
    .locator(".dropdown-menu.show")
    .getByRole("link", { name: itemName, exact: true });

  // Every navigation is a full document load and the navbar hydrates
  // asynchronously: clicks that land before hydration hit the plain anchor
  // without opening the menu. Keep retrying the toggle until React responds;
  // isVisible() returns instantly, so a fixed attempt count can burn out in
  // milliseconds under load.
  const deadline = Date.now() + 30_000;
  for (;;) {
    await button.click();
    const opened = await item
      .waitFor({ state: "visible", timeout: 1_000 })
      .then(() => true)
      .catch(() => false);
    if (opened) {
      break;
    }
    if (Date.now() >= deadline) {
      await expect(item).toBeVisible();
      break;
    }
  }
  await item.click();
}

export async function openAccountMenu(page: Page, itemName: string | RegExp) {
  await openDropdownItem(page, "Account", itemName);
}

export async function openAdminPage(page: Page, itemName: string | RegExp) {
  await openDropdownItem(page, "Administration", itemName);
}

export async function clickSidebarLink(page: Page, name: string | RegExp) {
  await page.locator(".nav.flex-column").getByRole("link", { name }).click();
}

/**
 * Reads the plugin composition the frontend serves.
 *
 * `core/frontend/app/sta-config.shim.ts` is one generated file per checkout, so
 * a `scripts/doc.sh`, `scripts/lint.sh`, or core `typecheck` / `lint` /
 * `test:unit` run re-points a dev server that is already up to core's
 * plugin-free `sta.config.ts`. Every Playwright config here starts its frontend
 * with `STA_CONFIG_PATH=distributions/full/frontend/sta.config.ts`, so a served
 * body naming no `distributions/` path means the run is testing a composition it
 * never asked for.
 *
 * Returns `null` when the module cannot be read at all: a server that is down or
 * mid-restart is a different fault, and the waits that depend on it report that
 * rather than being told the wrong cause.
 */
async function servedComposition(page: Page) {
  try {
    const response = await page.request.get("/app/sta-config.shim.ts");
    const text = await response.text();

    return {
      origin: new URL(response.url()).origin,
      // The dev server appends an inline sourcemap many times longer than the
      // one line that names the composition.
      source: text
        .split("\n")
        .filter((line) => line.trim() && !line.startsWith("//#"))
        .join("\n")
        .trim(),
    };
  } catch {
    return null;
  }
}

/**
 * Describes why plugin-contributed UI cannot appear, or `null` if the served
 * composition does register plugins.
 *
 * Anything waiting for a plugin surface would otherwise sit out its full timeout
 * and read as an unrelated defect, so every such wait reports this instead: the
 * origin, the served selection, and how to restore it. The composition is
 * sampled at call time, which is why a caller that has already waited reports
 * what it found rather than assuming the cause.
 */
export async function pluginCompositionProblem(page: Page) {
  const served = await servedComposition(page);
  if (served == null || served.source.includes("distributions/")) return null;

  return (
    `the frontend at ${served.origin} is serving a plugin-free composition, so ` +
    `nothing a plugin contributes can appear on the page. Its dev server was ` +
    `started with the full distribution and re-pointed while running: another ` +
    `job in this checkout rewrote the shared app/sta-config.shim.ts ` +
    `(scripts/doc.sh, scripts/lint.sh, and core's typecheck / lint / test:unit ` +
    `all do). Re-run with no other job in this checkout, or in a worktree of ` +
    `its own.` +
    `\n\nServed app/sta-config.shim.ts:\n${served.source}`
  );
}

/** Fails the test by name when the served composition registers no plugins. */
export async function expectPluginComposition(page: Page) {
  const problem = await pluginCompositionProblem(page);
  if (problem != null)
    throw new Error(`The run cannot see its plugins: ${problem}`);
}

/**
 * Clicks an item-type tab on a data or specifications dashboard.
 *
 * Those tabs are contributed by the composition's plugins, so a plugin-free
 * frontend renders the dashboard with none at all and a bare tab click waits out
 * the whole test timeout; the served composition is therefore sampled here.
 */
export async function clickItemTypeLink(page: Page, name: string) {
  const link = page.getByRole("link", { name });
  const problem = await pluginCompositionProblem(page);
  await expect(
    link,
    problem ?? `dashboard offers no "${name}" item type`,
  ).toBeVisible({ timeout: 10_000 });
  await link.click();
}

export async function clickBreadcrumbLink(page: Page, name: string | RegExp) {
  await page
    .getByRole("navigation", { name: "breadcrumb" })
    .getByRole("link", { name })
    .click();
}
