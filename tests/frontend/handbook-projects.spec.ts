declare const process: { env: Record<string, string | undefined> };

import { expect, type Locator, type Page, test } from "@playwright/test";

import {
  type BranchPermissionLabel,
  deleteUserThroughUi,
  loginWith,
  logout,
  setBranchPermission,
  validUsername,
} from "./helpers/accounts";
import {
  backendUrl,
  clickBreadcrumbLink,
  clickSidebarLink,
  clickTopNav,
  createUserWithRoles,
  escapeRegex,
  expectGridContains,
  expectGridDoesNotContain,
  expectGridPageSizeControl,
  expectGridPaginationFooter,
  expectRowCommandHidden,
  gridPager,
  loginAdmin,
  openRowCommand,
  openSelectionCommand,
  TEST_USER_PASSWORD,
  uniqueName,
  visibleModal,
} from "./helpers/ui";

function formatCoords(x: number, y: number, z: number) {
  return `(${x.toFixed(6)}, ${y.toFixed(6)}, ${z.toFixed(6)})`;
}

function rowWith(...parts: string[]) {
  return new RegExp(parts.map(escapeRegex).join(".*"));
}

async function selectLabelBranch(select: Locator, branchName: string) {
  // The form distinguishes same-named branches by rendering options as
  // "label group / branch". Select the unique option that contains the
  // fixture branch name instead of assuming its visible label is bare.
  const option = select.locator("option").filter({ hasText: branchName });
  await expect(option).toHaveCount(1);
  const value = await option.getAttribute("value");
  expect(value).toBeTruthy();
  await select.selectOption(value!);
}

function matchesUrl(page: Page, pattern: RegExp) {
  return pattern.test(new URL(page.url()).pathname);
}

async function expectUrlToMatchOneOf(page: Page, patterns: RegExp[]) {
  await page
    .waitForURL(
      (url) => patterns.some((pattern) => pattern.test(url.pathname)),
      { timeout: 5_000 },
    )
    .catch(() => undefined);
  expect(patterns.some((pattern) => matchesUrl(page, pattern))).toBe(true);
}

async function getAccessToken(page: Page, username: string, password: string) {
  const response = await page.request.post(`${backendUrl()}/auth/login`, {
    form: { username, password },
  });
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { access_token: string }).access_token;
}

async function seedTaskResourceAssociation(
  page: Page,
  data: {
    username: string;
    password: string;
    projectName: string;
    taskName: string;
    sourceGroupName: string;
    labelGroupName: string;
    labelBranchName: string;
  },
) {
  const accessToken = await getAccessToken(page, data.username, data.password);
  const headers = { Authorization: `Bearer ${accessToken}` };

  async function findOne<T extends { id: number }>(
    path: string,
    query: Record<string, string | number>,
  ) {
    const url = new URL(`${backendUrl()}${path}`);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, String(value));
    }
    const response = await page.request.get(url.toString(), { headers });
    expect(response.ok(), `GET ${url.pathname} should succeed`).toBe(true);
    const records = (await response.json()) as T[];
    expect(
      records,
      `${url.pathname} should contain exactly one fixture`,
    ).toHaveLength(1);
    return records[0];
  }

  const project = await findOne("/projects/", { name: data.projectName });
  const task = await findOne("/tasks/", {
    project_id: project.id,
    name: data.taskName,
  });
  const account = await findOne("/accounts/", { username: data.username });
  const sourceGroup = await findOne("/source/groups/", {
    name: data.sourceGroupName,
  });
  const labelGroup = await findOne("/label/groups/", {
    name: data.labelGroupName,
  });
  const labelBranch = await findOne("/label/repo/branches/", {
    group_id: labelGroup.id,
    name: data.labelBranchName,
  });

  // Task data selectors are deliberately scoped to resources already used by
  // that task. Seed the initial association through the API, then exercise all
  // user-facing frame creation, editing, and deletion through the UI below.
  const response = await page.request.post(`${backendUrl()}/frames/`, {
    headers,
    data: {
      work_type: "annotate",
      task_id: task.id,
      account_id: account.id,
      source_group_id: sourceGroup.id,
      label_branch_id: labelBranch.id,
    },
  });
  expect(response.ok(), "initial task frame should be created").toBe(true);
}

async function setBranchPermissions(
  modal: Locator,
  permissions: { username: string; permission: BranchPermissionLabel }[],
) {
  for (const permission of permissions) {
    await setBranchPermission(
      modal,
      permission.username,
      permission.permission,
    );
  }
}

async function assignPickerOption(
  scope: Locator,
  label: string,
  optionLabel: string,
) {
  const section = scope.locator(".mb-3").filter({ hasText: label }).first();
  await expect(section).toBeVisible();
  await section.locator("select").first().selectOption({ label: optionLabel });
  await section.getByTitle("Assign items").click();
  await expect(section.locator("select").nth(1)).toContainText(optionLabel);
}

