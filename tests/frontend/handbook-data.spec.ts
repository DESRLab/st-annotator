import { expect, type Page, test } from "@playwright/test";

import {
  deleteUserThroughUi,
  loginWith,
  logout,
  setBranchPermission,
  validUsername,
} from "./helpers/accounts";
import {
  backendUrl,
  expectGridContains,
  expectGridDoesNotContain,
  gridPager,
  expectNonPaginatedMultiSelectButtons,
  expectGridPageSizeControl,
  expectSingleSelectGridOnly,
  clickItemTypeLink,
  clickSidebarLink,
  clickTopNav,
  createUserWithRoles,
  expectPluginComposition,
  loginAdmin,
  openRowCommand,
  openSelectionCommand,
  TEST_USER_PASSWORD,
  uniqueName,
  visibleModal,
} from "./helpers/ui";

async function expectSourceDataStorageRequiresLoad(
  page: Page,
  sourceGroupName: string,
) {
  await clickTopNav(page, "Source Data");
  await clickSidebarLink(page, "Data Storage");
  await clickItemTypeLink(page, "Point Cloud Metadata");
  await expect(
    page.getByRole("heading", { name: "Point Cloud Metadata" }),
  ).toBeVisible();

  const sourceGroupSelect = page.locator('select[name="group_id"]');
  await expect(sourceGroupSelect).toHaveValue("");
  await expect(sourceGroupSelect.locator("option").first()).toHaveText(
    "(Select a group...)",
  );
  await expect(page.getByRole("button", { name: "Load" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Create Point Cloud Metadata" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Select All" })).toHaveCount(0);
  await expect(page.locator("#point-cloud-grid")).toHaveCount(0);

  await sourceGroupSelect.selectOption({ label: sourceGroupName });
  await page.waitForURL((url) => url.searchParams.has("group_id"));
  await expect(
    page.getByRole("button", { name: "Create Point Cloud Metadata" }),
  ).toBeEnabled();
  await expect(
    gridPager(page, "point-cloud-grid").locator('[data-test="total-items"]'),
  ).toHaveText("0");
  await page
    .getByRole("button", { name: "Create Point Cloud Metadata" })
    .click();
  const modal = await visibleModal(page);
  const hiddenGroupInput = modal.locator(
    'input[type="hidden"][name="group_id"]',
  );
  await expect(hiddenGroupInput).toHaveValue(/\d+/);
  const lockedSourceGroup = modal.getByLabel("Source Group");
  await expect(lockedSourceGroup).toBeVisible();
  await expect(lockedSourceGroup).toBeDisabled();
  await expect(lockedSourceGroup).toHaveValue(sourceGroupName);
  await modal.getByRole("button", { name: "Cancel" }).click();
  await expect(modal).toBeHidden();

  await sourceGroupSelect.selectOption("");
  await page.waitForURL((url) => !url.searchParams.has("group_id"));
  await expect(
    page.getByRole("button", { name: "Create Point Cloud Metadata" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Select All" })).toHaveCount(0);
  await expect(page.locator("#point-cloud-grid")).toHaveCount(0);
}

async function expectLabelDataStorageRefreshesCommitsOnGroupChange(
  page: Page,
  data: { labelGroupName: string; branchName: string },
) {
  await clickTopNav(page, "Label Data");
  await clickSidebarLink(page, "Data Storage");
  await clickItemTypeLink(page, "Bounding Box Data");
  await expect(
    page.getByRole("heading", { name: "Bounding Box Data" }),
  ).toBeVisible();

  const groupSelect = page.locator('select[name="group_id"]');
  const commitSelect = page.locator('select[name="commit_hash"]');
  await expect(groupSelect).toHaveValue("");
  await expect(groupSelect.locator("option").first()).toHaveText(
    "(Select a group...)",
  );
  await expect(commitSelect).toBeDisabled();
  await expect(page.getByRole("button", { name: "Load" })).toHaveCount(0);
  await expect(page.locator("#bbox-elements-grid")).toHaveCount(0);

  await groupSelect.selectOption({ label: data.labelGroupName });
  await page.waitForURL(
    (url) =>
      url.searchParams.has("group_id") && !url.searchParams.has("commit_hash"),
  );
  await expect(commitSelect).toBeEnabled();
  await expect(commitSelect).toHaveValue("");
  await expect(commitSelect).toContainText(data.branchName);
  await expect(page.getByRole("button", { name: "Load" })).toHaveCount(0);
  const commitValue = await commitSelect
    .locator("option")
    .filter({ hasText: data.branchName })
    .first()
    .getAttribute("value");
  expect(commitValue).toBeTruthy();
  await commitSelect.selectOption(commitValue!);
  await page.waitForURL((url) => url.searchParams.has("commit_hash"));
  await expect(
    gridPager(page, "bbox-elements-grid").locator('[data-test="total-items"]'),
  ).toHaveText("0");

  await commitSelect.selectOption("");
  await page.waitForURL((url) => !url.searchParams.has("commit_hash"));
  await expect(page.locator("#bbox-elements-grid")).toHaveCount(0);
}

async function expectBranchAccessThroughUi(
  page: Page,
  data: {
    labelGroupName: string;
    visibleBranchName: string;
    ungrantedBranchName: string;
    access: "Read" | "Write";
  },
) {
  await clickTopNav(page, "Label Data");
  await clickSidebarLink(page, "Repositories");
  await expect(
    page.getByText("Each label group owns one repository."),
  ).toBeVisible();
  await expectGridContains(page, "labelRepositories-grid", data.labelGroupName);
  await openRowCommand(
    page,
    new RegExp(data.labelGroupName),
    "Open Repository",
  );
  await expect(page).toHaveURL(/\/label\/repos\/\d+\/branches$/);
  await expect(page.getByRole("button", { name: "Create Branch" })).toHaveCount(
    0,
  );
  // A project-manager holds a role-level READ grant on every branch, so a
  // branch carrying no grant for them is listed as `None` rather than hidden.
  await expect(
    page.getByRole("row", { name: data.visibleBranchName }),
  ).toContainText(data.access);
  await expect(
    page.getByRole("row", { name: data.ungrantedBranchName }),
  ).toContainText("None");

  await openRowCommand(
    page,
    new RegExp(data.visibleBranchName),
    "View Details",
  );
  const modal = await visibleModal(page);
  await expect(modal.getByText("View Branch")).toBeVisible();
  await expect(modal.locator('input[name="name"]')).toHaveValue(
    data.visibleBranchName,
  );
  await expect(
    modal.locator(".mb-3").filter({ hasText: "Your Access" }).locator("input"),
  ).toHaveValue(data.access);
  await expect(modal.locator("fieldset").first()).toHaveAttribute(
    "disabled",
    "",
  );
  await expect(modal.getByRole("button", { name: "Save" })).toHaveCount(0);
  await modal
    .locator(".modal-footer")
    .getByRole("button", { name: "Close" })
    .click();
  await expect(modal).toBeHidden();
}

async function expectDataManagerWriteAccessThroughUi(
  page: Page,
  data: {
    sourceGroupName: string;
    labelGroupName: string;
    branchName: string;
  },
) {
  // Verify source group creation, editing, file explorer access, and source dashboards.
  await clickTopNav(page, "Source Data");
  await expect(
    page.getByRole("heading", { name: "Source Groups" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create Group" }),
  ).toBeVisible();
  await expect(
    page
      .locator(".nav.flex-column")
      .getByRole("link", { name: "File Explorer" }),
  ).toBeVisible();
  await expectGridContains(page, "sourceGroups-grid", data.sourceGroupName);
  await openRowCommand(page, new RegExp(data.sourceGroupName), "Edit Details");
  let modal = await visibleModal(page);
  await expect(modal.getByText("Edit Group")).toBeVisible();
  await expect(modal.locator('input[name="name"]')).toHaveValue(
    data.sourceGroupName,
  );
  await expect(modal.locator("fieldset").first()).not.toHaveAttribute(
    "disabled",
    "",
  );
  await expect(modal.getByRole("button", { name: "Save" })).toBeVisible();
  await modal
    .locator(".modal-footer")
    .getByRole("button", { name: "Cancel" })
    .click();
  await expect(modal).toBeHidden();

  await clickSidebarLink(page, "File Explorer");
  await expect(page.locator("#file-explorer-grid")).toBeVisible();
  await clickSidebarLink(page, "Data Storage");
  await expect(
    page.getByRole("heading", { name: "Source Data Storage" }),
  ).toBeVisible();
  await clickSidebarLink(page, "Specifications");
  await expect(
    page.getByRole("heading", { name: "Source Specifications" }),
  ).toBeVisible();

  // Verify label group creation, editing, storage dashboard, and specification pages.
  await clickTopNav(page, "Label Data");
  await expect(
    page.getByRole("heading", { name: "Label Groups" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create Group" }),
  ).toBeVisible();
  await expectGridContains(page, "labelGroups-grid", data.labelGroupName);
  await openRowCommand(page, new RegExp(data.labelGroupName), "Edit Details");
  modal = await visibleModal(page);
  await expect(modal.getByText("Edit Group")).toBeVisible();
  await expect(modal.locator('input[name="name"]')).toHaveValue(
    data.labelGroupName,
  );
  await expect(modal.locator("fieldset").first()).not.toHaveAttribute(
    "disabled",
    "",
  );
  await expect(modal.getByRole("button", { name: "Save" })).toBeVisible();
  await modal
    .locator(".modal-footer")
    .getByRole("button", { name: "Cancel" })
    .click();
  await expect(modal).toBeHidden();

  await clickSidebarLink(page, "Data Storage");
  await expect(
    page.getByRole("heading", { name: "Label Data Storage" }),
  ).toBeVisible();
  await clickSidebarLink(page, "Specifications");
  await expect(
    page.getByRole("heading", { name: "Label Specifications" }),
  ).toBeVisible();
  await clickSidebarLink(page, "Repositories");
  await expectGridContains(page, "labelRepositories-grid", data.labelGroupName);
  await openRowCommand(
    page,
    new RegExp(data.labelGroupName),
    "Open Repository",
  );
  await expect(page).toHaveURL(/\/label\/repos\/\d+\/branches$/);
  await expect(
    page.getByRole("button", { name: "Create Branch" }),
  ).toBeVisible();
  await openRowCommand(page, new RegExp(data.branchName), "Edit Details");
  modal = await visibleModal(page);
  await expect(modal.getByText("Edit Branch")).toBeVisible();
  await expect(modal.locator('input[name="name"]')).toHaveValue(
    data.branchName,
  );
  await expect(modal.getByRole("button", { name: "Save" })).toBeVisible();
  await modal
    .locator(".modal-footer")
    .getByRole("button", { name: "Cancel" })
    .click();
  await expect(modal).toBeHidden();
}

async function expectProjectManagerDataReadOnlyThroughUi(
  page: Page,
  data: { sourceGroupName: string; labelGroupName: string },
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
  await expect(modal.getByText("View Group")).toBeVisible();
  await expect(modal.locator('input[name="name"]')).toHaveValue(
    data.sourceGroupName,
  );
  await expect(modal.locator("fieldset").first()).toHaveAttribute(
    "disabled",
    "",
  );
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
  await expect(
    page
      .locator(".nav.flex-column")
      .getByRole("link", { name: "Repositories" }),
  ).toBeVisible();
  await expectGridContains(page, "labelGroups-grid", data.labelGroupName);
  await openRowCommand(page, new RegExp(data.labelGroupName), "View Details");
  modal = await visibleModal(page);
  await expect(modal.getByText("View Group")).toBeVisible();
  await expect(modal.locator('input[name="name"]')).toHaveValue(
    data.labelGroupName,
  );
  await expect(modal.locator("fieldset").first()).toHaveAttribute(
    "disabled",
    "",
  );
  await expect(modal.getByRole("button", { name: "Save" })).toHaveCount(0);
  await modal
    .locator(".modal-footer")
    .getByRole("button", { name: "Close" })
    .click();
  await expect(modal).toBeHidden();
}

test.describe.serial("handbook data workflows", () => {
  // Every flow below reaches a plugin-contributed item type, so a composition
  // re-pointed mid-run is reported at once rather than after a plugin surface
  // that can no longer appear waits out its timeout.
  test.beforeEach(async ({ page }) => {
    await expectPluginComposition(page);
  });

  const sourceGroup = uniqueName("source-group");
  const sourceGroupUpdated = `${sourceGroup}-updated`;
  const labelGroup = uniqueName("label-group");
  const labelGroupUpdated = `${labelGroup}-updated`;
  const branchName = uniqueName("branch");
  const branchNameUpdated = `${branchName}-updated`;
  const readOnlyBranchName = uniqueName("branch-read");
  const writePermissionUsername = validUsername("branch_write");
  const readOnlyUsername = validUsername("branch_read");
  const dataManagerUsername = validUsername("data_manager");

  test("creates source, label, repository, and branch data", async ({
    page,
  }) => {
    test.setTimeout(300_000);

    // Set up project-manager and data-manager accounts used for permission checks.
    await createUserWithRoles(page, writePermissionUsername, [
      "project-manager",
    ]);
    await createUserWithRoles(page, readOnlyUsername, ["project-manager"]);
    await createUserWithRoles(page, dataManagerUsername, ["data-manager"]);

    await loginWith(page, dataManagerUsername, TEST_USER_PASSWORD);

    await clickTopNav(page, "Source Data");
    await expect(
      page.getByRole("heading", { name: "Source Groups" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Create Group" }).click();
    let modal = await visibleModal(page);
    await modal.locator('input[name="name"]').fill(sourceGroup);
    await modal
      .locator('textarea[name="description"]')
      .fill("Source group created by Playwright from handbook data workflow.");
    await modal.getByRole("button", { name: "Save" }).click();
    await expect(modal).toBeHidden();
    await expectGridContains(page, "sourceGroups-grid", sourceGroup);
    await expectSingleSelectGridOnly(page, "sourceGroups-grid", 1);
    await expectGridPageSizeControl(page, "sourceGroups-grid");

    await openRowCommand(page, new RegExp(sourceGroup), "Edit Details");
    modal = await visibleModal(page);
    await expect(modal.locator('input[name="name"]')).toHaveValue(sourceGroup);
    await modal.locator('input[name="name"]').fill(sourceGroupUpdated);
    await modal
      .locator('textarea[name="description"]')
      .fill("Updated source group description.");
    await modal.getByRole("button", { name: "Save" }).click();
    await expect(modal).toBeHidden();
    await expectGridContains(page, "sourceGroups-grid", sourceGroupUpdated);

    await clickSidebarLink(page, "File Explorer");
    await expect(page.locator("#file-explorer-grid")).toBeVisible();
    await expectNonPaginatedMultiSelectButtons(page, "file-explorer-grid");

    await clickSidebarLink(page, "Data Storage");
    await expect(
      page.getByRole("heading", { name: "Source Data Storage" }),
    ).toBeVisible();
    await expect(
      page.getByText("Please select the item type to configure:"),
    ).toBeVisible();
    await expectSourceDataStorageRequiresLoad(page, sourceGroupUpdated);

    await clickSidebarLink(page, "Specifications");
    await expect(
      page.getByRole("heading", { name: "Source Specifications" }),
    ).toBeVisible();
    await expect(
      page.getByText("Please select the item type to configure:"),
    ).toBeVisible();

    await clickItemTypeLink(page, "Point Cloud Specifications");
    const pointCloudSpecPrefix = uniqueName("pcd-spec");
    const pointCloudSpecName = `${pointCloudSpecPrefix}-assigned`;
    const pointCloudSpecDescription = "Description preserved across a UI edit.";
    await page
      .getByRole("button", { name: "Create Point Cloud Specification" })
      .click();
    modal = await visibleModal(page);
    await modal.locator('input[name="name"]').fill(pointCloudSpecName);
    await modal
      .locator('textarea[name="description"]')
      .fill(pointCloudSpecDescription);
    const sourceGroupsField = modal
      .locator(".mb-3")
      .filter({ hasText: "Source Groups" })
      .first();
    await sourceGroupsField
      .locator("select")
      .first()
      .selectOption({ label: sourceGroupUpdated });
    await sourceGroupsField.getByTitle("Assign items").click();
    await modal.getByRole("button", { name: "Save" }).click();
    await expect(modal).toBeHidden();
    await expectGridContains(
      page,
      "point-cloud-source-grid",
      pointCloudSpecName,
    );

    await openRowCommand(page, new RegExp(pointCloudSpecName), "Edit Details");
    modal = await visibleModal(page);
    await modal
      .locator('input[name="name"]')
      .fill(`${pointCloudSpecName}-updated`);
    await modal.getByRole("button", { name: "Save" }).click();
    await expect(modal).toBeHidden();
    await openRowCommand(
      page,
      new RegExp(`${pointCloudSpecName}-updated`),
      "Edit Details",
    );
    modal = await visibleModal(page);
    await expect(modal.locator('textarea[name="description"]')).toHaveValue(
      pointCloudSpecDescription,
    );
    await modal.getByRole("button", { name: "Cancel" }).click();
    await expect(modal).toBeHidden();

    // Bulk work is a row command: no toolbar button offers it, and the menu
    // offers it only once the selection covers more than one specification.
    await expect(
      page.getByRole("button", { name: /^Batch (Edit|Delete)/ }),
    ).toHaveCount(0);
    const unassignedSpecName = `${pointCloudSpecPrefix}-unassigned`;
    await page
      .getByRole("button", { name: "Create Point Cloud Specification" })
      .click();
    modal = await visibleModal(page);
    await modal.locator('input[name="name"]').fill(unassignedSpecName);
    await modal.getByRole("button", { name: "Save" }).click();
    await expect(modal).toBeHidden();
    await expectGridContains(
      page,
      "point-cloud-source-grid",
      unassignedSpecName,
    );

    const batchDescription = "Shared by a batch write over two specifications.";
    const specNameFilter = page.getByRole("textbox", {
      name: "Name Search Filter",
    });
    await specNameFilter.fill(pointCloudSpecPrefix);
    await specNameFilter.press("Enter");
    await expectGridContains(
      page,
      "point-cloud-source-grid",
      unassignedSpecName,
    );
    await page.getByRole("button", { name: "Select All" }).click();
    await openSelectionCommand(
      page,
      page.locator("#point-cloud-source-grid .slick-row").first(),
      "Batch Edit Details",
    );
    modal = await visibleModal(page);
    const batchApply = modal.getByRole("button", {
      name: "Apply to 2 Point Cloud Specifications",
    });
    await expect(batchApply).toBeDisabled();
    await modal.getByRole("checkbox", { name: "Update Description" }).check();
    await modal.locator('textarea[name="description"]').fill(batchDescription);
    await expect(batchApply).toBeEnabled();
    await batchApply.click();
    await expect(modal).toBeHidden();

    // The batch wrote both specifications, including the one whose row was
    // never clicked to open the menu.
    await openRowCommand(page, new RegExp(unassignedSpecName), "Edit Details");
    modal = await visibleModal(page);
    await expect(modal.locator('textarea[name="description"]')).toHaveValue(
      batchDescription,
    );
    await modal.getByRole("button", { name: "Cancel" }).click();
    await expect(modal).toBeHidden();
    await openRowCommand(
      page,
      new RegExp(`${pointCloudSpecName}-updated`),
      "Edit Details",
    );
    modal = await visibleModal(page);
    await expect(modal.locator('textarea[name="description"]')).toHaveValue(
      batchDescription,
    );
    await modal.getByRole("button", { name: "Cancel" }).click();
    await expect(modal).toBeHidden();

    await clickTopNav(page, "Label Data");
    await expect(
      page.getByRole("heading", { name: "Label Groups" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Create Group" }).click();
    modal = await visibleModal(page);
    await modal.locator('input[name="name"]').fill(labelGroup);
    await modal
      .locator('textarea[name="description"]')
      .fill("Label group created by Playwright from handbook data workflow.");
    await modal.getByRole("button", { name: "Save" }).click();
    await expect(modal).toBeHidden();
    await expectGridContains(page, "labelGroups-grid", labelGroup);
    await expectSingleSelectGridOnly(page, "labelGroups-grid", 1);
    await expectGridPageSizeControl(page, "labelGroups-grid");

    await openRowCommand(page, new RegExp(labelGroup), "Edit Details");
    modal = await visibleModal(page);
    await expect(modal.locator('input[name="name"]')).toHaveValue(labelGroup);
    await modal.locator('input[name="name"]').fill(labelGroupUpdated);
    await modal
      .locator('textarea[name="description"]')
      .fill("Updated label group description.");
    await modal.getByRole("button", { name: "Save" }).click();
    await expect(modal).toBeHidden();
    await expectGridContains(page, "labelGroups-grid", labelGroupUpdated);
    await clickSidebarLink(page, "Data Storage");
    await expect(
      page.getByRole("heading", { name: "Label Data Storage" }),
    ).toBeVisible();
    await expect(
      page.getByText("Please select the item type to configure:"),
    ).toBeVisible();

    await clickSidebarLink(page, "Specifications");
    await expect(
      page.getByRole("heading", { name: "Label Specifications" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Object Classes" }).click();
    await expect(page).toHaveURL(/\/label\/specs\/objclass\/selections$/);
    await expect(page.locator("#object-class-selections-grid")).toBeVisible();
    await expectSingleSelectGridOnly(page, "object-class-selections-grid", 0);
    await expectGridPageSizeControl(page, "object-class-selections-grid");

    await page.getByRole("link", { name: "Definitions" }).click();
    await expect(page.locator("#object-class-definitions-grid")).toBeVisible();
    await expectSingleSelectGridOnly(page, "object-class-definitions-grid", 0);
    await expectGridPageSizeControl(page, "object-class-definitions-grid");

    // Branch permission pickers list user accounts, a read reserved for admins
    // and project managers; use the admin only for this branch permission UI.
    await logout(page);
    await loginAdmin(page);
    await clickTopNav(page, "Label Data");
    await clickSidebarLink(page, "Repositories");
    await expect(
      page.getByText("Each label group owns one repository."),
    ).toBeVisible();
    await expectGridContains(page, "labelRepositories-grid", labelGroupUpdated);
    await expectSingleSelectGridOnly(page, "labelRepositories-grid", 1);
    await expectGridPageSizeControl(page, "labelRepositories-grid");
    await openRowCommand(
      page,
      new RegExp(labelGroupUpdated),
      "Open Repository",
    );
    await expect(page).toHaveURL(/\/label\/repos\/\d+\/branches$/);
    await expect(
      page.getByRole("link", { name: "Repositories" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Create Branch" }).click();
    modal = await visibleModal(page);
    await modal.locator('input[name="name"]').fill(branchName);
    await setBranchPermission(modal, writePermissionUsername, "Write");
    await modal.getByRole("button", { name: "Save" }).click();
    await expect(modal).toBeHidden();
    await expectGridContains(page, "repositoryBranches-grid", branchName);

    await openRowCommand(page, new RegExp(branchName), "Edit Details");
    modal = await visibleModal(page);
    await expect(modal.locator('input[name="name"]')).toHaveValue(branchName);
    await modal.locator('input[name="name"]').fill(branchNameUpdated);
    await modal.getByRole("button", { name: "Save" }).click();
    await expect(modal).toBeHidden();
    await expectGridContains(
      page,
      "repositoryBranches-grid",
      branchNameUpdated,
    );

    await page.getByRole("button", { name: "Create Branch" }).click();
    modal = await visibleModal(page);
    await modal.locator('input[name="name"]').fill(readOnlyBranchName);
    await setBranchPermission(modal, readOnlyUsername, "Read");
    await modal.getByRole("button", { name: "Save" }).click();
    await expect(modal).toBeHidden();
    await expectGridContains(
      page,
      "repositoryBranches-grid",
      readOnlyBranchName,
    );
    await expectSingleSelectGridOnly(page, "repositoryBranches-grid", 2);
    await expectGridPageSizeControl(page, "repositoryBranches-grid");

    await expectLabelDataStorageRefreshesCommitsOnGroupChange(page, {
      labelGroupName: labelGroupUpdated,
      branchName: branchNameUpdated,
    });

    // Verify the commit graph page renders for the label repository.
    await clickTopNav(page, "Label Data");
    await clickSidebarLink(page, "Repositories");
    await openRowCommand(
      page,
      new RegExp(labelGroupUpdated),
      "Open Repository",
    );
    await clickSidebarLink(page, "Commits");
    await expect(
      page.getByRole("link", { name: "Repositories" }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Repository commit graph" }),
    ).toBeVisible();
  });

  test("enforces data and branch permissions", async ({ page }) => {
    test.setTimeout(300_000);
    // Verify a data-manager account has writable data-management access.
    await loginWith(page, dataManagerUsername, TEST_USER_PASSWORD);
    await expectDataManagerWriteAccessThroughUi(page, {
      sourceGroupName: sourceGroupUpdated,
      labelGroupName: labelGroupUpdated,
      branchName: branchNameUpdated,
    });
    await page.goto("/jobs");
    await expect(
      page.getByRole("heading", { name: "Background Jobs" }),
    ).toBeVisible();

    // Verify a project-manager with branch Write permission has read-only data management and writable branch access.
    await logout(page);
    await loginWith(page, writePermissionUsername, TEST_USER_PASSWORD);
    await expectProjectManagerDataReadOnlyThroughUi(page, {
      sourceGroupName: sourceGroupUpdated,
      labelGroupName: labelGroupUpdated,
    });

    // Hiding mutation controls is not the security boundary. A request crafted
    // outside the UI must still be refused by the backend and leave no record.
    const loginResponse = await page.request.post(
      `${backendUrl()}/auth/login`,
      {
        form: {
          username: writePermissionUsername,
          password: TEST_USER_PASSWORD,
        },
      },
    );
    expect(loginResponse.ok()).toBe(true);
    const token = ((await loginResponse.json()) as { access_token: string })
      .access_token;
    const refusedGroupName = uniqueName("refused-source-group");
    const refusedCreate = await page.request.post(
      `${backendUrl()}/source/groups/`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: { name: refusedGroupName },
      },
    );
    expect(refusedCreate.status()).toBe(403);
    await clickTopNav(page, "Source Data");
    await expectGridDoesNotContain(page, "sourceGroups-grid", refusedGroupName);

    // One route from every plugin proves that the browser composition applies
    // the shared read-only data policy. Unit/API conformance covers variants.
    for (const [path, heading, createButton] of [
      [
        "/source/data/pcd",
        "Point Cloud Metadata",
        "Create Point Cloud Metadata",
      ],
      [
        "/source/data/gmesh",
        "Ground Mesh Metadata",
        "Create Ground Mesh Metadata",
      ],
      ["/label/data/bbox", "Bounding Box Data", "Create Bounding Box Data"],
      [
        "/label/data/segmentation",
        "Segmentation Data",
        "Create Segmentation Data",
      ],
      ["/label/data/vector", "Vector Data", "Create Vector Data"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      await expect(
        page.getByRole("button", { name: createButton }),
      ).toHaveCount(0);
    }

    await page.goto("/jobs");
    await expect(page).toHaveURL("/");
    await page.goto("/source/files");
    await expect(page).toHaveURL("/");
    await expectBranchAccessThroughUi(page, {
      labelGroupName: labelGroupUpdated,
      visibleBranchName: branchNameUpdated,
      ungrantedBranchName: readOnlyBranchName,
      access: "Write",
    });

    // Verify a project-manager with branch Read permission has read-only data management and read-only branch access.
    await logout(page);
    await loginWith(page, readOnlyUsername, TEST_USER_PASSWORD);
    await expectProjectManagerDataReadOnlyThroughUi(page, {
      sourceGroupName: sourceGroupUpdated,
      labelGroupName: labelGroupUpdated,
    });
    await expectBranchAccessThroughUi(page, {
      labelGroupName: labelGroupUpdated,
      visibleBranchName: readOnlyBranchName,
      ungrantedBranchName: branchNameUpdated,
      access: "Read",
    });
  });

  test("cleans up data workflow fixtures", async ({ page }) => {
    test.setTimeout(300_000);
    // Clean up branches, groups, and temporary accounts through the UI.
    await loginWith(page, dataManagerUsername, TEST_USER_PASSWORD);
    await clickTopNav(page, "Label Data");
    await clickSidebarLink(page, "Repositories");
    await openRowCommand(
      page,
      new RegExp(labelGroupUpdated),
      "Open Repository",
    );
    await expect(page).toHaveURL(/\/label\/repos\/\d+\/branches$/);

    await openRowCommand(page, new RegExp(readOnlyBranchName), "Delete");
    let modal = await visibleModal(page);
    await modal.getByRole("button", { name: "Delete Branch" }).click();
    await expect(modal).toBeHidden();
    await expectGridDoesNotContain(
      page,
      "repositoryBranches-grid",
      readOnlyBranchName,
    );

    await openRowCommand(page, new RegExp(branchNameUpdated), "Delete");
    modal = await visibleModal(page);
    await modal.getByRole("button", { name: "Delete Branch" }).click();
    await expect(modal).toBeHidden();
    await expectGridDoesNotContain(
      page,
      "repositoryBranches-grid",
      branchNameUpdated,
    );

    await clickTopNav(page, "Label Data");
    await openRowCommand(page, new RegExp(labelGroupUpdated), "Delete");
    modal = await visibleModal(page);
    await modal.getByRole("button", { name: "Delete Group" }).click();
    await expect(modal).toBeHidden();
    await expectGridDoesNotContain(page, "labelGroups-grid", labelGroupUpdated);

    await clickTopNav(page, "Source Data");
    await openRowCommand(page, new RegExp(sourceGroupUpdated), "Delete");
    modal = await visibleModal(page);
    await modal.getByRole("button", { name: "Delete Group" }).click();
    await expect(modal).toBeHidden();
    await expectGridDoesNotContain(
      page,
      "sourceGroups-grid",
      sourceGroupUpdated,
    );

    await logout(page);
    await loginAdmin(page);
    await deleteUserThroughUi(page, writePermissionUsername);
    await deleteUserThroughUi(page, readOnlyUsername);
    await deleteUserThroughUi(page, dataManagerUsername);
  });
});
