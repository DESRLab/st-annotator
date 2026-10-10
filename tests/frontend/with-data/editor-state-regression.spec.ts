import { expect, type Locator, type Page, test } from "@playwright/test";

import {
  clickElement,
  editorPanel,
  exactButton,
  expectButtonSelected,
  fillNumberInput,
  getEditorRenderState,
  inputControl,
  isButtonSelected,
  openEditor,
  openProjectPanelSection,
  selectActiveLayer,
  selectConfiguredLayer,
  selectControl,
  setCheckboxInput,
  waitForEditorRenderAfter,
} from "./editor-helpers";

async function selectedOptionText(select: Locator) {
  return select.evaluate(
    (element: HTMLSelectElement) =>
      element.selectedOptions[0]?.textContent ?? "",
  );
}

async function drawCursorApplied(page: Page) {
  return page
    .locator("#main-window")
    .evaluate((element) =>
      [...element.classList].some((name) => name.startsWith("cursor-add")),
    );
}

/**
 * Presses an editor hotkey with nothing holding focus. A hotkey is inert while
 * a form or Tweakpane control has focus, so pressing straight after a pane
 * commit would be swallowed for a reason that has nothing to do with the state
 * under test.
 */
async function pressEditorKey(page: Page, key: string) {
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  await page.keyboard.press(key);
}

test("label creation stays gated while label data is still loading", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const fixture = await openEditor(page);
  expect(fixture.frames.length).toBeGreaterThan(2);
  // A frame outside the default time-path range. The labels of an adjacent frame
  // are already loaded, so opening one issues no request at all and gates
  // nothing, which is what let the press below land in an open gate.
  const targetFrame = fixture.frames[fixture.frames.length - 1];
  await selectActiveLayer(page, "Label Data", "Bounding Box");

  // Hold the load of the frame being opened so it cannot finish. Matching the
  // frame is what makes this the gating request: the layer also prefetches its
  // neighbours, and holding one of those leaves the layer ready with a
  // background fetch outstanding. Other label plugins share the endpoint, so
  // match its key as well.
  let holdLabels = true;
  let lastBulkRequestAt = Date.now();
  const heldLabelRequests: (() => void)[] = [];
  await page.route(
    (url) =>
      url.pathname.endsWith("/editor/label/data/bulk") &&
      url.searchParams.get("key") === "bbox" &&
      url.searchParams.getAll("frame_ids").includes(String(targetFrame.id)),
    async (route) => {
      lastBulkRequestAt = Date.now();
      if (holdLabels) {
        await new Promise<void>((resolve) => {
          heldLabelRequests.push(resolve);
        });
      }
      // A request the page aborts while held (a superseded load) can no longer
      // be continued; the load that replaced it gets its own handler.
      await route.continue().catch(() => undefined);
    },
  );

  const project = editorPanel(page, "Project");
  await clickElement(exactButton(project, "Scene"));
  const currentFrameId = inputControl(project, "Current Frame ID");
  await openProjectPanelSection(project, "Frames", currentFrameId);
  await fillNumberInput(currentFrameId, String(targetFrame.id));

  // While frame data is in flight the app presents a modal overlay naming the
  // layers still outstanding, and creation and editing are refused until it
  // clears. Press on that state rather than on "a request has started": waiting
  // for it keeps polling until a load is  in flight, and the held
  // response then keeps it there.
  const loadingOverlay = page.locator('[data-test="project-loading-overlay"]');
  await expect(
    page.getByRole("progressbar", { name: /^Bounding Box: / }),
  ).toHaveAccessibleName(/^Bounding Box: (Loading|\d+%)/, {
    timeout: 30_000,
  });

  const layers = editorPanel(page, "Layers");
  const bboxRow = layers.locator('[data-test="editor-layer-row-bounding-box"]');

  // The draw hotkey must be swallowed while the labels load.
  await pressEditorKey(page, "d");

  holdLabels = false;
  for (const release of heldLabelRequests.splice(0)) release();
  await expect(loadingOverlay).toBeHidden({ timeout: 60_000 });
  // The layer's after-load reset and the neighbour prefetch still run after the
  // overlay clears, and a hotkey pressed into either is a no-op, so wait for the
  // bulk activity to go quiet before proving the gate has reopened.
  await expect
    .poll(() => Date.now() - lastBulkRequestAt >= 2000, { timeout: 60_000 })
    .toBe(true);

  // The press left no trace: the layer is still in its navigate state...
  expect(await isButtonSelected(exactButton(bboxRow, "D"))).toBe(false);

  // ...and the same key now engages drawing, which is what makes the check above
  // say something about the gate rather than about a hotkey that never works.
  await pressEditorKey(page, "d");
  await expectButtonSelected(bboxRow, "D");
  await expect(page.locator(".hint")).toContainText(/Click and drag to draw/);
  await expect.poll(() => drawCursorApplied(page)).toBe(true);
  await expect(page.locator('[role="alert"]')).toHaveCount(0);
});

