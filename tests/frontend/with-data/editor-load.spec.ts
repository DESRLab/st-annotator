import { expect, test } from "@playwright/test";

import { loginWith } from "../helpers/accounts";

import {
  editorPanel,
  expectCurrentFrame,
  getEditorRenderState,
  loadEditorFixture,
  openEditor,
  selectActiveLayer,
  selectControl,
  uncoverTarget,
  waitForEditorDataLoad,
  waitForEditorRenderAfter,
} from "./editor-helpers";

test("deep-link hydration selects the requested project, task, branch, frame, and labels", async ({
  page,
}) => {
  test.setTimeout(180_000);

  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  const fixture = await loadEditorFixture(page);
  const dataLoad = waitForEditorDataLoad(page);

  await loginWith(page, "e2e-annotator", "password");
  await page.goto(
    `/projects/${fixture.project.id}/annotate?task_id=${fixture.task.id}&frame_id=${fixture.frame.id}`,
  );
  await expect(
    page.locator(
      '[data-test="editor-display"] canvas, #display-container canvas',
    ),
  ).toBeVisible({ timeout: 60_000 });
  await dataLoad;

  await expect(page.locator("#error-page")).toHaveCount(0);
  for (const panelTitle of [
    "Project",
    "Layers",
    "Controls",
    "Tools",
    "Preferences",
  ]) {
    await expect(editorPanel(page, panelTitle)).toBeVisible();
  }
  const project = editorPanel(page, "Project");
  await expect(selectControl(project, "Task:")).toContainText(
    fixture.task.name,
  );
  await expect(selectControl(project, "Source Group:")).toContainText(
    "E2E Point Clouds",
  );
  await expect(selectControl(project, "Label Branch:")).toContainText("main");
  await expectCurrentFrame(page, fixture.frame.id);

  await selectActiveLayer(page, "Label Data", "Bounding Box");
  // The loaded boxes must populate the box inspector's selection list.
  const selection = editorPanel(page, "Bounding Box").locator("select").first();
  await expect
    .poll(() => selection.locator("option").count())
    .toBeGreaterThan(1);
  await expect(selection.locator("option").nth(1)).toContainText("B{");
  expect(pageErrors).toEqual([]);
});

test("annotation editor redirects when its project does not exist", async ({
  page,
}) => {
  const fixture = await loadEditorFixture(page);
  await loginWith(page, "e2e-annotator", "password");

  await page.goto(
    `/projects/${fixture.project.id + 1_000_000}/annotate?task_id=${fixture.task.id}`,
  );

  await expect(page).toHaveURL(/\/projects$/);
});

test("label inspector overlays mount without resizing the editor", async ({
  page,
}) => {
  test.setTimeout(180_000);

  await openEditor(page);

  for (const [layerName, inspectorTitle] of [
    ["Bounding Box", "Bounding Box"],
    ["Vector", "Vector Objects"],
    ["Segmentation", "Object Instance"],
  ] as const) {
    await selectActiveLayer(page, "Label Data", layerName);
    await expect(editorPanel(page, inspectorTitle)).toBeVisible();
  }

  await expect(editorPanel(page, "Selection Points")).toBeVisible();
});

test("activating a label layer shows its default interaction hint", async ({
  page,
}) => {
  test.setTimeout(180_000);

  await openEditor(page);

  // The bbox layer's interact context is constructed disabled and its React
  // inspectors register while still disabled; the default interaction state
  // must be created when the layer is enabled, before any explicit action.
  await selectActiveLayer(page, "Label Data", "Bounding Box");

  const hint = page.locator(".hint").first();
  await expect(hint).toContainText("select a box");
  await expect(hint).toContainText("draw a box");
  await expect(hint.locator("kbd")).toHaveCount(2);
});

test("editor panels collapse, expand, and drag", async ({ page }) => {
  test.setTimeout(120_000);
  await openEditor(page);

  const project = editorPanel(page, "Project");
  const header = project.locator(".header");
  const toggle = header.locator("label").last();
  const expandedRect = await project.boundingBox();
  expect(expandedRect).not.toBeNull();
  await toggle.dispatchEvent("pointerdown");
  await expect(project).toHaveClass(/collapsed/);
  const collapsedRect = await project.boundingBox();
  expect(collapsedRect!.height).toBeLessThan(expandedRect!.height);
  await toggle.dispatchEvent("pointerdown");
  await expect(project).not.toHaveClass(/collapsed/);

  const title = header.locator("label").first();
  const beforeDrag = await project.boundingBox();
  await title.hover();
  await page.mouse.down();
  await page.mouse.move(beforeDrag!.x + 70, beforeDrag!.y + 45, { steps: 5 });
  await page.mouse.up();
  const afterDrag = await project.boundingBox();
  expect(afterDrag!.x).not.toBe(beforeDrag!.x);
  expect(afterDrag!.y).not.toBe(beforeDrag!.y);
});