async function createSourceGroupThroughUi(page: Page, name: string) {
  await clickTopNav(page, "Source Data");
  await expect(
    page.getByRole("heading", { name: "Source Groups" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create Group" }).click();
  const modal = await visibleModal(page);
  await modal.locator('input[name="name"]').fill(name);
  await modal
    .locator('textarea[name="description"]')
    .fill("Source group created for project frame CRUD workflow.");
  await modal.getByRole("button", { name: "Save" }).click();
  await expect(modal).toBeHidden();
  await expectGridContains(page, "sourceGroups-grid", name);
}

async function createLabelGroupAndBranchThroughUi(
  page: Page,
  labelGroupName: string,
  branchName: string,
  permissions: { username: string; permission: BranchPermissionLabel }[] = [],
) {
  await clickTopNav(page, "Label Data");
  await expect(
    page.getByRole("heading", { name: "Label Groups" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create Group" }).click();
  let modal = await visibleModal(page);
  await modal.locator('input[name="name"]').fill(labelGroupName);
  await modal
    .locator('textarea[name="description"]')
    .fill("Label group created for project frame CRUD workflow.");
  await modal.getByRole("button", { name: "Save" }).click();
  await expect(modal).toBeHidden();
  await expectGridContains(page, "labelGroups-grid", labelGroupName);

  await clickSidebarLink(page, "Repositories");
  await expectGridContains(page, "labelRepositories-grid", labelGroupName);
  await openRowCommand(page, new RegExp(labelGroupName), "Open Repository");
  await expect(page).toHaveURL(/\/label\/repos\/\d+\/branches$/);
  await page.getByRole("button", { name: "Create Branch" }).click();
  modal = await visibleModal(page);
  await modal.locator('input[name="name"]').fill(branchName);
  await setBranchPermissions(modal, permissions);
  await modal.getByRole("button", { name: "Save" }).click();
  await expect(modal).toBeHidden();
  await expectGridContains(page, "repositoryBranches-grid", branchName);
}

async function expectProjectManagerDataManagementReadOnly(
  page: Page,
  data: {
    sourceGroupName: string;
    labelGroupName: string;
  },
) {
  await clickTopNav(page, "Source Data");
  await expect(
    page.getByRole("heading", { name: "Source Groups" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Group" })).toHaveCount(
    0,
  );
  await expect(
    page
      .locator(".nav.flex-column")
      .getByRole("link", { name: "File Explorer" }),
  ).toHaveCount(0);
  await expect(
    page
      .locator(".nav.flex-column")
      .getByRole("link", { name: "Data Storage" }),
  ).toBeVisible();
  await expect(
    page
      .locator(".nav.flex-column")
      .getByRole("link", { name: "Specifications" }),
  ).toBeVisible();
  await expectGridContains(page, "sourceGroups-grid", data.sourceGroupName);
  await openRowCommand(page, new RegExp(data.sourceGroupName), "View Details");
  let modal = await visibleModal(page);
  await expect(modal).toContainText("View Group");
  await expect(modal.getByRole("button", { name: "Save" })).toHaveCount(0);
  await modal
    .locator(".modal-footer")
    .getByRole("button", { name: "Close" })
    .click();
  await expect(modal).toBeHidden();

  await clickTopNav(page, "Label Data");
  await expect(
    page.getByRole("heading", { name: "Label Groups" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Group" })).toHaveCount(
    0,
  );
  await expect(
    page
      .locator(".nav.flex-column")
      .getByRole("link", { name: "Data Storage" }),
  ).toBeVisible();
  await expect(
    page
      .locator(".nav.flex-column")
      .getByRole("link", { name: "Specifications" }),
  ).toBeVisible();
  await expectGridContains(page, "labelGroups-grid", data.labelGroupName);
  await openRowCommand(page, new RegExp(data.labelGroupName), "View Details");
  modal = await visibleModal(page);
  await expect(modal).toContainText("View Group");
  await expect(modal.getByRole("button", { name: "Save" })).toHaveCount(0);
  await modal
    .locator(".modal-footer")
    .getByRole("button", { name: "Close" })
    .click();
  await expect(modal).toBeHidden();
}

async function openTaskRecentFromTaskGrid(
  page: Page,
  taskName: string | RegExp,
) {
  const taskRow =
    typeof taskName === "string" ? new RegExp(escapeRegex(taskName)) : taskName;
  const taskListUrl = /\/projects\/\d+\/tasks$/;
  const taskUrl =
    /\/projects\/\d+\/tasks\/\d+(?:\/(?:recent|frames)(?:\/(?:annotate|review))?)?$/;

  if (taskListUrl.test(new URL(page.url()).pathname)) {
    const url = new URL(page.url());
    url.searchParams.set("page", "1");
    url.searchParams.set("pageSize", "100");
    await page.goto(`${url.pathname}?${url.searchParams.toString()}`);
    await expect(page.locator("#tasks-grid")).toBeVisible();
  }

  const taskSidebarAllFrames = page
    .locator(".nav.flex-column")
    .getByRole("link", { name: "All Frames" });
  if (!taskListUrl.test(new URL(page.url()).pathname)) {
    await expect(taskSidebarAllFrames).toBeVisible();
    return;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    if (
      await taskSidebarAllFrames
        .isVisible({ timeout: 1_000 })
        .catch(() => false)
    ) {
      return;
    }

    const row = page.getByRole("row", { name: taskRow });
    const isRowVisible = await row
      .isVisible({ timeout: 2_000 })
      .catch(() => false);
    if (
      await taskSidebarAllFrames
        .isVisible({ timeout: 1_000 })
        .catch(() => false)
    ) {
      return;
    }

    if (!taskListUrl.test(new URL(page.url()).pathname)) {
      continue;
    }

    if (!isRowVisible) {
      await page.waitForTimeout(250);
      continue;
    }

    await row.click({ timeout: 2_000 }).catch(() => undefined);
    if (
      await taskSidebarAllFrames
        .isVisible({ timeout: 1_000 })
        .catch(() => false)
    ) {
      return;
    }

    if (!taskListUrl.test(new URL(page.url()).pathname)) {
      continue;
    }

    await row.click({ button: "right", timeout: 2_000 }).catch(() => undefined);
    if (
      await taskSidebarAllFrames
        .isVisible({ timeout: 1_000 })
        .catch(() => false)
    ) {
      return;
    }

    if (!taskListUrl.test(new URL(page.url()).pathname)) {
      continue;
    }

    const menu = page.getByRole("menu");
    const openCommand = (await menu
      .isVisible({ timeout: 1_000 })
      .catch(() => false))
      ? menu.getByText("Open", { exact: true })
      : page.getByText("Open", { exact: true });
    await openCommand.click({ timeout: 2_000 }).catch(() => undefined);
    await page
      .waitForURL(
        (url) => taskUrl.test(url.pathname) || taskListUrl.test(url.pathname),
        { timeout: 5_000 },
      )
      .catch(() => undefined);

    if (
      await taskSidebarAllFrames
        .isVisible({ timeout: 2_000 })
        .catch(() => false)
    ) {
      return;
    }

    if (taskListUrl.test(new URL(page.url()).pathname)) {
      await page.waitForTimeout(500);
      continue;
    }
  }

  await expect(taskSidebarAllFrames).toBeVisible();
}

async function openProjectTaskThroughUi(
  page: Page,
  projectName: string,
  taskName: string,
) {
  await clickTopNav(page, "Projects");
  await expectGridContains(page, "projects-grid", projectName);
  await openRowCommand(page, new RegExp(projectName), "Open");
  await expect(page).toHaveURL(/\/projects\/\d+\/tasks$/);
  const tasksUrl = new URL(page.url());
  tasksUrl.searchParams.set("page", "1");
  tasksUrl.searchParams.set("pageSize", "100");
  await page.goto(`${tasksUrl.pathname}?${tasksUrl.searchParams.toString()}`);
  await expect(page.locator("#tasks-grid")).toBeVisible();
  await expectGridContains(page, "tasks-grid", taskName);
  await openTaskRecentFromTaskGrid(page, taskName);
}

async function deleteSourceGroupThroughUi(page: Page, name: string) {
  await clickTopNav(page, "Source Data");
  await openRowCommand(page, new RegExp(name), "Delete");
  const modal = await visibleModal(page);
  await modal.getByRole("button", { name: "Delete Group" }).click();
  await expect(modal).toBeHidden();
  await expectGridDoesNotContain(page, "sourceGroups-grid", name);
}

async function deleteLabelGroupThroughUi(page: Page, name: string) {
  await clickTopNav(page, "Label Data");
  await openRowCommand(page, new RegExp(name), "Delete");
  const modal = await visibleModal(page);
  await modal.getByRole("button", { name: "Delete Group" }).click();
  await expect(modal).toBeHidden();
  await expectGridDoesNotContain(page, "labelGroups-grid", name);
}

async function openFrameTable(page: Page, mode: "annotate" | "review") {
  await clickSidebarLink(page, "All Frames");
  await page
    .getByRole("link", {
      name: mode === "annotate" ? "Annotator Frames" : "Reviewer Frames",
    })
    .click();
  await expectUrlToMatchOneOf(page, [
    new RegExp(`/projects/\\d+/tasks/\\d+/frames/${mode}$`),
    new RegExp(`/projects/\\d+/tasks/\\d+/recent/${mode}$`),
  ]);
}

async function openRecentFrameTable(page: Page, mode: "annotate" | "review") {
  await clickSidebarLink(page, "Recent Frames");
  await page
    .getByRole("link", {
      name: mode === "annotate" ? "Annotator Frames" : "Reviewer Frames",
    })
    .click();
  await expectUrlToMatchOneOf(page, [
    new RegExp(`/projects/\\d+/tasks/\\d+/recent/${mode}$`),
    new RegExp(`/projects/\\d+/tasks/\\d+/frames/${mode}$`),
  ]);
  await expect(
    page.locator("#recent-frames-grid-container-grid"),
  ).toBeVisible();
}

async function expectFrameAccountFilterOptions(
  page: Page,
  data: {
    includedUsernames: string[];
    excludedUsernames: string[];
  },
) {
  const accountSelect = page.locator("#frames-account-id");
  for (const username of data.includedUsernames) {
    await expect(accountSelect).toContainText(username);
  }
  for (const username of data.excludedUsernames) {
    await expect(accountSelect).not.toContainText(username);
  }
}

async function createFrameThroughTable(
  page: Page,
  data: {
    username: string;
    sourceGroupName: string;
    labelBranchName: string;
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
  },
) {
  await ensureFrameAccountLoadedForCreate(page, data.username);
  await expect(
    page.getByRole("button", { name: "Create Frames" }),
  ).toBeEnabled();
  await expect(page.locator("#frames-grid-container-grid")).toBeVisible();

  await expect(
    page.getByRole("button", { name: "Create Frames" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Create Frames" }).click();
  const modal = await visibleModal(page);
  await expect(modal).toContainText("Create Frame");

  const hiddenAccountInput = modal.locator(
    'input[type="hidden"][name="account_id"]',
  );
  await expect(hiddenAccountInput).toHaveValue(/\d+/);
  const lockedAccount = modal.getByLabel("Account");
  await expect(lockedAccount).toBeVisible();
  await expect(lockedAccount).toBeDisabled();
  await expect(lockedAccount).toHaveValue(data.username);
  await expect(modal.locator('select[name="label_branch_id"]')).toContainText(
    data.labelBranchName,
  );
  await selectLabelBranch(
    modal.locator('select[name="label_branch_id"]'),
    data.labelBranchName,
  );
  await modal
    .locator('select[name="source_group_id"]')
    .selectOption({ label: data.sourceGroupName });
  const rawBounds = modal.getByLabel("Raw Data:");
  await rawBounds.fill(
    JSON.stringify(
      [
        {
          min_coords: { x: data.minX, y: data.minY, z: data.minZ },
          max_coords: { x: data.maxX, y: data.maxY, z: data.maxZ },
          min_timestamp: null,
          max_timestamp: null,
        },
      ],
      null,
      2,
    ),
  );
  await rawBounds.evaluate((element) =>
    (element as HTMLTextAreaElement).blur(),
  );

  await expect(modal.getByRole("button", { name: "Save" })).toBeEnabled();
  await modal.getByRole("button", { name: "Save" }).click();
  await expect(modal).toBeHidden();
  await loadFrameAccount(page, data.username);

  const minCoords = formatCoords(data.minX, data.minY, data.minZ);
  const maxCoords = formatCoords(data.maxX, data.maxY, data.maxZ);
  await expectGridContains(page, "frames-grid-container-grid", data.username);
  await expectGridContains(
    page,
    "frames-grid-container-grid",
    data.sourceGroupName,
  );
  await expectGridContains(
    page,
    "frames-grid-container-grid",
    data.labelBranchName,
  );
  await expectGridContains(page, "frames-grid-container-grid", minCoords);
  await expectGridContains(page, "frames-grid-container-grid", maxCoords);

  return rowWith(
    data.sourceGroupName,
    data.labelBranchName,
    minCoords,
    maxCoords,
  );
}

async function createFramesForPaginationThroughTable(
  page: Page,
  data: {
    username: string;
    sourceGroupName: string;
    labelBranchName: string;
    count: number;
    start: number;
  },
) {
  await ensureFrameAccountLoadedForCreate(page, data.username);
  await expect(
    page.getByRole("button", { name: "Create Frames" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Create Frames" }).click();
  const modal = await visibleModal(page);
  await expect(modal).toContainText("Create Frame");

  const hiddenAccountInput = modal.locator(
    'input[type="hidden"][name="account_id"]',
  );
  await expect(hiddenAccountInput).toHaveValue(/\d+/);
  const lockedAccount = modal.getByLabel("Account");
  await expect(lockedAccount).toBeVisible();
  await expect(lockedAccount).toBeDisabled();
  await expect(lockedAccount).toHaveValue(data.username);
  await selectLabelBranch(
    modal.locator('select[name="label_branch_id"]'),
    data.labelBranchName,
  );
  await modal
    .locator('select[name="source_group_id"]')
    .selectOption({ label: data.sourceGroupName });
  const rawBounds = modal.getByLabel("Raw Data:");
  await rawBounds.fill(
    JSON.stringify(
      Array.from({ length: data.count }, (_, index) => {
        const value = data.start + index;
        return {
          min_coords: { x: value, y: value + 1, z: value + 2 },
          max_coords: {
            x: value + 0.5,
            y: value + 1.5,
            z: value + 2.5,
          },
          min_timestamp: null,
          max_timestamp: null,
        };
      }),
      null,
      2,
    ),
  );
  await rawBounds.evaluate((element) =>
    (element as HTMLTextAreaElement).blur(),
  );

  await expect(modal.getByRole("button", { name: "Save" })).toBeEnabled();
  await modal.getByRole("button", { name: "Save" }).click();
  await expect(modal).toBeHidden({ timeout: 30_000 });
  await loadFrameAccount(page, data.username);

  await expectGridContains(
    page,
    "frames-grid-container-grid",
    formatCoords(data.start, data.start + 1, data.start + 2),
  );
}

function framePager(page: Page) {
  return page.locator("#frames-grid-container .slick-pagination-container");
}

async function ensureFrameAccountLoadedForCreate(page: Page, username: string) {
  const accountSelect = page.locator("#frames-account-id");
  if (!(await accountSelect.isVisible().catch(() => false))) {
    return;
  }

  const accountValue = await accountSelect
    .locator("option")
    .filter({ hasText: username })
    .first()
    .getAttribute("value");
  expect(accountValue).toBeTruthy();
  const createButton = page.getByRole("button", { name: "Create Frames" });
  if (
    (await accountSelect.inputValue()) !== accountValue ||
    (await createButton.count()) === 0 ||
    (await createButton.isDisabled().catch(() => false))
  ) {
    await loadFrameAccount(page, username);
  }
}

async function loadFrameAccount(page: Page, username: string) {
  const accountSelect = page.locator("#frames-account-id");
  await expect(accountSelect).toBeVisible();
  const accountValue = await accountSelect
    .locator("option")
    .filter({ hasText: username })
    .first()
    .getAttribute("value");
  expect(accountValue).toBeTruthy();
  await accountSelect.selectOption(accountValue!);
  await expect(accountSelect).toHaveValue(accountValue!);
  await page.waitForURL((url) => url.searchParams.has("account_id"));
  await expect(page.locator("#frames-grid-container-grid")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create Frames" }),
  ).toBeEnabled();
}

async function expectFrameTableHidesWhenAccountCleared(page: Page) {
  const accountSelect = page.locator("#frames-account-id");
  await accountSelect.selectOption("");
  await page.waitForURL((url) => !url.searchParams.has("account_id"));
  await expect(page.getByRole("button", { name: "Create Frames" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Select Current Page" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Select All" })).toHaveCount(0);
  await expect(page.locator("#frames-grid-container-grid")).toHaveCount(0);
}

async function expectProjectManagerFrameAccountSelectorBlank(page: Page) {
  const accountSelect = page.locator("#frames-account-id");
  await expect(accountSelect).toBeVisible();
  await expect(accountSelect).toHaveValue("");
  await expect(accountSelect.locator("option").first()).toHaveText(
    "(Select an account...)",
  );
  await expect(page.getByRole("button", { name: "Load" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create Frames" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Select Current Page" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Select All" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit Selected" })).toHaveCount(
    0,
  );
  await expect(page.locator("#frames-grid-container-grid")).toHaveCount(0);
  await expect(framePager(page)).toHaveCount(0);
}

async function expectNonManagerFrameAccountControlsHidden(page: Page) {
  await expect(page.locator('form select[name="account_id"]')).toHaveCount(0);
  await expect(
    page
      .locator("#frames-grid-container .slick-header-column")
      .filter({ hasText: /^Account$/ }),
  ).toHaveCount(0);
}

async function expectFramePaginationFooter(
  page: Page,
  minimumTotalItems: number,
) {
  const pager = framePager(page);
  await expect(pager).toBeVisible();
  await expect(pager.getByLabel("Page Number")).toHaveValue("1");
  await expect(pager.getByLabel("Items per Page")).toHaveValue("100");

  const totalItemsText = await pager
    .locator('[data-test="total-items"]')
    .innerText();
  expect(Number.parseInt(totalItemsText, 10)).toBeGreaterThanOrEqual(
    minimumTotalItems,
  );
}

async function expectFrameSelectionAndPaginationBehavior(
  page: Page,
  minimumTotalItems: number,
) {
  await expectFramePaginationFooter(page, minimumTotalItems);

  let pager = framePager(page);
  const selectedAccountId = new URL(page.url()).searchParams.get("account_id");
  await pager.getByLabel("Items per Page").selectOption("25");
  await page.waitForURL((url) => url.searchParams.get("pageSize") === "25");
  const firstPageUrl = new URL(page.url());
  if (selectedAccountId != null) {
    firstPageUrl.searchParams.set("account_id", selectedAccountId);
  }
  firstPageUrl.searchParams.set("page", "1");
  firstPageUrl.searchParams.set("pageSize", "25");
  await page.goto(
    `${firstPageUrl.pathname}?${firstPageUrl.searchParams.toString()}`,
  );
  pager = framePager(page);
  await expect(pager.getByLabel("Items per Page")).toHaveValue("25");

  await page.getByRole("button", { name: "Select Current Page" }).click();
  await expect(
    page.getByRole("button", { name: "Deselect All (25 selected)" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit Selected" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Deselect All (25 selected)" })
    .click();

  const secondPageUrl = new URL(page.url());
  secondPageUrl.searchParams.set("page", "2");
  secondPageUrl.searchParams.set("pageSize", "25");
  await page.goto(
    `${secondPageUrl.pathname}?${secondPageUrl.searchParams.toString()}`,
  );
  await expect(page.locator("#frames-grid-container-grid")).toBeVisible();
  await page.getByRole("button", { name: "Select Current Page" }).click();
  await expect(
    page.getByRole("button", { name: "Deselect All (2 selected)" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Deselect All (2 selected)" }).click();

  await page.goto(
    `${firstPageUrl.pathname}?${firstPageUrl.searchParams.toString()}`,
  );
  await expect(page.locator("#frames-grid-container-grid")).toBeVisible();

  const totalItems = Number.parseInt(
    await framePager(page).locator('[data-test="total-items"]').innerText(),
    10,
  );
  await page.getByRole("button", { name: "Select All" }).click();
  await expect(
    page.getByRole("button", {
      name: `Deselect All (${totalItems} selected)`,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit Selected" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: `Deselect All (${totalItems} selected)` })
    .click();

  await page.locator("#frames-grid-container-grid .slick-row").first().click();
  await expect(
    page.getByRole("button", { name: "Deselect All (1 selected)" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit Selected" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Edit Selected" }).click();
  const modal = await visibleModal(page);
  await expect(modal).toContainText("Edit Frame");
  await modal.getByRole("button", { name: "Cancel" }).click();
  await expect(modal).toBeHidden();
  await page.getByRole("button", { name: "Deselect All (1 selected)" }).click();

  const resetUrl = new URL(page.url());
  resetUrl.searchParams.set("page", "1");
  resetUrl.searchParams.set("pageSize", "100");
  await page.goto(`${resetUrl.pathname}?${resetUrl.searchParams.toString()}`);
  await expect(page.locator("#frames-grid-container-grid")).toBeVisible();
  await expect(framePager(page).getByLabel("Items per Page")).toHaveValue(
    "100",
  );
}

async function deleteVisibleFramesThroughTable(
  page: Page,
  mode: "annotate" | "review",
  accountUsernames: string[],
) {
  for (const username of accountUsernames) {
    await openFrameTable(page, mode);
    await loadFrameAccount(page, username);
    await page.goto(
      `${new URL(page.url()).pathname}?account_id=${new URL(page.url()).searchParams.get("account_id") ?? ""}&page=1&pageSize=100`,
    );
    await expect(page.locator("#frames-grid-container-grid")).toBeVisible();

    if (
      await page
        .getByRole("button", { name: "Select All" })
        .isVisible()
        .catch(() => false)
    ) {
      await page.getByRole("button", { name: "Select All" }).click();
    }

    const deselectButton = page.getByRole("button", {
      name: /Deselect All \((\d+) selected\)/,
    });
    if (!(await deselectButton.isVisible().catch(() => false))) {
      continue;
    }

    const selectedCount = Number(
      (await deselectButton.innerText()).match(/\d+/)?.[0] ?? "0",
    );
    // Deleting a selection is a row command, not a toolbar button. Right-clicking
    // a row that is already part of the selection leaves the selection alone, so
    // the command covers every frame the tick above just selected.
    await openSelectionCommand(
      page,
      page.locator("#frames-grid-container-grid .slick-row").first(),
      selectedCount > 1 ? "Batch Delete" : "Delete",
    );
    const modal = await visibleModal(page);
    await expect(modal).toContainText(/delete \d+ selected frames?/);
    await modal.getByRole("button", { name: "Delete" }).click();
    await expect(modal).toBeHidden({ timeout: 30_000 });
    await expect(page.locator("#frames-grid-container-grid")).toBeVisible();
    await expect(
      new URL(page.url()).searchParams.get("account_id"),
    ).not.toBeNull();
  }
}

async function updateFrameThroughTable(
  page: Page,
  frameRow: RegExp,
  data: {
    username: string;
    sourceGroupName: string;
    labelBranchName: string;
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
  },
) {
  await openRowCommand(page, frameRow, "Edit Details");
  const modal = await visibleModal(page);
  await expect(modal).toContainText("Edit Frame");
  await expect(modal.locator('select[name="account_id"]')).toBeDisabled();
  await expect(modal.locator('select[name="source_group_id"]')).toContainText(
    data.sourceGroupName,
  );
  await expect(modal.locator('select[name="label_branch_id"]')).toContainText(
    data.labelBranchName,
  );

  await modal.locator('input[name="max_x"]').fill(String(data.maxX));
  await modal.locator('input[name="max_y"]').fill(String(data.maxY));
  await modal.locator('input[name="max_z"]').fill(String(data.maxZ));
  await modal.getByRole("checkbox", { name: "Complete", exact: true }).check();
  await modal.getByRole("button", { name: "Save" }).click();
  await expect(modal).toBeHidden();
  await loadFrameAccount(page, data.username);

  const minCoords = formatCoords(data.minX, data.minY, data.minZ);
  const maxCoords = formatCoords(data.maxX, data.maxY, data.maxZ);
  await expectGridContains(page, "frames-grid-container-grid", maxCoords);
  await expect(
    page.getByRole("row", { name: rowWith(minCoords, maxCoords, "Yes") }),
  ).toBeVisible();

  return rowWith(minCoords, maxCoords);
}

async function updateCompletionOnlyThroughTable(page: Page, frameRow: RegExp) {
  await openRowCommand(page, frameRow, "Edit Completion");
  const modal = await visibleModal(page);
  await expect(modal).toContainText("Edit Frame Completion");
  await expect(modal.locator('select[name="source_group_id"]')).toBeDisabled();
  await expect(modal.locator('select[name="label_branch_id"]')).toBeDisabled();
  await expect(modal.locator('input[name="max_x"]')).toBeDisabled();
  const completeCheckbox = modal.getByRole("checkbox", {
    name: "Complete",
    exact: true,
  });
  await expect(completeCheckbox).toBeEnabled();
  await completeCheckbox.check();
  await modal.getByRole("button", { name: "Save" }).click();
  await expect(modal).toBeHidden();
  await expect(page.getByRole("row", { name: frameRow })).toContainText("Yes");
}

/**
 * Writes the completion status of the selection through `Batch Edit Details`.
 *
 * Bulk work has no toolbar button, so the command is opened over a selection the
 * helper builds itself -- never by right-clicking one row, which would narrow the
 * selection to it. The dialog's counters are read from the selection buttons
 * rather than from the DOM, because slickgrid renders only the rows on screen.
 */
async function batchCompleteFramesThroughTable(
  page: Page,
  data: {
    selection: "current-page" | "all";
    complete: boolean;
    /** Rows the write must have reached, including one never clicked. */
    reached: RegExp[];
  },
) {
  await page
    .getByRole("button", {
      name: data.selection === "all" ? "Select All" : "Select Current Page",
    })
    .click();
  const deselect = page.getByRole("button", {
    name: /Deselect All \(\d+ selected\)/,
  });
  await expect(deselect).toBeVisible();
  const selectedCount = Number(/(\d+)/.exec(await deselect.innerText())?.[1]);
  expect(selectedCount).toBeGreaterThan(1);

  await openSelectionCommand(
    page,
    page.locator("#frames-grid-container-grid .slick-row").first(),
    "Batch Edit Details",
  );
  const modal = await visibleModal(page);
  await expect(modal).toContainText(
    `Batch Edit Frames (${selectedCount} selected)`,
  );

  const apply = modal.getByRole("button", {
    name: `Apply to ${selectedCount} frames`,
  });
  await expect(apply).toBeDisabled();
  await expect(
    modal.getByText(
      "Select what you want to update by checking the box above.",
    ),
  ).toBeVisible();

  // The section's body, including its preview, appears only once it is ticked.
  await modal.getByRole("checkbox", { name: "Update Completion" }).check();
  await expect(apply).toBeEnabled();
  // The dialog reports the state it is about to overwrite, counted over the whole
  // selection rather than the row whose menu was opened.
  await expect(
    modal.getByText(
      new RegExp(`Currently complete: \\d+ of ${selectedCount}\\.`),
    ),
  ).toBeVisible();
  await modal
    .locator('select[name="completion"]')
    .selectOption(data.complete ? "true" : "false");
  await apply.click();
  await expect(modal).toBeHidden();

  const state = data.complete ? "Yes" : "No";
  for (const row of data.reached) {
    await expect(page.getByRole("row", { name: row })).toContainText(state);
  }
}

async function markFrameViewedThroughApi(
  page: Page,
  frameRow: RegExp,
  username: string,
  password: string,
) {
  const row = page.getByRole("row", { name: frameRow });
  await expect(row).toBeVisible();
  const frameId = (await row.locator(".slick-cell").first().innerText()).trim();
  const accessToken = await getAccessToken(page, username, password);

  const response = await page.request.post(
    `${backendUrl()}/editor/frame/last_viewed_at?frame_id=${encodeURIComponent(frameId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  expect(response.ok()).toBe(true);

  await page.reload();
  await expect(page.locator("#frames-grid-container-grid")).toBeVisible();
}

async function expectRecentFrameTableSingleSelectOnly(
  page: Page,
  minimumTotalItems = 1,
) {
  await expect(page.getByRole("button", { name: "Select All" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Deselect All/ })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "View Selected" })).toHaveCount(
    0,
  );

  const pager = page.locator(
    "#recent-frames-grid-container .slick-pagination-container",
  );
  await expect(pager).toBeVisible();
  const totalItemsText = await pager
    .locator('[data-test="total-items"]')
    .innerText();
  expect(Number.parseInt(totalItemsText, 10)).toBeGreaterThanOrEqual(
    minimumTotalItems,
  );
}

test.describe.serial("handbook project workflows", () => {
  const adminUsername = process.env.STA_E2E_ADMIN_USERNAME ?? "admin";
  const adminPassword = process.env.STA_E2E_ADMIN_PASSWORD ?? "admin";
  const projectName = uniqueName("project");
  const projectNameUpdated = `${projectName}-updated`;
  const sourceGroupName = uniqueName("project-source");
  const labelGroupName = uniqueName("project-label");
  const branchName = uniqueName("project-branch");
  const writePermissionUsername = validUsername("project_write");
  const annotatorOnlyUsername = validUsername("project_annotator");
  const supervisorOnlyUsername = validUsername("project_supervisor");
  const dataManagerUsername = validUsername("project_data_manager");
  const taskName = uniqueName("task");
  const taskNameUpdated = `${taskName}-updated`;
  let updatedAnnotateFrame!: RegExp;
  let annotatorOnlyFrame!: RegExp;
  let annotatorSecondFrame!: RegExp;
  let updatedReviewFrame!: RegExp;
  let supervisorOnlyReviewFrame!: RegExp;
  let managerOwnedFrameId!: string;

  test("creates and edits the project and task workflow", async ({ page }) => {
    test.setTimeout(360_000);

    // Set up users, source data, and label data needed for role-based frame permission checks.
    await createUserWithRoles(page, writePermissionUsername, [
      "project-manager",
      "annotator",
    ]);
    await createUserWithRoles(page, annotatorOnlyUsername, ["annotator"]);
    await createUserWithRoles(page, supervisorOnlyUsername, ["supervisor"]);
    await createUserWithRoles(page, dataManagerUsername, ["data-manager"]);
    await loginWith(page, dataManagerUsername, TEST_USER_PASSWORD);
    await createSourceGroupThroughUi(page, sourceGroupName);
    // Reviewer frames require their owner to hold WRITE_ELEVATED on the label
    // branch, so the supervisor-only account cannot be granted plain Write.
    // The branch permission editor also needs to enumerate accounts, which
    // only admins and project managers can do.
    await logout(page);
    await loginAdmin(page);
    await createLabelGroupAndBranchThroughUi(page, labelGroupName, branchName, [
      { username: writePermissionUsername, permission: "Write" },
      { username: annotatorOnlyUsername, permission: "Write" },
      { username: supervisorOnlyUsername, permission: "Write Elevated" },
    ]);

    await logout(page);
    await loginWith(page, writePermissionUsername, TEST_USER_PASSWORD);

    // Verify project creation and editing with all test users as project members.
    await clickTopNav(page, "Projects");
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();

    await page.getByRole("button", { name: "Create Project" }).click();
    let modal = await visibleModal(page);
    await modal.locator('input[name="name"]').fill(projectName);
    await modal
      .locator('textarea[name="description"]')
      .fill("Project created by Playwright from handbook project workflow.");
    await assignPickerOption(modal, "Members", adminUsername);
    await assignPickerOption(modal, "Members", writePermissionUsername);
    await assignPickerOption(modal, "Members", annotatorOnlyUsername);
    await assignPickerOption(modal, "Members", supervisorOnlyUsername);
    await modal.getByRole("button", { name: "Save" }).click();
    await expect(modal).toBeHidden();
    await expectGridContains(page, "projects-grid", projectName);
    // The projects grid batch-selects: Batch Edit replaces an attribute across every
    // selected project, so the selection controls must be present.
    await expectGridPaginationFooter(page, "projects-grid", 1);
    await expect(
      page.getByRole("button", { name: "Select Current Page" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Select All" }),
    ).toBeVisible();
    await expectGridPageSizeControl(page, "projects-grid");

    await openRowCommand(page, new RegExp(projectName), "Edit Details");
    modal = await visibleModal(page);
    await expect(modal.locator('input[name="name"]')).toHaveValue(projectName);
    await modal.locator('input[name="name"]').fill(projectNameUpdated);
    await modal
      .locator('textarea[name="description"]')
      .fill("Updated project description.");
    await modal.getByRole("button", { name: "Save" }).click();
    await expect(modal).toBeHidden();
    await expectGridContains(page, "projects-grid", projectNameUpdated);

    // Verify task creation and editing with separate supervisor and annotator assignments.
    await openRowCommand(page, new RegExp(projectNameUpdated), "Open");
    await expect(page).toHaveURL(/\/projects\/\d+\/tasks$/);
    await expect(
      page.getByRole("button", { name: "Create Task" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Create Task" }).click();
    modal = await visibleModal(page);
    await modal.locator('input[name="name"]').fill(taskName);
    await modal
      .locator('textarea[name="description"]')
      .fill("Task created by Playwright from handbook project workflow.");
    await assignPickerOption(modal, "Supervisors", adminUsername);
    await assignPickerOption(modal, "Supervisors", supervisorOnlyUsername);
    await assignPickerOption(modal, "Annotators", adminUsername);
    await assignPickerOption(modal, "Annotators", writePermissionUsername);
    await assignPickerOption(modal, "Annotators", annotatorOnlyUsername);
    await modal.getByRole("button", { name: "Save" }).click();
    await expect(modal).toBeHidden();
    await expectGridContains(page, "tasks-grid", taskName);
    await page.getByRole("button", { name: "Select All" }).click();
    const taskDeselectButton = page.getByRole("button", {
      name: /Deselect All \(\d+ selected\)/,
    });
    await expect(taskDeselectButton).toBeVisible();
    await taskDeselectButton.click();
    await expect(
      page.getByRole("button", { name: "Select All" }),
    ).toBeVisible();

    await openRowCommand(page, new RegExp(taskName), "Edit Details");
    modal = await visibleModal(page);
    await expect(modal.locator('input[name="name"]')).toHaveValue(taskName);
    await modal.locator('input[name="name"]').fill(taskNameUpdated);
    await modal
      .locator('textarea[name="description"]')
      .fill("Updated task description.");
    await modal.getByRole("button", { name: "Save" }).click();
    await expect(modal).toBeHidden();
    await expectGridContains(page, "tasks-grid", taskNameUpdated);
  });

  test("keeps whole-list batch commands and member guidance on a one-row page", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await loginWith(page, writePermissionUsername, TEST_USER_PASSWORD);
    const accessToken = await getAccessToken(
      page,
      adminUsername,
      adminPassword,
    );
    const headers = { Authorization: `Bearer ${accessToken}` };
    const projectPrefix = uniqueName("batch-preview-project");
    const createdIds: number[] = [];

    try {
      // The smallest supported page size is 25, so 26 matching projects leave
      // one row on the second page. The name filter holds the page to rows this
      // test created: any other project in the database -- another suite's, or
      // one left behind by an interrupted run -- would otherwise shift them.
      for (let index = 0; index < 26; index += 1) {
        const response = await page.request.post(`${backendUrl()}/projects/`, {
          headers,
          data: { name: `${projectPrefix}-${index}` },
        });
        expect(response.ok()).toBe(true);
        createdIds.push(((await response.json()) as { id: number }).id);
      }

      const nameFilter = encodeURIComponent(
        JSON.stringify([
          { columnId: "name", operator: "", searchTerms: [projectPrefix] },
        ]),
      );
      await page.goto(`/projects?filters=${nameFilter}&page=2&pageSize=25`);
      const pager = gridPager(page, "projects-grid");
      await expect(pager.locator('[data-test="total-items"]')).toHaveText("26");
      await expect(pager.getByLabel("Page Number")).toHaveValue("2");
      await expect(pager.getByLabel("Items per Page")).toHaveValue("25");

      // Slickgrid renders only the rows inside the viewport, so the filtered
      // total is read from the pager and only the one-row last page from the DOM.
      const gridRows = page.locator("#projects-grid .slick-row");
      await expect(gridRows).toHaveCount(1);
      await expect(gridRows.first()).toContainText(projectPrefix);
      await page.getByRole("button", { name: "Select All" }).click();
      await expect(
        page.getByRole("button", { name: "Deselect All (26 selected)" }),
      ).toBeVisible();

      await page.locator("#projects-grid .slick-row").first().click({
        button: "right",
      });
      const batchCommand = page
        .getByRole("menu")
        .getByText("Batch Edit Details", { exact: true });
      await expect(batchCommand).toBeVisible({ timeout: 5_000 });
      await batchCommand.click();
      const modal = await visibleModal(page);
      await modal.getByRole("checkbox", { name: "Update Members" }).check();
      await expect(modal).toContainText("projects on other pages");
      await expect(modal).not.toContainText("Currently assigned:");
      await modal.getByRole("button", { name: "Cancel" }).click();
      await expect(modal).toBeHidden();
    } finally {
      for (const id of createdIds) {
        const response = await page.request.delete(
          `${backendUrl()}/projects/${id}`,
          { headers },
        );
        expect(response.ok()).toBe(true);
      }
    }
  });

  test("updates projects and tasks when assignments are not visible", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await loginWith(page, writePermissionUsername, TEST_USER_PASSWORD);

    await clickTopNav(page, "Projects");
    await expectGridContains(page, "projects-grid", projectNameUpdated);
    await openRowCommand(page, new RegExp(projectNameUpdated), "Edit Details");
    let modal = await visibleModal(page);
    await modal
      .locator('textarea[name="description"]')
      .fill("Updated while project assignments were unavailable.");
    // Simulate a permissions-driven form variant that does not render member
    // assignments, including its payload input, then submit through the UI.
    await modal
      .locator(".mb-3", { hasText: /^Members/ })
      .evaluate((element) => element.remove());
    await modal
      .locator('input[name="member_ids"]')
      .evaluate((element) => element.remove());
    await expect(modal.getByText("Members", { exact: true })).toHaveCount(0);
    await modal.getByRole("button", { name: "Save" }).click();
    await expect(modal).toBeHidden();

    await openRowCommand(page, new RegExp(projectNameUpdated), "Open");
    await expectGridContains(page, "tasks-grid", taskNameUpdated);
    await openRowCommand(page, new RegExp(taskNameUpdated), "Edit Details");
    modal = await visibleModal(page);
    await modal
      .locator('textarea[name="description"]')
      .fill("Updated while task assignments were unavailable.");
    for (const [label, field] of [
      ["Supervisors", "supervisor_ids"],
      ["Annotators", "annotator_ids"],
    ]) {
      await modal
        .locator(".mb-3", { hasText: new RegExp(`^${label}`) })
        .evaluate((element) => element.remove());
      await modal
        .locator(`input[name="${field}"]`)
        .evaluate((element) => element.remove());
      await expect(modal.getByText(label, { exact: true })).toHaveCount(0);
    }
    await modal.getByRole("button", { name: "Save" }).click();
    await expect(modal).toBeHidden();
  });

  test("manages annotate and review frames and their recent-frame routes", async ({
    page,
  }) => {
    test.setTimeout(360_000);
    await loginWith(page, writePermissionUsername, TEST_USER_PASSWORD);
    await seedTaskResourceAssociation(page, {
      username: adminUsername,
      password: adminPassword,
      projectName: projectNameUpdated,
      taskName: taskNameUpdated,
      sourceGroupName,
      labelGroupName,
      labelBranchName: branchName,
    });
    await openProjectTaskThroughUi(page, projectNameUpdated, taskNameUpdated);

    // Verify annotator frame creation, editing, and account filtering by task annotators.
    await openTaskRecentFromTaskGrid(page, taskNameUpdated);
    await openFrameTable(page, "annotate");
    await expectProjectManagerFrameAccountSelectorBlank(page);
    await loadFrameAccount(page, adminUsername);
    await expectFrameTableHidesWhenAccountCleared(page);
    await loadFrameAccount(page, adminUsername);
    await expectFrameAccountFilterOptions(page, {
      includedUsernames: [
        adminUsername,
        writePermissionUsername,
        annotatorOnlyUsername,
      ],
      excludedUsernames: [supervisorOnlyUsername],
    });
    const annotateFrame = await createFrameThroughTable(page, {
      username: adminUsername,
      sourceGroupName,
      labelBranchName: branchName,
      minX: 10,
      minY: 20,
      minZ: 30,
      maxX: 11,
      maxY: 21,
      maxZ: 31,
    });
    updatedAnnotateFrame = await updateFrameThroughTable(page, annotateFrame, {
      username: adminUsername,
      sourceGroupName,
      labelBranchName: branchName,
      minX: 10,
      minY: 20,
      minZ: 30,
      maxX: 12,
      maxY: 22,
      maxZ: 32,
    });

    annotatorOnlyFrame = await createFrameThroughTable(page, {
      username: annotatorOnlyUsername,
      sourceGroupName,
      labelBranchName: branchName,
      minX: 130,
      minY: 140,
      minZ: 150,
      maxX: 131,
      maxY: 141,
      maxZ: 151,
    });

    // A second frame for that account: its owner gets a selection to batch,
    // which is what the frame-owner batch write is checked on below.
    annotatorSecondFrame = await createFrameThroughTable(page, {
      username: annotatorOnlyUsername,
      sourceGroupName,
      labelBranchName: branchName,
      minX: 132,
      minY: 142,
      minZ: 152,
      maxX: 133,
      maxY: 143,
      maxZ: 153,
    });

    // Verify reviewer frame creation, editing, and account filtering by task supervisors.
    await openFrameTable(page, "review");
    await expectProjectManagerFrameAccountSelectorBlank(page);
    await loadFrameAccount(page, adminUsername);
    await expectFrameAccountFilterOptions(page, {
      includedUsernames: [adminUsername, supervisorOnlyUsername],
      excludedUsernames: [writePermissionUsername, annotatorOnlyUsername],
    });
    const reviewFrame = await createFrameThroughTable(page, {
      username: adminUsername,
      sourceGroupName,
      labelBranchName: branchName,
      minX: 40,
      minY: 50,
      minZ: 60,
      maxX: 41,
      maxY: 51,
      maxZ: 61,
    });
    updatedReviewFrame = await updateFrameThroughTable(page, reviewFrame, {
      username: adminUsername,
      sourceGroupName,
      labelBranchName: branchName,
      minX: 40,
      minY: 50,
      minZ: 60,
      maxX: 42,
      maxY: 52,
      maxZ: 62,
    });

    supervisorOnlyReviewFrame = await createFrameThroughTable(page, {
      username: supervisorOnlyUsername,
      sourceGroupName,
      labelBranchName: branchName,
      minX: 160,
      minY: 170,
      minZ: 180,
      maxX: 161,
      maxY: 171,
      maxZ: 181,
    });

    // Recent-frame routes are scoped to the signed-in frame owner, so exercise
    // each with the least-privileged assignee for that work type.
    await logout(page);
    await loginWith(page, annotatorOnlyUsername, TEST_USER_PASSWORD);
    await openProjectTaskThroughUi(page, projectNameUpdated, taskNameUpdated);
    await openFrameTable(page, "annotate");
    await markFrameViewedThroughApi(
      page,
      annotatorOnlyFrame,
      annotatorOnlyUsername,
      TEST_USER_PASSWORD,
    );
    await openRecentFrameTable(page, "annotate");
    await expect(page.getByText(taskNameUpdated)).toBeVisible();
    await expectRecentFrameTableSingleSelectOnly(page);

    await logout(page);
    await loginWith(page, supervisorOnlyUsername, TEST_USER_PASSWORD);
    await openProjectTaskThroughUi(page, projectNameUpdated, taskNameUpdated);
    await openFrameTable(page, "review");
    await markFrameViewedThroughApi(
      page,
      supervisorOnlyReviewFrame,
      supervisorOnlyUsername,
      TEST_USER_PASSWORD,
    );
    await openRecentFrameTable(page, "review");
    await expect(page.getByText(taskNameUpdated)).toBeVisible();
    await expectRecentFrameTableSingleSelectOnly(page);
  });

  test("enforces manager, annotator, and supervisor frame permissions", async ({
    page,
  }) => {
    test.setTimeout(360_000);
    // Verify a project manager has full frame access.
    await loginWith(page, writePermissionUsername, TEST_USER_PASSWORD);
    await expectProjectManagerDataManagementReadOnly(page, {
      sourceGroupName,
      labelGroupName,
    });
    await openProjectTaskThroughUi(page, projectNameUpdated, taskNameUpdated);
    await openFrameTable(page, "annotate");
    await expectProjectManagerFrameAccountSelectorBlank(page);
    const writerFrame = await createFrameThroughTable(page, {
      username: writePermissionUsername,
      sourceGroupName,
      labelBranchName: branchName,
      minX: 100,
      minY: 110,
      minZ: 120,
      maxX: 101,
      maxY: 111,
      maxZ: 121,
    });
    managerOwnedFrameId = (
      await page
        .getByRole("row", { name: writerFrame })
        .locator(".slick-cell")
        .first()
        .innerText()
    ).trim();
    await expectGridContains(page, "frames-grid-container-grid", branchName);

    await createFramesForPaginationThroughTable(page, {
      username: writePermissionUsername,
      sourceGroupName,
      labelBranchName: branchName,
      count: 26,
      start: 200,
    });
    await expectFrameSelectionAndPaginationBehavior(page, 27);

    // A manager's batch write covers every frame of the account they are working
    // through, including the rows whose context menu was never opened.
    await batchCompleteFramesThroughTable(page, {
      selection: "all",
      complete: true,
      reached: [writerFrame],
    });

    // Verify an annotator-only user sees only their own annotate frames and can edit only completion status.
    await logout(page);
    await loginWith(page, annotatorOnlyUsername, TEST_USER_PASSWORD);
    await openProjectTaskThroughUi(page, projectNameUpdated, taskNameUpdated);
    await openFrameTable(page, "annotate");
    await expectNonManagerFrameAccountControlsHidden(page);
    await expect(
      page.getByRole("button", { name: "Create Frames" }),
    ).toHaveCount(0);
    await expectRowCommandHidden(page, annotatorOnlyFrame, "Batch Delete");
    await expect(
      page.getByRole("button", { name: "Edit Completion" }),
    ).toBeVisible();
    await expect(
      page.getByRole("row", { name: updatedAnnotateFrame }),
    ).toHaveCount(0);

    const assignedFrameUrl = new URL(page.url());
    const assignedFramePath = assignedFrameUrl.pathname.match(
      /^\/projects\/(\d+)\/tasks\/(\d+)\/frames\/annotate$/,
    );
    expect(assignedFramePath).not.toBeNull();

    // The editor shell is served for any project the caller may open, so the
    // refusal is the frame read behind it: the browser's own session-authenticated
    // request for another account's frame is concealed, and the editor reports the
    // frame it could not open instead of quietly showing someone else's work.
    const refusedFrameRead = await page.request.get(
      `/api/backend/frames/${managerOwnedFrameId}`,
    );
    expect([403, 404]).toContain(refusedFrameRead.status());
    await page.goto(
      `/projects/${assignedFramePath![1]}/annotate?task_id=${assignedFramePath![2]}&frame_id=${managerOwnedFrameId}`,
    );
    await expect(
      page.getByRole("alert").filter({
        hasText: `Frame ${managerOwnedFrameId} could not be loaded`,
      }),
    ).toBeVisible();
    await page.goto(`${assignedFrameUrl.pathname}${assignedFrameUrl.search}`);
    await updateCompletionOnlyThroughTable(page, annotatorOnlyFrame);

    // The owner path: completion is the attribute a frame's own account may write
    // in bulk, and the listing holds only their rows. Clearing them proves the
    // write reached both -- the first was just completed above, and its row is the
    // only one whose menu was opened.
    await batchCompleteFramesThroughTable(page, {
      selection: "all",
      complete: false,
      reached: [annotatorOnlyFrame, annotatorSecondFrame],
    });
    await markFrameViewedThroughApi(
      page,
      annotatorOnlyFrame,
      annotatorOnlyUsername,
      TEST_USER_PASSWORD,
    );
    await openRecentFrameTable(page, "annotate");
    await expectRecentFrameTableSingleSelectOnly(page, 0);
    await expectGridDoesNotContain(
      page,
      "recent-frames-grid-container-grid",
      supervisorOnlyUsername,
    );
    await openRecentFrameTable(page, "review");
    await expectRecentFrameTableSingleSelectOnly(page, 0);
    await expectGridDoesNotContain(
      page,
      "recent-frames-grid-container-grid",
      supervisorOnlyUsername,
    );

    // Verify a supervisor-only user sees only their own reviewer frames and can edit only completion status.
    await logout(page);
    await loginWith(page, supervisorOnlyUsername, TEST_USER_PASSWORD);
    await openProjectTaskThroughUi(page, projectNameUpdated, taskNameUpdated);
    await openFrameTable(page, "review");
    await expectNonManagerFrameAccountControlsHidden(page);
    await expect(
      page.getByRole("button", { name: "Create Frames" }),
    ).toHaveCount(0);
    await expectRowCommandHidden(
      page,
      supervisorOnlyReviewFrame,
      "Batch Delete",
    );
    await expect(
      page.getByRole("button", { name: "Edit Completion" }),
    ).toBeVisible();
    await expect(
      page.getByRole("row", { name: updatedReviewFrame }),
    ).toHaveCount(0);
    await updateCompletionOnlyThroughTable(page, supervisorOnlyReviewFrame);
    await markFrameViewedThroughApi(
      page,
      supervisorOnlyReviewFrame,
      supervisorOnlyUsername,
      TEST_USER_PASSWORD,
    );
    await openRecentFrameTable(page, "review");
    await expectRecentFrameTableSingleSelectOnly(page, 0);
    await expectGridDoesNotContain(
      page,
      "recent-frames-grid-container-grid",
      annotatorOnlyUsername,
    );
    await openRecentFrameTable(page, "annotate");
    await expectRecentFrameTableSingleSelectOnly(page, 0);
    await expectGridDoesNotContain(
      page,
      "recent-frames-grid-container-grid",
      annotatorOnlyUsername,
    );
  });

  test("warns when a task assignee loses branch write access", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await loginWith(page, writePermissionUsername, TEST_USER_PASSWORD);
    const token = await getAccessToken(page, adminUsername, adminPassword);
    const headers = { Authorization: `Bearer ${token}` };

    async function findOne<T>(path: string, query: Record<string, string>) {
      const url = new URL(`${backendUrl()}${path}`);
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value);
      }
      const response = await page.request.get(url.toString(), { headers });
      expect(response.ok()).toBe(true);
      const records = (await response.json()) as T[];
      expect(records).toHaveLength(1);
      return records[0];
    }

    interface Branch {
      id: number;
      last_edit_at: string;
      perm_lv_by_user_id: Record<string, number>;
    }
    interface Account {
      id: number;
    }
    interface ProjectRecord {
      id: number;
    }

    const branch = await findOne<Branch>("/label/repo/branches/", {
      name: branchName,
    });
    const assignee = await findOne<Account>("/accounts/", {
      username: annotatorOnlyUsername,
    });
    const project = await findOne<ProjectRecord>("/projects/", {
      name: projectNameUpdated,
    });

    async function setPermission(permission: 1 | 2) {
      const current = await page.request.get(
        `${backendUrl()}/label/repo/branches/${branch.id}`,
        { headers },
      );
      expect(current.ok()).toBe(true);
      const currentBranch = (await current.json()) as Branch;
      const response = await page.request.patch(
        `${backendUrl()}/label/repo/branches/${branch.id}`,
        {
          headers,
          data: {
            issued_at: currentBranch.last_edit_at,
            perm_lv_by_user_id: {
              ...currentBranch.perm_lv_by_user_id,
              [assignee.id]: permission,
            },
          },
        },
      );
      expect(response.ok()).toBe(true);
    }

    await setPermission(1);
    try {
      // A hard navigation forces the server loader to re-read the task after
      // the out-of-band permission change instead of reusing client-loader data.
      await page.goto(`/projects/${project.id}/tasks?permission-check=1`);
      await expectGridContains(page, "tasks-grid", taskNameUpdated);
      const warning = page
        .getByText("Invalid task branch permissions", { exact: true })
        .locator("..");
      await expect(warning).toContainText(taskNameUpdated);
      await expect(warning).toContainText(annotatorOnlyUsername);
      await expect(warning).toContainText("lacks WRITE access");
    } finally {
      await setPermission(2);
    }
  });

  test("cleans up the project workflow fixtures", async ({ page }) => {
    test.setTimeout(360_000);
    // Clean up frames, task, project, data fixtures, and temporary users through the UI.
    await loginAdmin(page);
    await openProjectTaskThroughUi(page, projectNameUpdated, taskNameUpdated);

    await deleteVisibleFramesThroughTable(page, "annotate", [
      adminUsername,
      writePermissionUsername,
      annotatorOnlyUsername,
    ]);
    await deleteVisibleFramesThroughTable(page, "review", [
      adminUsername,
      supervisorOnlyUsername,
    ]);

    await clickBreadcrumbLink(page, projectNameUpdated);
    await openRowCommand(page, new RegExp(taskNameUpdated), "Delete");
    let modal = await visibleModal(page);
    await modal.getByRole("button", { name: "Delete Task" }).click();
    await expect(modal).toBeHidden();
    await expectGridDoesNotContain(page, "tasks-grid", taskNameUpdated);

    await clickTopNav(page, "Projects");
    await openRowCommand(page, new RegExp(projectNameUpdated), "Delete");
    modal = await visibleModal(page);
    await modal.getByRole("button", { name: "Delete Project" }).click();
    await expect(modal).toBeHidden();
    await expectGridDoesNotContain(page, "projects-grid", projectNameUpdated);

    await deleteLabelGroupThroughUi(page, labelGroupName);
    await deleteSourceGroupThroughUi(page, sourceGroupName);
    await deleteUserThroughUi(page, writePermissionUsername);
    await deleteUserThroughUi(page, annotatorOnlyUsername);
    await deleteUserThroughUi(page, supervisorOnlyUsername);
  });
});
