import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  centerCameraOnPoint,
  clickElement,
  editorPanel,
  type EditorProbeLabelTarget,
  exactButton,
  expectCurrentFrame,
  fillNumberInput,
  inputControl,
  isEditorDataResponse,
  loadEditorFixture,
  openEditor,
  openProjectPanelSection,
  probeHoveredLabel,
  probeSelectorRaycast,
  probeSelectorState,
  projectWorldPoint,
  readCurrentFrameId,
  readLabelBranchKeys,
  readSeededBoxes,
  scenePoint,
  SEED_IDS,
  selectActiveLayer,
  selectConfiguredLayer,
  setCameraMode,
  uncoverTarget,
} from "./editor-helpers";

async function renderedScene(page: Page) {
  await page.waitForTimeout(400);
  return page
    .locator("#display-container canvas")
    .screenshot({ animations: "disabled" });
}

async function renderedRegion(
  page: Page,
  center: { x: number; y: number },
  size = 160,
) {
  await page.waitForTimeout(400);
  return page.screenshot({
    animations: "disabled",
    clip: {
      x: center.x - size / 2,
      y: center.y - size / 2,
      width: size,
      height: size,
    },
  });
}

function expectPixelsChanged(before: Buffer, after: Buffer, behavior: string) {
  expect(
    after.equals(before),
    `${behavior} should change the rendered scene`,
  ).toBe(false);
}

async function selectCameraMode(page: Page, mode: "2D" | "3D") {
  const radio = editorPanel(page, "Preferences").getByRole("radio", {
    name: mode,
    exact: true,
  });
  await radio.evaluate((element: HTMLInputElement) => element.click());
  await expect(radio).toBeChecked();
}

test("main-camera wheel zoom changes the rendered scene in 2D and 3D", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openEditor(page);
  for (const mode of ["2D", "3D"] as const) {
    await selectCameraMode(page, mode);
    const point = await scenePoint(page, 0.55, 0.55);
    const before = await renderedScene(page);
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, -500);
    expectPixelsChanged(
      before,
      await renderedScene(page),
      `${mode} wheel zoom`,
    );
  }
});

test("main-camera orbit and pan gestures change the 3D scene", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openEditor(page);
  await selectCameraMode(page, "3D");
  const point = await scenePoint(page, 0.55, 0.55);
  const beforeOrbit = await renderedScene(page);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down({ button: "left" });
  await page.mouse.move(point.x + 90, point.y + 45, { steps: 8 });
  await page.mouse.up({ button: "left" });
  const afterOrbit = await renderedScene(page);
  expectPixelsChanged(beforeOrbit, afterOrbit, "left-drag orbit");

  await page.mouse.move(point.x, point.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(point.x - 70, point.y + 50, { steps: 8 });
  await page.mouse.up({ button: "right" });
  expectPixelsChanged(afterOrbit, await renderedScene(page), "right-drag pan");
});

test("right-dragging the minimap pans the synchronized camera", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openEditor(page);
  await selectCameraMode(page, "2D");
  const minimap = page.locator("#minimap-window");
  // Collapse the panel stack that overlaps the minimap before the gesture.
  await uncoverTarget(page, minimap, 0.55, 0.55);
  const rect = await minimap.boundingBox();
  expect(rect).not.toBeNull();
  const mainProbe = await scenePoint(page, 0.55, 0.55);
  const x = rect!.x + rect!.width * 0.55;
  const y = rect!.y + rect!.height * 0.55;
  const beforeMain = await renderedRegion(page, mainProbe);
  const beforeMinimap = await renderedRegion(
    page,
    { x, y },
    Math.min(120, rect!.width - 12, rect!.height - 12),
  );
  await page.mouse.move(x, y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(x + 45, y + 30, { steps: 8 });
  await page.mouse.up({ button: "right" });
  expectPixelsChanged(
    beforeMain,
    await renderedRegion(page, mainProbe),
    "minimap pan synchronized main camera",
  );
  expectPixelsChanged(
    beforeMinimap,
    await renderedRegion(
      page,
      { x, y },
      Math.min(120, rect!.width - 12, rect!.height - 12),
    ),
    "minimap pan camera",
  );
});

