import { expect, test, type Page } from "@playwright/test";

import { loginWith } from "../helpers/accounts";

import { apiGet, getAccessToken, loadEditorFixture } from "./editor-helpers";

interface ApiFrame {
  id: number;
  account_id: number;
  source_group_id: number | null;
  label_branch_id: number | null;
  min_timestamp: string | null;
  max_timestamp: string | null;
  is_complete: boolean;
}

const FRAMES_GRID_ID = "frames-grid-container-grid";
const PROJECTS_GRID_ID = "projects-grid";
const SOURCE_GROUPS_GRID_ID = "sourceGroups-grid";
const LABEL_GROUPS_GRID_ID = "labelGroups-grid";

function gridRows(page: Page, gridId: string) {
  return page.locator(`#${gridId} .slick-row`);
}

function firstRowIdCell(page: Page, gridId: string) {
  return gridRows(page, gridId).first().locator(".slick-cell").first();
}

function gridTotalItems(page: Page) {
  return page.locator('[data-test="total-items"]');
}

async function fillColumnFilter(page: Page, columnName: string, value: string) {
  const filter = page.getByLabel(`${columnName} Search Filter`);
  await expect(filter).toBeVisible();
  await filter.fill(value);
  await filter.press("Enter");
}

function encodeFilters(filters: Record<string, unknown>[]) {
  return encodeURIComponent(JSON.stringify(filters));
}

async function openFramesPage(page: Page, accountId: number) {
  const fixture = await loadEditorFixture(page);
  await loginWith(page, "e2e-annotator", "password");
  await page.goto(
    `/projects/${fixture.project.id}/tasks/${fixture.task.id}/frames/annotate?account_id=${accountId}`,
  );
  await expect(page.locator(`#${FRAMES_GRID_ID}`)).toBeVisible();
  return fixture;
}

