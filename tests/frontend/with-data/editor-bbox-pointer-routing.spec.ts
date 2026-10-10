/**
 * Bbox pointer routing (FRONTEND_UNIT_COVERAGE_PLAN.md, "Bbox pointer
 * routing"): proves that real browser pointer events and WebGL raycasting
 * reach the bbox transform gizmos, the temporal-continuation hover path,
 * and the ground-relative translate path.
 *
 * Every gesture starts from a projected fixture target (the e2e probe's
 * `projectLabelPoint` / `projectTransformHandle` / `projectWorldPoint`),
 * never from guessed canvas coordinates. The seeded targets are discovered
 * from the editor bulk payloads by their unique geometry, never by result
 * order (see `seed_e2e_pointer_targets` in tests/frontend/serve_e2e_fixture.py).
 *
 * The test mutates the shared fixture database and restores every mutation
 * before completing (undo for transforms, Delete for continued boxes), so
 * retries are disabled.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  centerCameraOnPoint,
  dragFromProjectedTarget,
  editorPanel,
  fillNumberInput,
  inputControl,
  isEditorDataResponse,
  isEditorDataResponseForFrame,
  loadEditorFixture,
  openEditor,
  paneRow,
  projectLabelPoint,
  projectTransformHandle,
  projectWorldPoint,
  selectActiveLayer,
  selectConfiguredLayer,
  setCameraMode,
  setCheckbox,
  uncoverScenePoint,
  zoomOutCamera,
} from "./editor-helpers";

/** A box of the `POST /editor/label/data/bulk?key=bbox` payload. */
interface BulkBox {
  id: string;
  entity_id: string | null;
  timestamp: string | null;
  type: string;
  center: { x: string; y: string; z: string };
  angle: string;
  size: { x: string; y: string; z: string };
}

interface BulkTrack {
  id: string;
  is_black?: boolean;
}
interface BBoxBulk {
  tracks: BulkTrack[];
  boxes: BulkBox[];
}

/** A vector of the `POST /editor/label/data/bulk?key=vector` payload. */
interface BulkVector {
  id: string;
  timestamp: string | null;
  type: string;
  vertices: { x: string; y: string; z: string }[];
}

interface VectorBulk {
  vectors: BulkVector[];
}

interface PointerTargetSeeds {
  ox: number;
  oy: number;
  transformBox: BulkBox;
  earlierBox: BulkBox;
  laterBox: BulkBox;
}

interface BoxGeometry {
  centerX: number;
  centerY: number;
  centerZ: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  angle: number;
}

/**
 * The ground-drag endpoint in DB x. The seeded ground mesh
 * (`e2e_ground_height` in tests/frontend/serve_e2e_fixture.py) is -2 for
 * x <= 10, rises linearly to +2 at x = 30, and the seeded anchor is at
 * ox <= 8, so dragging to x = 25 crosses the slope band with a known
 * ground-height delta while staying inside the default ~±30 m 2D extent.
 */
const GROUND_END_X = 25;

/** Mirrors `e2e_ground_height` in tests/frontend/serve_e2e_fixture.py. */
function groundHeightDb(x: number): number {
  if (x <= 10) return -2;
  if (x >= 30) return 2;
  return -2 + (x - 10) * 0.2;
}

async function blurActiveElement(page: Page) {
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
}

function parseTimestamp(value: string | null): number {
  expect(value, "seeded labels carry timestamps").not.toBeNull();
  const parsed = new Date(value!).getTime();
  expect(Number.isNaN(parsed), `invalid seed timestamp: ${value}`).toBe(false);
  return parsed;
}

/**
 * Finds the seeded pointer targets in the (merged) bulk payloads by their
 * unique geometry, or `null` while any seed is still missing: the label
 * views request one frame per bulk response, so the window's payloads
 * arrive piecemeal after the Time-Path Range widens the temporal window.
 *
 * t2 is the seeded polyline's timestamp; the transform box is the unique
 * 2x2x2 cuboid at angle 0, center z -0.5 with timestamp t2; the earlier
 * box sits 9 m behind it at t < t2; the later box sits 9 m to its side at
 * t > t2.
 */