test("minimap hover displays a coordinate tooltip", async ({ page }) => {
  test.setTimeout(120_000);
  await openEditor(page);
  const minimap = page.locator("#minimap-window");
  // The minimap element is visible before its React layout effect installs
  // the Tippy instance and pointer listener. Wait for that behavior, rather
  // than racing the effect with a synthetic pointermove.
  await expect(minimap).toHaveAttribute(
    "data-coordinate-tooltip-ready",
    "true",
  );
  // Collapse the panel stack that overlaps the minimap before hovering it.
  await uncoverTarget(page, minimap, 0.5, 0.5);
  const rect = await minimap.boundingBox();
  expect(rect).not.toBeNull();
  // Enter from outside the minimap and emit several pointer moves. Tippy can
  // show its shell on pointerenter before our pointermove listener has set
  // the coordinate content, so a single teleport can briefly expose an empty
  // tooltip.
  await page.mouse.move(rect!.x + rect!.width + 10, rect!.y - 10);
  await page.mouse.move(
    rect!.x + rect!.width * 0.45,
    rect!.y + rect!.height * 0.45,
    { steps: 4 },
  );
  const dispatchMinimapMove = (fx: number, fy: number) =>
    minimap.evaluate(
      (element, point) =>
        element.dispatchEvent(
          new PointerEvent("pointermove", {
            bubbles: true,
            clientX: point.x,
            clientY: point.y,
            pointerType: "mouse",
          }),
        ),
      {
        x: rect!.x + rect!.width * fx,
        y: rect!.y + rect!.height * fy,
      },
    );
  await dispatchMinimapMove(0.45, 0.45);
  const coordinatePattern = /\(-?\d+\.\d{3}, -?\d+\.\d{3}\)/;
  const tooltip = page
    .locator(".tippy-content")
    .filter({ hasText: coordinatePattern })
    .last();
  await expect(tooltip).toContainText(coordinatePattern);
});

/** Asserts the hint bar shows the bbox edit-selected-box text. */
function expectBoxSelectedHint(page: Page) {
  return expect(page.locator(".hint")).toContainText(/gizmo/i);
}

/** Asserts the hint bar shows the bbox draw text. */
function expectBBoxDrawHint(page: Page) {
  return expect(page.locator(".hint")).toContainText(/Click and drag to draw/);
}