test.describe("server-side grid filtering and sorting", () => {
  test("frames grid filters by id and reflects the state in the URL", async ({
    page,
  }) => {
    const token = await getAccessToken(page);
    const fixture = await loadEditorFixture(page);
    const apiFrames = await apiGet<ApiFrame[]>(
      page,
      token,
      `/frames/?task_id=${fixture.task.id}&work_type=annotate&limit=100`,
    );
    expect(apiFrames.length).toBeGreaterThan(1);

    await openFramesPage(page, apiFrames[0].account_id);
    await expect(gridRows(page, FRAMES_GRID_ID)).toHaveCount(apiFrames.length);

    const target = apiFrames[Math.floor(apiFrames.length / 2)];
    await fillColumnFilter(page, "ID", String(target.id));

    await expect(gridRows(page, FRAMES_GRID_ID)).toHaveCount(1);
    await expect(firstRowIdCell(page, FRAMES_GRID_ID)).toHaveText(
      String(target.id),
    );
    await expect(gridTotalItems(page)).toHaveText("1");

    await page.waitForURL((url) => url.searchParams.get("filters") != null);
    expect(new URL(page.url()).searchParams.get("filters")).toContain(
      String(target.id),
    );
  });

  test("frames grid sorts by timestamp through the server", async ({
    page,
  }) => {
    const token = await getAccessToken(page);
    const fixture = await loadEditorFixture(page);
    const apiFrames = await apiGet<ApiFrame[]>(
      page,
      token,
      `/frames/?task_id=${fixture.task.id}&work_type=annotate&limit=100`,
    );
    expect(apiFrames.length).toBeGreaterThan(1);

    const parseTimestamp = (frame: ApiFrame) =>
      Date.parse(frame.min_timestamp ?? "");
    const sortedAsc = [...apiFrames].sort(
      (left, right) => parseTimestamp(left) - parseTimestamp(right),
    );
    const sortedDesc = [...apiFrames].sort(
      (left, right) => parseTimestamp(right) - parseTimestamp(left),
    );

    await openFramesPage(page, apiFrames[0].account_id);
    await expect(gridRows(page, FRAMES_GRID_ID)).toHaveCount(apiFrames.length);

    const timestampHeader = page
      .locator(`#${FRAMES_GRID_ID} .slick-header-column`)
      .filter({ hasText: "Min. Timestamp" })
      .locator(".slick-column-name");

    await timestampHeader.click();
    await page.waitForURL(
      (url) => url.searchParams.get("sort") === "min_timestamp:asc",
    );
    await expect(firstRowIdCell(page, FRAMES_GRID_ID)).toHaveText(
      String(sortedAsc[0].id),
    );

    await timestampHeader.click();
    await page.waitForURL(
      (url) => url.searchParams.get("sort") === "min_timestamp:desc",
    );
    await expect(firstRowIdCell(page, FRAMES_GRID_ID)).toHaveText(
      String(sortedDesc[0].id),
    );
  });

  test("frames grid applies filter presets from the URL", async ({ page }) => {
    const token = await getAccessToken(page);
    const fixture = await loadEditorFixture(page);
    const apiFrames = await apiGet<ApiFrame[]>(
      page,
      token,
      `/frames/?task_id=${fixture.task.id}&work_type=annotate&limit=100`,
    );
    expect(apiFrames.length).toBeGreaterThan(1);
    await loginWith(page, "e2e-annotator", "password");

    const framesUrl = `/projects/${fixture.project.id}/tasks/${fixture.task.id}/frames/annotate?account_id=${apiFrames[0].account_id}`;

    // An IN filter matching every frame's source group keeps the full list.
    const matching = encodeFilters([
      {
        columnId: "source_group_id",
        operator: "IN",
        searchTerms: [String(apiFrames[0].source_group_id)],
      },
    ]);
    await page.goto(`${framesUrl}&filters=${matching}`);
    await expect(gridRows(page, FRAMES_GRID_ID)).toHaveCount(apiFrames.length);
    await expect(gridTotalItems(page)).toHaveText(String(apiFrames.length));

    // An id filter matching nothing empties the grid, proving the filter
    // runs server-side against the full dataset.
    const emptying = encodeFilters([
      { columnId: "id", operator: "", searchTerms: ["-1"] },
    ]);
    await page.goto(`${framesUrl}&filters=${emptying}`);
    await expect(gridRows(page, FRAMES_GRID_ID)).toHaveCount(0);
    await expect(gridTotalItems(page)).toHaveText("0");

    // Filter and sort presets combine.
    const sortedDesc = [...apiFrames].sort(
      (left, right) =>
        Date.parse(right.min_timestamp ?? "") -
        Date.parse(left.min_timestamp ?? ""),
    );
    const combined = encodeFilters([
      {
        columnId: "source_group_id",
        operator: "IN",
        searchTerms: [String(apiFrames[0].source_group_id)],
      },
    ]);
    await page.goto(`${framesUrl}&filters=${combined}&sort=min_timestamp:desc`);
    await expect(firstRowIdCell(page, FRAMES_GRID_ID)).toHaveText(
      String(sortedDesc[0].id),
    );
  });

  test("projects grid filters by name server-side", async ({ page }) => {
    // The fixture annotator is a project member, so project listing needs no
    // project-management role.
    await loginWith(page, "e2e-annotator", "password");
    await page.goto("/projects");
    await expect(page.locator(`#${PROJECTS_GRID_ID}`)).toBeVisible();
    await expect(gridTotalItems(page)).not.toHaveText("0");

    await fillColumnFilter(page, "Name", "E2E Editor");
    await expect(gridRows(page, PROJECTS_GRID_ID)).toHaveCount(1);
    await expect(gridRows(page, PROJECTS_GRID_ID).first()).toContainText(
      "E2E Editor",
    );
    await expect(gridTotalItems(page)).toHaveText("1");
    await page.waitForURL((url) => url.searchParams.get("filters") != null);

    await fillColumnFilter(page, "Name", "no-such-project");
    await expect(gridRows(page, PROJECTS_GRID_ID)).toHaveCount(0);
    await expect(gridTotalItems(page)).toHaveText("0");
  });

  test("source and label group grids filter by name server-side", async ({
    page,
  }) => {
    await loginWith(page, "e2e-project-manager", "password");

    await page.goto("/source/groups");
    await expect(page.locator(`#${SOURCE_GROUPS_GRID_ID}`)).toBeVisible();
    await fillColumnFilter(page, "Name", "E2E Point Clouds");
    await expect(gridRows(page, SOURCE_GROUPS_GRID_ID)).toHaveCount(1);
    await expect(gridRows(page, SOURCE_GROUPS_GRID_ID).first()).toContainText(
      "E2E Point Clouds",
    );
    await expect(gridTotalItems(page)).toHaveText("1");

    await fillColumnFilter(page, "Name", "no-such-group");
    await expect(gridRows(page, SOURCE_GROUPS_GRID_ID)).toHaveCount(0);
    await expect(gridTotalItems(page)).toHaveText("0");

    await page.goto("/label/groups");
    await expect(page.locator(`#${LABEL_GROUPS_GRID_ID}`)).toBeVisible();
    await fillColumnFilter(page, "Name", "E2E Labels");
    await expect(gridRows(page, LABEL_GROUPS_GRID_ID)).toHaveCount(1);
    await expect(gridTotalItems(page)).toHaveText("1");
  });
});