function findPointerTargetSeeds(
  bboxPayload: BBoxBulk,
  vectorPayload: VectorBulk,
): PointerTargetSeeds | null {
  const polylines = vectorPayload.vectors.filter(
    (vector) => vector.type === "LineString" && vector.vertices.length === 3,
  );
  if (polylines.length !== 1) return null;
  const t2 = parseTimestamp(polylines[0].timestamp);

  const isSeedShape = (box: BulkBox) =>
    box.type === "cuboid" &&
    Number(box.angle) === 0 &&
    Number(box.size.x) === 2 &&
    Number(box.size.y) === 2 &&
    Number(box.size.z) === 2 &&
    Number(box.center.z) === -0.5;
  const near = (value: number, expected: number) =>
    Math.abs(value - expected) < 1e-6;

  const transformCandidates = bboxPayload.boxes.filter(
    (box) => isSeedShape(box) && parseTimestamp(box.timestamp) === t2,
  );
  if (transformCandidates.length !== 1) return null;
  const transformBox = transformCandidates[0];
  const ox = Number(transformBox.center.x);
  const oy = Number(transformBox.center.y);

  const earlierCandidates = bboxPayload.boxes.filter(
    (box) =>
      isSeedShape(box) &&
      parseTimestamp(box.timestamp) < t2 &&
      near(Number(box.center.x), ox - 9) &&
      near(Number(box.center.y), oy),
  );
  if (earlierCandidates.length !== 1) return null;
  const earlierBox = earlierCandidates[0];

  const laterCandidates = bboxPayload.boxes.filter(
    (box) =>
      isSeedShape(box) &&
      parseTimestamp(box.timestamp) > t2 &&
      near(Number(box.center.x), ox) &&
      near(Number(box.center.y), oy + 9),
  );
  if (laterCandidates.length !== 1) return null;
  const laterBox = laterCandidates[0];

  return { ox, oy, transformBox, earlierBox, laterBox };
}

/**
 * Merges every captured bbox bulk payload, de-duplicating by id: the
 * payloads of the frames loaded before and after the Time-Path Range change
 * overlap on the opened frame.
 */
function mergeBBoxBulks(bulks: readonly BBoxBulk[]): BBoxBulk {
  const tracks = new Map<string, BulkTrack>();
  const boxes = new Map<string, BulkBox>();
  for (const bulk of bulks) {
    for (const track of bulk.tracks) tracks.set(track.id, track);
    for (const box of bulk.boxes) boxes.set(box.id, box);
  }
  return { tracks: [...tracks.values()], boxes: [...boxes.values()] };
}

/**
 * Asserts the full `seed_e2e_pointer_targets` discovery contract on the
 * merged bulk payloads and returns the seeds (see
 * {@link findPointerTargetSeeds} for the geometry filter).
 */
function discoverPointerTargetSeeds(
  bboxPayload: BBoxBulk,
  vectorPayload: VectorBulk,
): PointerTargetSeeds {
  const polylines = vectorPayload.vectors.filter(
    (vector) => vector.type === "LineString" && vector.vertices.length === 3,
  );
  expect(
    polylines,
    "the fixture seeds exactly one three-vertex polyline",
  ).toHaveLength(1);
  const t2 = parseTimestamp(polylines[0].timestamp);

  const seeds = findPointerTargetSeeds(bboxPayload, vectorPayload);
  expect(
    seeds,
    "the merged bulk payloads should contain each seeded pointer box exactly once",
  ).not.toBeNull();
  const { ox, transformBox, earlierBox, laterBox } = seeds!;
  expect(
    ox,
    "the seed anchor sits in the flat x <= 10 ground region",
  ).toBeLessThanOrEqual(8);

  // Frames are 1-second instants (frame_timestamp in
  // tests/frontend/serve_e2e_fixture.py), so the seed timestamps are exactly
  // 1 s apart.
  expect(t2 - parseTimestamp(earlierBox.timestamp)).toBe(1000);
  expect(parseTimestamp(laterBox.timestamp) - t2).toBe(1000);

  for (const box of [transformBox, earlierBox, laterBox]) {
    expect(box.entity_id, "every seeded box belongs to a track").toBeTruthy();
  }
  const trackIds = new Set(
    [transformBox, earlierBox, laterBox].map((box) =>
      box.entity_id!.toLowerCase(),
    ),
  );
  expect(trackIds.size, "each seeded box has its own track").toBe(3);
  for (const entityId of trackIds) {
    expect(
      bboxPayload.tracks.some((track) => track.id.toLowerCase() === entityId),
      `the bulk payload lists the seeded track ${entityId}`,
    ).toBe(true);
  }

  return seeds!;
}