test.describe("label draw gesture lifecycle", () => {
  // Draws and cancels real labels in the shared fixture database (restoring
  // them afterward), so a retry could start mid-mutation; keep it retry-free.
  test.describe.configure({ retries: 0 });

  test("a bbox draw completes through pointer capture and commits exactly one box", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openEditor(page);
    await selectActiveLayer(page, "Label Data", "Bounding Box");

    // The 'd' hotkey engages the draw action.
    await page.keyboard.press("d");
    await expectBBoxDrawHint(page);
    expect(
      await page
        .locator("#main-window")
        .evaluate((element) =>
          [...element.classList].some((name) => name.startsWith("cursor-")),
        ),
    ).toBe(true);

    // Drag through the scene; the gesture must survive pointer capture and
    // commit exactly one label on release.
    const point = await scenePoint(page, 0.55, 0.55);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down({ button: "left" });
    await page.mouse.move(point.x + 120, point.y + 80, { steps: 12 });
    await page.mouse.up({ button: "left" });

    // The committed box is selected for editing.
    await expectBoxSelectedHint(page);
    await expect(page.locator('[role="alert"]')).toHaveCount(0);

    // Restore the fixture: delete the drawn box and drop back to the
    // unselected edit hint.
    await page.keyboard.press("Delete");
    await expect(page.locator(".hint")).not.toContainText(/gizmo/i);
  });

  test("navigating before pointer-up cancels the bbox draft without committing", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const fixture = await openEditor(page);
    expect(fixture.frames.length).toBeGreaterThan(1);
    await selectActiveLayer(page, "Label Data", "Bounding Box");

    // Initialize playback stepping so the 'c' (step next frame) hotkey has a
    // path index to move along.
    const project = editorPanel(page, "Project");
    await clickElement(exactButton(project, "Scene"));
    await fillNumberInput(inputControl(project, "Stride"), "1");
    const currentIndex = inputControl(project, "Current index along path:");
    await openProjectPanelSection(project, "Playback", currentIndex);
    await fillNumberInput(currentIndex, "0");
    const initialFrame = await readCurrentFrameId(page);

    // The number inputs above leave a form control focused; hotkeys are
    // intentionally ignored while a form control has focus.
    await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.blur(),
    );
    await page.keyboard.press("d");
    await expectBBoxDrawHint(page);
    const point = await scenePoint(page, 0.55, 0.55);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down({ button: "left" });
    await page.mouse.move(point.x + 100, point.y + 60, { steps: 10 });

    // Navigate to the next frame before the gesture's final pointer event.
    await page.keyboard.press("c");
    await expect
      .poll(() => readCurrentFrameId(page), { timeout: 30_000 })
      .not.toBe(initialFrame);

    // Completing the stale gesture must not commit a label on either frame:
    // no box enters the edit state.
    await page.mouse.up({ button: "left" });
    await expect(page.locator(".hint")).not.toContainText(/gizmo/i);
    // The draw action was cancelled by the navigation.
    await expect(page.locator(".hint")).not.toContainText(
      /Click and drag to draw/,
    );
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
  });

  test("switching the active layer mid-gesture cancels the draw and reroutes input", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openEditor(page);
    await selectActiveLayer(page, "Label Data", "Bounding Box");

    await page.keyboard.press("d");
    await expectBBoxDrawHint(page);
    const point = await scenePoint(page, 0.55, 0.55);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down({ button: "left" });
    await page.mouse.move(point.x + 90, point.y + 50, { steps: 8 });

    // Activate another label layer while the gesture is still held. Use a
    // synthetic click: a real pointer click would be retargeted to the
    // canvas by the active pointer capture.
    const layers = editorPanel(page, "Layers");
    const segmentationRow = layers
      .locator('[data-test="editor-layer-row-segmentation"]')
      .or(
        layers
          .locator(".layer-menu-table-row")
          .filter({ hasText: "Segmentation" }),
      )
      .first();
    const rowName = segmentationRow
      .locator('[data-test="editor-layer-name"], .layer-name')
      .filter({ hasText: /Segmentation/ });
    await rowName.dispatchEvent("click");
    await expect(rowName).toHaveClass(/active/);

    // Releasing the pointer commits nothing for the abandoned gesture: no
    // bbox edit hint appears and the draw cursor is gone.
    await page.mouse.up({ button: "left" });
    await expect(page.locator(".hint")).not.toContainText(/gizmo/i);
    expect(
      await page
        .locator("#main-window")
        .evaluate((element) =>
          [...element.classList].some((name) => name.startsWith("cursor-add")),
        ),
    ).toBe(false);
    await expect(page.locator('[role="alert"]')).toHaveCount(0);

    // Subsequent input is routed to the newly active enabled layer: the
    // segmentation draw hint (not the bbox one) engages.
    await page.keyboard.press("d");
    await expect(page.locator(".hint")).toContainText(
      /drawing|to query points/i,
    );
    await expect(page.locator(".hint")).not.toContainText(/cuboid|draw a box/i);
  });

  test("Escape cancels an active draw while Delete stays inert until the gesture settles", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openEditor(page);
    await selectActiveLayer(page, "Label Data", "Bounding Box");
    const inspector = editorPanel(page, "Bounding Box");
    const selection = inspector.locator("select").first();
    const point = await scenePoint(page, 0.55, 0.55);

    // Escape mid-drag wins deterministically: the draft is cancelled and the
    // abandoned pointer-up commits nothing.
    const countBeforeEscape = await selection.locator("option").count();
    await page.keyboard.press("d");
    await expectBBoxDrawHint(page);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down({ button: "left" });
    await page.mouse.move(point.x + 100, point.y + 60, { steps: 10 });
    await page.keyboard.press("Escape");
    await page.mouse.up({ button: "left" });
    await expect(page.locator(".hint")).not.toContainText(/gizmo/i);
    await expect
      .poll(() => selection.locator("option").count())
      .toBe(countBeforeEscape);

    // Delete is not bound while drawing: the gesture keeps its precedence,
    // commits exactly one box on release, and only then does Delete act.
    // The Escape phase above can leave either the draw state (draft aborted)
    // or the empty edit state (a trailing pointer-up selecting nothing),
    // depending on event ordering; Escape is idempotent from both, so twice
    // deterministically reaches the navigate state before re-entering draw.
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    const countBeforeDelete = await selection.locator("option").count();
    await page.keyboard.press("d");
    await expectBBoxDrawHint(page);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down({ button: "left" });
    await page.mouse.move(point.x + 100, point.y + 60, { steps: 10 });
    await page.keyboard.press("Delete");
    // Delete is unbound while drawing: the active-draw state (and its hint)
    // is unchanged mid-gesture. The in-progress draft already shows in the
    // inspector, so the count is asserted only after the gesture settles.
    await expect(page.locator(".hint")).toContainText(
      /Release the pointer to finish drawing/,
    );
    await page.mouse.up({ button: "left" });
    await expectBoxSelectedHint(page);
    await expect
      .poll(() => selection.locator("option").count())
      .toBe(countBeforeDelete + 1);
    await expect(page.locator('[role="alert"]')).toHaveCount(0);

    // Restore the fixture: the committed box is deleted by a post-gesture Delete.
    await page.keyboard.press("Delete");
    await expect(page.locator(".hint")).not.toContainText(/gizmo/i);
    await expect
      .poll(() => selection.locator("option").count())
      .toBe(countBeforeDelete);
  });
});