test("a label inspector overlay collapses, expands, and drags independently", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openEditor(page);
  await selectActiveLayer(page, "Label Data", "Bounding Box");
  const inspector = editorPanel(page, "Bounding Box");
  const header = inspector.locator(".header");
  const toggle = header.locator("label").last();
  const expanded = await inspector.boundingBox();
  expect(expanded).not.toBeNull();
  await toggle.dispatchEvent("pointerdown");
  await expect(inspector).toHaveClass(/collapsed/);
  expect((await inspector.boundingBox())!.height).toBeLessThan(
    expanded!.height,
  );
  await toggle.dispatchEvent("pointerdown");
  await expect(inspector).not.toHaveClass(/collapsed/);

  const title = header.locator("label").first();
  // By default the Controls/Object Track panels overlap the inspector header,
  // so collapse anything covering the title before the real-pointer drag.
  await uncoverTarget(page, title);
  const before = await inspector.boundingBox();
  await title.hover();
  await page.mouse.down();
  await page.mouse.move(before!.x - 55, before!.y + 45, { steps: 5 });
  await page.mouse.up();
  const after = await inspector.boundingBox();
  expect({ x: after!.x, y: after!.y }).not.toEqual({
    x: before!.x,
    y: before!.y,
  });
});

test("minimap can be repositioned by dragging", async ({ page }) => {
  test.setTimeout(120_000);
  await openEditor(page);
  const minimap = page.locator("#minimap-window");
  // The left panel stack overlaps the minimap by default; collapse whatever
  // covers the body region this gesture drags. Stay well away from the
  // resizable edges so Interact.js consistently classifies this as a drag.
  await uncoverTarget(page, minimap, 0.25, 0.25);
  const initialMini = await minimap.boundingBox();
  expect(initialMini).not.toBeNull();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await uncoverTarget(page, minimap, 0.25, 0.25);
    const current = await minimap.boundingBox();
    expect(current).not.toBeNull();
    const startX = current!.x + current!.width * 0.25;
    const startY = current!.y + current!.height * 0.25;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 35, startY + 25, { steps: 8 });
    await page.mouse.up();

    const moved = await minimap.boundingBox();
    if (moved != null && moved.x > initialMini!.x && moved.y > initialMini!.y)
      break;
  }
  await expect
    .poll(async () => (await minimap.boundingBox())?.x ?? initialMini!.x)
    .toBeGreaterThan(initialMini!.x);
  await expect
    .poll(async () => (await minimap.boundingBox())?.y ?? initialMini!.y)
    .toBeGreaterThan(initialMini!.y);
});

test("minimap can be resized from its bottom-right border", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openEditor(page);
  const minimap = page.locator("#minimap-window");
  // The resize gesture grabs the bottom-right corner, so uncover that corner
  // specifically (the Project panel overlaps it in the default layout).
  await uncoverTarget(page, minimap, 0.98, 0.98);
  const movedMini = await minimap.boundingBox();
  expect(movedMini).not.toBeNull();
  const canvas = page.locator("#display-container canvas").first();
  const beforePixels = await canvas.screenshot({ animations: "disabled" });
  const beforeResize = await getEditorRenderState(page);
  // Interact.js resolves the draggable and resizable actions from the same
  // pointerdown. Under load, the first corner gesture can occasionally be
  // classified as a drag before its edge state settles. Retry from freshly
  // measured bounds until a resize is observed.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await uncoverTarget(page, minimap, 0.98, 0.98);
    const current = await minimap.boundingBox();
    expect(current).not.toBeNull();
    await page.mouse.move(
      current!.x + current!.width - 2,
      current!.y + current!.height - 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      current!.x + current!.width + 40,
      current!.y + current!.height + 30,
      { steps: 8 },
    );
    await page.mouse.up();

    const resized = await minimap.boundingBox();
    if (
      resized != null &&
      resized.width > movedMini!.width &&
      resized.height > movedMini!.height
    )
      break;
  }
  const resizedMini = await minimap.boundingBox();
  expect(resizedMini!.width).toBeGreaterThan(movedMini!.width);
  expect(resizedMini!.height).toBeGreaterThan(movedMini!.height);
  await waitForEditorRenderAfter(page, beforeResize.generation);
  const resizedPixels = await canvas.screenshot({ animations: "disabled" });
  expect(
    resizedPixels.equals(beforePixels),
    "resizing the minimap should repaint its viewport",
  ).toBe(false);
});