/**
 * Selects a box in the inspector dropdown by its label id. The tweakpane
 * list renders no option `value` attributes, so an option's DOM value is
 * its display text `B{<last 6 id chars>} ...` (see ShortUUID and
 * getLabelBoxSelectionItemText); match the seeded id's short form.
 */
async function selectBoxOption(selection: Locator, boxId: string) {
  await selection.fill(boxId);
  const option = selection
    .page()
    .locator(`[role="option"][data-label-id="${boxId}"]`);
  await expect(option).toBeVisible();
  await option.click();
}

/** The inspector Geometry pane renders one row per vector plus the angle. */
function axisInputs(inspector: Locator, label: string) {
  return paneRow(inspector, label).locator("input");
}

async function readTriple(inputs: Locator): Promise<[number, number, number]> {
  const [x, y, z] = await Promise.all([
    inputs.nth(0).inputValue(),
    inputs.nth(1).inputValue(),
    inputs.nth(2).inputValue(),
  ]);
  return [Number(x), Number(y), Number(z)];
}

async function readGeometry(inspector: Locator): Promise<BoxGeometry> {
  const [centerX, centerY, centerZ] = await readTriple(
    axisInputs(inspector, "Center"),
  );
  const [sizeX, sizeY, sizeZ] = await readTriple(axisInputs(inspector, "Size"));
  const angle = Number(await inputControl(inspector, "Angle").inputValue());
  return { centerX, centerY, centerZ, sizeX, sizeY, sizeZ, angle };
}

async function expectGeometryRestored(
  inspector: Locator,
  expected: BoxGeometry,
) {
  await expect
    .poll(
      async () => {
        const current = await readGeometry(inspector);
        return (Object.keys(expected) as (keyof BoxGeometry)[]).every(
          (key) => Math.abs(current[key] - expected[key]) < 0.005,
        );
      },
      { timeout: 30_000 },
    )
    .toBe(true);
}

/**
 * Waits until the inspector geometry echo settles on the given center: the
 * pane re-renders asynchronously after a selection change, and reads before
 * that render return the previous selection's values.
 */
async function expectCenterEcho(
  inspector: Locator,
  centerX: number,
  centerY: number,
) {
  await expect
    .poll(
      async () => {
        const current = await readGeometry(inspector);
        return (
          Math.abs(current.centerX - centerX) < 0.005 &&
          Math.abs(current.centerY - centerY) < 0.005
        );
      },
      { timeout: 15_000 },
    )
    .toBe(true);
}

function selectedHistoryRow(page: Page) {
  return editorPanel(page, "Project").locator(".labelset-history .selected");
}

const GIZMO_HOTKEYS = { translate: "w", rotate: "e", scale: "r" } as const;

/**
 * Projects the gizmo handle of the given mode for the edit-selected box.
 * All three control sets are enabled by default, so the handle normally
 * projects right away; if it does not, the mode's toggle hotkey enables it.
 */
async function projectBBoxHandle(page: Page, mode: keyof typeof GIZMO_HOTKEYS) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const point = await page.evaluate((transformMode) => {
      const probe = window.__STA_E2E_PROBE__;
      return probe == null
        ? null
        : probe.projectTransformHandle({
            layer: "bbox",
            mode: transformMode,
          });
    }, mode);
    if (point != null) return point;
    await page.waitForTimeout(200);
  }
  await blurActiveElement(page);
  await page.keyboard.press(GIZMO_HOTKEYS[mode]);
  return projectTransformHandle(page, { layer: "bbox", mode });
}

/** The inspector display-text prefix of a track id (see ShortUUID). */
function trackTextPrefix(entityId: string) {
  return `T{${entityId.slice(-6)}}`;
}