// Label hover routing (FRONTEND_UNIT_COVERAGE_PLAN.md, "Suggested E2E
// resolution" / "Label hover routing"): proves a real pointer + WebGL
// raycast recolors a known rendered bbox, vector, and segmentation label.
// For each layer, a conspicuous non-default hover color is configured, the
// real pointer moves onto a probe-projected seeded label and back onto
// known empty ground, and a localized crop around the label must change
// and then restore exactly. Localized crops avoid unrelated camera or
// scene noise; the camera stays untouched so crops remain comparable; all
// three layers cycle in one editor session. Hover never persists and the
// hover-color preferences are idempotent, so the default retry policy stays.

interface HoverSeeds {
  bboxId: string;
  vectorId: string;
  segmentationId: string;
  /** DB-space center of the transform box (anchors the camera framing). */
  anchor: { x: number; y: number };
}

interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Crop size for the localized hover pixel comparisons. */
const HOVER_CROP_SIZE = 100;

/** Deadline for the hover raycast + re-render to reach the canvas. */
const HOVER_SETTLE_TIMEOUT_MS = 15_000;

/**
 * The three label layers, each with a conspicuous non-default hover color.
 *
 * The color blade's text input parses components as INTEGERS 0-255
 * (tweakpane's `createColorStringParser('int')` backs the object-color
 * blades regardless of their float display), so the filled text must use the
 * 0-255 form; `hoverColorEcho` is the float rendering the pane shows after
 * the commit, asserted so a silent parse failure cannot masquerade as a
 * hover-rendering failure.
 */
function hoverLayerSpecs(seeds: HoverSeeds) {
  return [
    {
      label: "bbox",
      layerName: "Bounding Box",
      bulkKey: "bbox",
      probeLayer: { layer: "bbox" } as const,
      seedId: seeds.bboxId,
      // The default bbox hover color is red {1, 0, 0}.
      hoverColor: "{r: 0, g: 255, b: 255}",
      hoverColorEcho: "{r: 0.00, g: 1.00, b: 1.00}",
      target: {
        layer: "bbox",
        id: seeds.bboxId,
      } as EditorProbeLabelTarget,
    },
    {
      label: "vector",
      layerName: "Vector",
      bulkKey: "vector",
      probeLayer: { layer: "vector" } as const,
      seedId: seeds.vectorId,
      // The default vector hover color is yellow {1, 1, 0}.
      hoverColor: "{r: 255, g: 0, b: 255}",
      hoverColorEcho: "{r: 1.00, g: 0.00, b: 1.00}",
      target: {
        layer: "vector",
        id: seeds.vectorId,
        index: 1,
      } as EditorProbeLabelTarget,
    },
    {
      label: "segmentation",
      layerName: "Segmentation",
      bulkKey: "segmentation",
      probeLayer: { layer: "segmentation" } as const,
      seedId: seeds.segmentationId,
      // The default segmentation hover color is red {1, 0, 0}.
      hoverColor: "{r: 0, g: 255, b: 0}",
      hoverColorEcho: "{r: 0.00, g: 1.00, b: 0.00}",
      target: {
        layer: "segmentation",
        id: seeds.segmentationId,
      } as EditorProbeLabelTarget,
    },
  ];
}