test("Task selector navigates to another task and back with real data reloads", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const fixture = await openEditor(page);
  const project = editorPanel(page, "Project");
  const task = selectControl(project, "Task:");
  const waitForPcd = () =>
    page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "POST" &&
        url.pathname.endsWith("/editor/source/data/bulk") &&
        url.searchParams.get("key") === "pcd"
      );
    });

  const selectTaskContaining = async (name: string) => {
    const option = task.locator("option").filter({ hasText: name });
    await expect(option).toHaveCount(1);
    const value = await option.evaluate(
      (element: HTMLOptionElement) => element.value,
    );
    expect(value, `missing task option containing ${name}`).toBeTruthy();
    await task.selectOption(value!, { force: true });
  };
  const alternateLoad = waitForPcd();
  await selectTaskContaining("E2E Review");
  expect((await alternateLoad).ok()).toBe(true);
  await expect.poll(() => selectedOptionText(task)).toContain("E2E Review");
  const alternateFrame = await inputControl(
    project,
    "Current Frame ID",
  ).inputValue();
  expect(Number(alternateFrame)).toBeGreaterThan(0);

  await selectTaskContaining(fixture.task.name);
  await expect
    .poll(() => selectedOptionText(task))
    .toContain(fixture.task.name);
  await expect
    .poll(() => inputControl(project, "Current Frame ID").inputValue())
    .not.toBe(alternateFrame);
});

test("editor mirrors active layer, enabled state, and layer preference state", async ({
  page,
}) => {
  test.setTimeout(180_000);

  await openEditor(page);

  const pointCloudRow = await selectActiveLayer(
    page,
    "Source Data",
    "Point Cloud",
  );
  const enabled = pointCloudRow.locator('input[type="checkbox"]').first();
  await expect(enabled).toBeChecked();
  await setCheckboxInput(enabled, false);
  await expect(
    pointCloudRow.locator('[data-test="editor-layer-name"], .layer-name'),
  ).not.toHaveClass(/active/);
  await expect(editorPanel(page, "Tools")).toContainText("No layer selected");

  await setCheckboxInput(enabled, true);
  await selectActiveLayer(page, "Source Data", "Point Cloud");
  const pointCloudPrefs = await selectConfiguredLayer(
    page,
    "Preferences",
    "Point Cloud",
  );
  await fillNumberInput(inputControl(pointCloudPrefs, "Point Size"), "4");

  await selectActiveLayer(page, "Label Data", "Bounding Box");
  const bboxPrefs = await selectConfiguredLayer(
    page,
    "Preferences",
    "Bounding Box",
  );
  await fillNumberInput(inputControl(bboxPrefs, "Time-Path Range"), "1");

  await selectActiveLayer(page, "Source Data", "Point Cloud");
  await expect(inputControl(pointCloudPrefs, "Point Size")).toHaveValue(/4/);
  await selectActiveLayer(page, "Label Data", "Bounding Box");
  await expect(inputControl(bboxPrefs, "Time-Path Range")).toHaveValue(/1/);
});

test("Enable All and Disable All update every layer in the selected layer tab and the rendered scene", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openEditor(page);
  const layers = editorPanel(page, "Layers");
  const canvas = page.locator("#display-container canvas").first();

  for (const [tab, slugs] of [
    ["Source Data", ["point-cloud", "ground-mesh"]],
    ["Label Data", ["bounding-box", "vector", "segmentation"]],
  ] as const) {
    await layers.getByText(tab, { exact: true }).click();
    const before = await canvas.screenshot({ animations: "disabled" });
    const beforeDisable = await getEditorRenderState(page);
    await clickElement(exactButton(layers, "Disable All"));
    for (const slug of slugs) {
      await expect(
        layers.locator(
          `[data-test="editor-layer-row-${slug}"] input[type="checkbox"]`,
        ),
      ).not.toBeChecked();
    }
    await expect(exactButton(layers, "Enable All")).toBeVisible();
    await waitForEditorRenderAfter(page, beforeDisable.generation);
    const disabled = await canvas.screenshot({ animations: "disabled" });
    expect(
      disabled.equals(before),
      `${tab} aggregate disable should change the scene`,
    ).toBe(false);

    const beforeEnable = await getEditorRenderState(page);
    await clickElement(exactButton(layers, "Enable All"));
    for (const slug of slugs) {
      await expect(
        layers.locator(
          `[data-test="editor-layer-row-${slug}"] input[type="checkbox"]`,
        ),
      ).toBeChecked();
    }
    await expect(exactButton(layers, "Disable All")).toBeVisible();
    await waitForEditorRenderAfter(page, beforeEnable.generation);
  }
});