/**
 * Hovers the real pointer over a rendered box in draw mode and continues it
 * with a drag: earlier-timestamp boxes continue point2center, equal/later
 * ones center2point. In both cases the committed draft keeps the hovered
 * box's size (fixed) and track (retained), and is edit-selected on release.
 * The created box is deleted before returning, restoring the fixture.
 */
async function runContinuationCycle(
  page: Page,
  inspector: Locator,
  selection: Locator,
  hovered: BulkBox,
) {
  // Selecting the hovered box first exposes its track: the Object Track
  // selector echoes the track as `T{<last 6 id chars>} ...` option text,
  // which the continued box must keep.
  await selectBoxOption(selection, hovered.id);
  await expect(page.locator(".hint")).toContainText(/gizmo/i);
  await expectCenterEcho(
    inspector,
    Number(hovered.center.x),
    Number(hovered.center.y),
  );
  const trackSelect = inspector.locator(
    'input[placeholder="(No track selected)"]',
  );
  const trackBefore = await trackSelect.inputValue();
  expect(
    trackBefore.startsWith(trackTextPrefix(hovered.entity_id!)),
    `the inspector should echo the hovered box's seeded track ${hovered.entity_id}`,
  ).toBe(true);

  await blurActiveElement(page);
  await page.keyboard.press("d");
  await expect(page.locator(".hint")).toContainText(/Click and drag to draw/);

  const target = await projectLabelPoint(page, {
    layer: "bbox",
    id: hovered.id,
  });
  await uncoverScenePoint(page, target);
  await page.mouse.move(target.x, target.y);
  // Hovering a rendered box in draw mode switches the scene cursor to copy.
  await expect
    .poll(
      () =>
        page
          .locator("#main-window")
          .evaluate((element) => element.classList.contains("cursor-copy")),
      { timeout: 30_000 },
    )
    .toBe(true);

  // Drag toward the window center so the gesture stays inside the canvas
  // even when the hovered box projects near the edge of the 2D extent.
  const rect = await page.locator("#main-window").boundingBox();
  expect(rect, "the main scene window should have bounds").not.toBeNull();
  let inwardX = rect!.x + rect!.width / 2 - target.x;
  let inwardY = rect!.y + rect!.height / 2 - target.y;
  if (Math.hypot(inwardX, inwardY) < 1) [inwardX, inwardY] = [1, 0];
  const inwardLength = Math.hypot(inwardX, inwardY);
  const end = {
    x: target.x + (inwardX / inwardLength) * 50,
    y: target.y + (inwardY / inwardLength) * 50,
  };

  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 10 });
  await page.mouse.up();

  // The committed continuation box is edit-selected.
  await expect(page.locator(".hint")).toContainText(/gizmo/i);
  const createdValue = await selection.inputValue();
  expect(createdValue).not.toBe("(New box)");
  expect(
    createdValue.startsWith(`B{${hovered.id.slice(-6)}}`),
    "the continued box is a new label, not the hovered one",
  ).toBe(false);

  // The draft kept the hovered box's size (fixed) and track (retained).
  const geometry = await readGeometry(inspector);
  expect(geometry.sizeX).toBeCloseTo(2, 2);
  expect(geometry.sizeY).toBeCloseTo(2, 2);
  expect(geometry.sizeZ).toBeCloseTo(2, 2);
  expect(
    (await trackSelect.inputValue()).startsWith(
      trackTextPrefix(hovered.entity_id!),
    ),
    "the continued box keeps the hovered box's track",
  ).toBe(true);
  await expect(page.locator('[role="alert"]')).toHaveCount(0);

  // Restore the fixture: delete the continued box.
  await blurActiveElement(page);
  await page.keyboard.press("Delete");
  await expect(page.locator(".hint")).not.toContainText(/gizmo/i);
  await expect(selection).toHaveValue("(New box)");
}