/**
 * Waits until the label bulk responses for `key` have been quiet for a few
 * seconds. The first settings-pane commit moves a layer's time-path range from
 * its initial 0 to the pane default, reloading the label window; every data
 * load resets the layer's interaction state, so gestures must only start
 * after the reload settles.
 */
async function waitForBulkSettle(page: Page, key: string) {
  for (;;) {
    const response = await page
      .waitForResponse(
        (candidate) =>
          isEditorDataResponse(candidate, "/editor/label/data/bulk", key),
        { timeout: 5_000 },
      )
      .catch(() => null);
    if (response == null) return;
  }
}

async function fillColorInput(input: Locator, value: string) {
  await input.fill(value);
  await input.press("Enter");
  await input.blur();
}

/** Whether the whole hover crop around `point` fits inside `bounds`. */
function cropFitsInBounds(
  point: { x: number; y: number },
  bounds: WindowBounds,
) {
  const half = HOVER_CROP_SIZE / 2;
  return (
    point.x - half >= bounds.x &&
    point.x + half <= bounds.x + bounds.width &&
    point.y - half >= bounds.y &&
    point.y + half <= bounds.y + bounds.height
  );
}

/** True when the crop's center and corners sit on the scene window, not a panel. */
async function isCropOnScene(page: Page, point: { x: number; y: number }) {
  const half = HOVER_CROP_SIZE / 2;
  const samples = [
    [point.x, point.y],
    [point.x - half + 1, point.y - half + 1],
    [point.x + half - 1, point.y - half + 1],
    [point.x - half + 1, point.y + half - 1],
    [point.x + half - 1, point.y + half - 1],
  ];
  return page.evaluate(
    (probes) =>
      probes.every(([x, y]) => {
        let element: Element | null = document.elementFromPoint(x, y);
        while (element != null) {
          if (element.id === "main-window") return true;
          element = element.parentElement;
        }
        return false;
      }),
    samples,
  );
}

// Ground offsets (DB meters) from the seed anchor, which the camera centers
// on: at the default 0.05 units/px these stay within the scene window's crop
// budget. Each clears the seeded labels: transform box at (0, 0), earlier
// box (-9, 0), later box (0, +9), polyline (+3..+11, -4..-10), selection
// disk (-4, -6) r=0.8, the nearest seed is >= 5 m away.
const EMPTY_GROUND_OFFSETS = [
  { x: 7, y: 5 },
  { x: 7, y: 6 },
  { x: -7, y: 5 },
  { x: -7, y: -7 },
  { x: -8, y: 6 },
];

/** The first empty ground point whose crop fits the main window unoccluded. */
async function findEmptyGroundPoint(
  page: Page,
  bounds: WindowBounds,
  anchor: HoverSeeds["anchor"],
) {
  let empty: { x: number; y: number } | null = null;
  for (const offset of EMPTY_GROUND_OFFSETS) {
    const point = await projectWorldPoint(page, {
      x: anchor.x + offset.x,
      y: anchor.y + offset.y,
      z: -2,
    });
    if (!cropFitsInBounds(point, bounds)) continue;
    if (!(await isCropOnScene(page, point))) continue;
    empty = point;
    break;
  }
  expect(
    empty,
    "an empty ground point should project to an unoccluded main-window crop",
  ).not.toBeNull();
  return empty!;
}

/**
 * Polls the crop around `center` until it differs from (`expectChanged`) or
 * exactly matches (`!expectChanged`) `reference`: the hover raycast and
 * re-render can lag the pointer by a frame or two. Fails with a clear
 * message if the deadline passes first.
 */