test.describe("bbox pointer routing", () => {
  // Mutates the shared fixture database (gizmo transforms, continued
  // boxes) and restores every mutation before completing; a retry could
  // start mid-mutation, so keep it retry-free.
  test.describe.configure({ retries: 0 });

  test("real pointer gestures reach bbox gizmo handles, continuation hovers, and the ground-relative translate path", async ({
    page,
  }) => {
    test.setTimeout(240_000);

    const fixture = await loadEditorFixture(page);
    expect(
      fixture.frames.length,
      "the fixture task seeds five instants",
    ).toBeGreaterThanOrEqual(5);

    // Capture the bulk payloads before navigating: the seeded pointer
    // targets are discovered from them, never from result order. The
    // editor bulk-loads the task's default frame before navigating to
    // the requested one, so the vector capture matches only the opened
    // frame's `frame_ids`; the bbox payloads arrive one frame per
    // request and are collected for merging.
    const openedFrame = fixture.frames[2];
    const bboxBulks: BBoxBulk[] = [];
    page.on("response", (response) => {
      if (!isEditorDataResponse(response, "/editor/label/data/bulk", "bbox"))
        return;
      response
        .json()
        .then((json) => bboxBulks.push(...(json as BBoxBulk[])))
        .catch(() => undefined);
    });
    const vectorBulk = page.waitForResponse((response) =>
      isEditorDataResponseForFrame(
        response,
        "/editor/label/data/bulk",
        "vector",
        openedFrame.id,
      ),
    );
    await openEditor(page, openedFrame);
    const [vectorPayload] = (await (await vectorBulk).json()) as VectorBulk[];

    // The gizmo drag gestures require the orthographic top-down view so
    // page-space deltas map cleanly onto the ground plane and the rotate
    // ring projects as a true circle (see setCameraMode). Then zoom out so
    // the full seeded extent, from the earliest continuation box to the
    // ground-drag endpoint (~52 m along DB x, which maps to screen y) —
    // fits inside the 720px-tall scene window once re-centered below.
    await setCameraMode(page, "2D");
    await zoomOutCamera(page, 9);

    await selectActiveLayer(page, "Label Data", "Bounding Box");
    const inspector = editorPanel(page, "Bounding Box");
    const selection = inspector.locator('input[placeholder="(New box)"]');

    // The bbox data view starts with a zero-width temporal window
    // (current frame only), so the earlier (t1) and later (t3) seeds
    // stay invisible until the Time-Path Range widens the window around
    // the opened frame. The committed preference default is already 2,
    // but the data view only applies it on a real settings *change*:
    // re-typing the displayed value fires no change event, so collapse
    // to 0 first, the 0 -> 2 transition deterministically reloads with
    // the widened window (same pattern as the bbox preferences item in
    // editor-rendering-and-label-workflows.spec.ts).
    const bboxPrefs = await selectConfiguredLayer(
      page,
      "Preferences",
      "Bounding Box",
    );
    const displayRange = inputControl(bboxPrefs, "Time-Path Range");
    await fillNumberInput(displayRange, "0");
    await fillNumberInput(displayRange, "2");

    // The window reload requests each frame separately, so poll until
    // the merged payloads deliver all three seeds.
    await expect
      .poll(
        () =>
          findPointerTargetSeeds(mergeBBoxBulks(bboxBulks), vectorPayload) !=
          null,
        {
          message:
            "the widened bbox window should deliver all three seeded pointer boxes",
          timeout: 60_000,
        },
      )
      .toBe(true);
    const seeds = discoverPointerTargetSeeds(
      mergeBBoxBulks(bboxBulks),
      vectorPayload,
    );

    // Re-center the camera on the midpoint between the earliest seeded box
    // and the ground-drag endpoint so every gizmo handle, continuation box
    // and the ground target stay inside the scene window regardless of
    // where the fixture anchored the seeds. Orthographic pan is 1:1 with
    // the drag distance in screen pixels (see centerCameraOnPoint).
    const centroidDb = {
      x: (seeds.ox - 9 + GROUND_END_X) / 2,
      y: seeds.oy,
      z: -2,
    };
    await centerCameraOnPoint(page, () => projectWorldPoint(page, centroidDb));

    // Wait until the widened window also reaches the inspector's box
    // list, so option counts below are measured against it.
    await selectBoxOption(selection, seeds.earlierBox.id);
    await selectBoxOption(selection, seeds.laterBox.id);

    await selectBoxOption(selection, seeds.transformBox.id);
    await expect(page.locator(".hint")).toContainText(/gizmo/i);
    await expectCenterEcho(inspector, seeds.ox, seeds.oy);
    const seededGeometry = await readGeometry(inspector);
    expect(seededGeometry.centerX).toBeCloseTo(seeds.ox, 2);
    expect(seededGeometry.centerY).toBeCloseTo(seeds.oy, 2);
    expect(seededGeometry.centerZ).toBeCloseTo(-0.5, 2);
    expect(seededGeometry.sizeX).toBeCloseTo(2, 2);
    expect(seededGeometry.sizeY).toBeCloseTo(2, 2);
    expect(seededGeometry.sizeZ).toBeCloseTo(2, 2);
    expect(seededGeometry.angle).toBeCloseTo(0, 2);

    // --- Translate handle: a real drag moves the center ---------------
    const preTranslate = await readGeometry(inspector);
    const translateHandle = await projectBBoxHandle(page, "translate");
    await uncoverScenePoint(page, translateHandle);
    await dragFromProjectedTarget(page, translateHandle, {
      x: translateHandle.x + 40,
      y: translateHandle.y + 30,
    });
    await expect
      .poll(
        async () => {
          const current = await readGeometry(inspector);
          return Math.hypot(
            current.centerX - preTranslate.centerX,
            current.centerY - preTranslate.centerY,
          );
        },
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0.05);
    const afterTranslate = await readGeometry(inspector);
    expect(afterTranslate.sizeX).toBeCloseTo(preTranslate.sizeX, 3);
    expect(afterTranslate.sizeY).toBeCloseTo(preTranslate.sizeY, 3);
    expect(afterTranslate.sizeZ).toBeCloseTo(preTranslate.sizeZ, 3);
    expect(afterTranslate.angle).toBeCloseTo(preTranslate.angle, 3);
    await expect(selectedHistoryRow(page)).toContainText("Transform Box");
    await blurActiveElement(page);
    await page.keyboard.press("Control+z");
    await expectGeometryRestored(inspector, preTranslate);
    await expect(page.locator('[role="alert"]')).toHaveCount(0);

    // --- Rotate handle: a roughly tangential drag changes the angle ----
    const preRotate = await readGeometry(inspector);
    const rotateHandle = await projectBBoxHandle(page, "rotate");
    await uncoverScenePoint(page, rotateHandle);
    const rotateCenter = await projectLabelPoint(page, {
      layer: "bbox",
      id: seeds.transformBox.id,
    });
    const radialX = rotateHandle.x - rotateCenter.x;
    const radialY = rotateHandle.y - rotateCenter.y;
    const radialLength = Math.hypot(radialX, radialY);
    expect(
      radialLength,
      "the rotate handle projects away from the box center",
    ).toBeGreaterThan(4);
    const rotateEnd = {
      x: rotateHandle.x + (-radialY / radialLength) * 50,
      y: rotateHandle.y + (radialX / radialLength) * 50,
    };
    await dragFromProjectedTarget(page, rotateHandle, rotateEnd);
    await expect
      .poll(
        async () =>
          Math.abs((await readGeometry(inspector)).angle - preRotate.angle),
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0.01);
    await expect(selectedHistoryRow(page)).toContainText("Transform Box");
    await blurActiveElement(page);
    await page.keyboard.press("Control+z");
    await expectGeometryRestored(inspector, preRotate);
    await expect(page.locator('[role="alert"]')).toHaveCount(0);

    // --- Scale handle: an outward drag changes a size component --------
    const preScale = await readGeometry(inspector);
    const scaleHandle = await projectBBoxHandle(page, "scale");
    await uncoverScenePoint(page, scaleHandle);
    const scaleCenter = await projectLabelPoint(page, {
      layer: "bbox",
      id: seeds.transformBox.id,
    });
    const outwardX = scaleHandle.x - scaleCenter.x;
    const outwardY = scaleHandle.y - scaleCenter.y;
    const outwardLength = Math.hypot(outwardX, outwardY);
    expect(
      outwardLength,
      "the scale handle projects away from the box center",
    ).toBeGreaterThan(4);
    const scaleEnd = {
      x: scaleHandle.x + (outwardX / outwardLength) * 60,
      y: scaleHandle.y + (outwardY / outwardLength) * 60,
    };
    await dragFromProjectedTarget(page, scaleHandle, scaleEnd);
    await expect
      .poll(
        async () => {
          const current = await readGeometry(inspector);
          return Math.max(
            Math.abs(current.sizeX - preScale.sizeX),
            Math.abs(current.sizeY - preScale.sizeY),
            Math.abs(current.sizeZ - preScale.sizeZ),
          );
        },
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0.01);
    await expect(selectedHistoryRow(page)).toContainText("Transform Box");
    await blurActiveElement(page);
    await page.keyboard.press("Control+z");
    await expectGeometryRestored(inspector, preScale);
    await expect(page.locator('[role="alert"]')).toHaveCount(0);

    // --- Continuation: hover + drag from earlier, later, and equal boxes
    await runContinuationCycle(page, inspector, selection, seeds.earlierBox);
    await runContinuationCycle(page, inspector, selection, seeds.laterBox);
    await runContinuationCycle(page, inspector, selection, seeds.transformBox);

    // --- Ground-relative translate across the seeded slope -------------
    // Maintain elevation is on by default; verify (and enable) it via
    // the Bounding Box preferences before the ground-relative drag.
    await selectConfiguredLayer(page, "Preferences", "Bounding Box");
    await setCheckbox(bboxPrefs, /Maintain elevation/, true);

    await selectBoxOption(selection, seeds.transformBox.id);
    await expect(page.locator(".hint")).toContainText(/gizmo/i);
    await expectCenterEcho(inspector, seeds.ox, seeds.oy);
    const preGround = await readGeometry(inspector);
    expect(
      preGround.centerX,
      "the ground drag starts in the flat region",
    ).toBeLessThanOrEqual(8.01);

    const groundHandle = await projectBBoxHandle(page, "translate");
    await uncoverScenePoint(page, groundHandle);
    const groundEnd = await projectWorldPoint(page, {
      x: GROUND_END_X,
      y: seeds.oy,
      z: -2,
    });
    const mainWindowRect = await page.locator("#main-window").boundingBox();
    expect(
      mainWindowRect,
      "the main scene window should have bounds",
    ).not.toBeNull();
    expect(
      groundEnd.x,
      "the ground endpoint projects inside the scene window",
    ).toBeGreaterThan(mainWindowRect!.x + 5);
    expect(groundEnd.x).toBeLessThan(
      mainWindowRect!.x + mainWindowRect!.width - 5,
    );
    expect(groundEnd.y).toBeGreaterThan(mainWindowRect!.y + 5);
    expect(groundEnd.y).toBeLessThan(
      mainWindowRect!.y + mainWindowRect!.height - 5,
    );

    await dragFromProjectedTarget(page, groundHandle, groundEnd, {
      steps: 16,
    });

    // Relative elevation is preserved: center z changes by the
    // ground-height delta between the start and end DB x.
    const expectedCenterZ =
      preGround.centerZ +
      (groundHeightDb(GROUND_END_X) - groundHeightDb(preGround.centerX));
    expect(
      Math.abs(expectedCenterZ - preGround.centerZ),
      "the drag crosses the slope band",
    ).toBeGreaterThan(2);
    await expect
      .poll(
        async () => {
          const current = await readGeometry(inspector);
          return Math.abs(current.centerZ - expectedCenterZ);
        },
        { timeout: 30_000 },
      )
      .toBeLessThanOrEqual(0.3);
    const afterGround = await readGeometry(inspector);
    expect(Math.abs(afterGround.centerZ - expectedCenterZ)).toBeLessThanOrEqual(
      0.3,
    );
    expect(Math.abs(afterGround.centerX - GROUND_END_X)).toBeLessThanOrEqual(1);
    expect(Math.abs(afterGround.centerX - preGround.centerX)).toBeGreaterThan(
      Math.abs(GROUND_END_X - preGround.centerX) / 2,
    );
    await expect(selectedHistoryRow(page)).toContainText("Transform Box");
    await blurActiveElement(page);
    await page.keyboard.press("Control+z");
    await expectGeometryRestored(inspector, preGround);
    await expect(page.locator('[role="alert"]')).toHaveCount(0);

    // --- End state: deselected, fixture restored, no alerts ------------
    await blurActiveElement(page);
    await page.keyboard.press("Escape");
    await expect(page.locator(".hint")).not.toContainText(/gizmo/i);
    await expect(selection).toHaveValue("(New box)");
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
  });
});