async function waitForHoverCrop(
  page: Page,
  center: { x: number; y: number },
  reference: Buffer,
  expectChanged: boolean,
  behavior: string,
) {
  const deadline = Date.now() + HOVER_SETTLE_TIMEOUT_MS;
  let crop = reference;
  while (Date.now() < deadline) {
    crop = await renderedRegion(page, center, HOVER_CROP_SIZE);
    if (crop.equals(reference) !== expectChanged) return;
  }
  expect(
    crop.equals(reference),
    expectChanged
      ? `${behavior} should change the rendered label pixels`
      : `${behavior} should restore the pre-hover label pixels`,
  ).toBe(!expectChanged);
}

/**
 * Projects a label target through the probe, retrying until the label is
 * present in the layer's data view. Two effects make the label briefly
 * unprojectable after `openEditor` returns: the bulk payload arrives before
 * the layer finishes materializing its labels, and, because the editor
 * bulk-loads the task's default frame before navigating to the requested one
 *, the requested frame's load completes asynchronously after openEditor's
 * data-load wait. Under shared-machine load that second load can take a while,
 * so the deadline is generous (matches the bbox pointer-routing seed poll).
 */
async function projectLabelPointWhenReady(
  page: Page,
  target: EditorProbeLabelTarget,
) {
  const deadline = Date.now() + 60_000;
  for (;;) {
    const point = await page.evaluate(
      (probeTarget) =>
        window.__STA_E2E_PROBE__?.projectLabelPoint(probeTarget) ?? null,
      target,
    );
    if (point != null) return point;
    expect(
      Date.now(),
      `the probe should eventually project label target ${JSON.stringify(target)}`,
    ).toBeLessThan(deadline);
    await page.waitForTimeout(200);
  }
}

test("label hover routing changes and restores rendered label pixels", async ({
  page,
}) => {
  test.setTimeout(240_000);

  const fixture = await loadEditorFixture(page);
  expect(
    fixture.frames.length,
    "the fixture should have the five editor frames",
  ).toBeGreaterThan(2);

  // The seed labels carry deterministic ids (stable_uuid_int in the fixture),
  // so address them directly instead of parsing the bulk payloads captured
  // during navigation: the editor bulk-loads the task's default frame before
  // the requested one, and under shared-machine load the captured response can
  // race the seeded frame's data. The transform box's element record supplies
  // the anchor the empty-ground candidates offset from.
  const branchKeys = await readLabelBranchKeys(page, fixture.task.id);
  const [transformBox] = await readSeededBoxes(page, branchKeys, [
    SEED_IDS.transformBox,
  ]);
  expect(
    transformBox,
    "the fixture should seed the transform box",
  ).toBeTruthy();
  const seeds: HoverSeeds = {
    bboxId: SEED_IDS.transformBox,
    vectorId: SEED_IDS.polyline,
    segmentationId: SEED_IDS.selection,
    anchor: { x: transformBox.centerX, y: transformBox.centerY },
  };

  // Every seed is timestamped t2 and the label views default to the opened
  // frame, so all three seeds are visible from frame 2.
  const openedFrame = fixture.frames[2];
  await openEditor(page, openedFrame);
  // openEditor's data-load wait resolves on the task's DEFAULT frame bulk
  // responses; the navigation to the requested frame (and its label load)
  // completes asynchronously afterward. Wait for it explicitly so the seeded
  // frame's labels are present before any projection (under shared-machine
  // load the async leg can otherwise outlast the projection readiness poll).
  await expectCurrentFrame(page, openedFrame.id);

  const mainWindow = page.locator("#main-window");
  const windowBounds = await mainWindow.boundingBox();
  expect(
    windowBounds,
    "the main scene window should have bounds",
  ).not.toBeNull();

  // The probe is attached only once the editor runtime finishes mounting,
  // which can lag the bulk data responses that openEditor waits on.
  await page.waitForFunction(
    () => window.__STA_E2E_PROBE__ != null,
    undefined,
    { timeout: 30_000 },
  );

  // Use the orthographic top-down view so page-space hover positions map
  // cleanly onto the labels. The labels render above the point cloud, so the
  // hover-color changes are visible without hiding it.
  await setCameraMode(page, "2D");

  for (const spec of hoverLayerSpecs(seeds)) {
    // Drop the previous layer's select/edit state so the centering pan's
    // pointer-down cannot select a label under the window center.
    await page.keyboard.press("Escape");

    // Re-center the camera on this label BEFORE opening its hover-color panel
    // (an open panel would intercept the right-drag pan), and let the camera
    // settle so projection and rendering agree. Centering each label keeps it
    // large and comfortably inside the scene window for the hover crop.
    await centerCameraOnPoint(page, () =>
      projectLabelPointWhenReady(page, spec.target),
    );
    await page.waitForTimeout(400);

    const row = await selectActiveLayer(page, "Label Data", spec.layerName);

    // Configure the hover color BEFORE engaging the select action: the first
    // settings commit widens the layer's time-path range and reloads the label
    // window, and every data load resets the interaction state to edit.
    const prefs = await selectConfiguredLayer(
      page,
      "Preferences",
      spec.layerName,
    );
    const hoverColor = inputControl(prefs, "Hover color");
    const bulkSettle = waitForBulkSettle(page, spec.bulkKey);
    await fillColorInput(hoverColor, spec.hoverColor);
    await expect(hoverColor).toHaveValue(spec.hoverColorEcho);
    await bulkSettle;

    // Layers default to the 'edit' action, whose state disables label hover
    // raycasts; engage the select action (after the reload settled) so
    // hovering a rendered label is routed to the layer's selector.
    await clickElement(exactButton(row, "S"));
    await expect(page.locator("#main-window")).toHaveClass(/cursor-crosshair/);

    // Project the seeded hover target; never guess canvas coordinates. A
    // target outside the visible window is a fixture/probe contract
    // violation, not something to silently work around. Poll until the layer
    // has materialized the label (the bulk payload lands first).
    const target = await projectLabelPointWhenReady(page, spec.target);
    expect(
      cropFitsInBounds(target, windowBounds!),
      `the ${spec.label} hover target should project inside the main scene window`,
    ).toBe(true);
    expect(
      await isCropOnScene(page, target),
      `the ${spec.label} hover target should not be occluded by panels`,
    ).toBe(true);

    // Park the pointer on known empty ground so nothing is hovered or
    // selected (a selection's color would override the hover color).
    const empty = await findEmptyGroundPoint(page, windowBounds!, seeds.anchor);
    await page.mouse.move(empty.x, empty.y);
    await expect
      .poll(() => probeHoveredLabel(page, spec.probeLayer), {
        message: `the ${spec.label} seed should not be hovered while the pointer is parked`,
      })
      .not.toBe(spec.seedId);
    const before = await renderedRegion(page, target, HOVER_CROP_SIZE);

    // Pointer-routing proof: the real pointer move onto the projected label
    // must be registered by the layer's selector before pixels are compared.
    // A few extra pointer moves give the hover raycast a settled pointer, and
    // the diagnostics captured alongside a routing failure bisect the cause:
    // the manual raycast (same ray a real pointer produces) shows whether the
    // selector can see the label at all, and the live selector state shows
    // whether hover is enabled and whether pointer events reached it.
    await page.mouse.move(target.x, target.y);
    await page.mouse.move(target.x + 1, target.y, { steps: 3 });
    await page.mouse.move(target.x, target.y, { steps: 3 });
    const manualRaycast = await probeSelectorRaycast(
      page,
      spec.probeLayer,
      target,
    );
    const selectorState = await probeSelectorState(page, spec.probeLayer);
    await expect
      .poll(() => probeHoveredLabel(page, spec.probeLayer), {
        message:
          `the real pointer should be routed to the seeded ${spec.label} ` +
          `(manual selector raycast: ${JSON.stringify(manualRaycast)}; ` +
          `selector state: hoverEnabled=${selectorState.hoverEnabled}, ` +
          `ray origin ${JSON.stringify(selectorState.ray.origin)})`,
      })
      .toBe(spec.seedId);
    await waitForHoverCrop(page, target, before, true, `${spec.label} hover`);

    await page.mouse.move(empty.x, empty.y);
    await expect
      .poll(() => probeHoveredLabel(page, spec.probeLayer), {
        message: `leaving the seeded ${spec.label} should drop its hover`,
      })
      .not.toBe(spec.seedId);
    await waitForHoverCrop(
      page,
      target,
      before,
      false,
      `${spec.label} unhover`,
    );
  }
});
