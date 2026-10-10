/**
 * Implements the "Vector pointer routing" item of
 * FRONTEND_UNIT_COVERAGE_PLAN.md ("Suggested E2E resolution").
 *
 * Coordinate conversion, checkpoint validity, and operation undo remain unit
 * responsibilities; this scenario proves real handle registration: genuine
 * browser pointer events must reach the vector gizmo, so a middle-vertex drag
 * in Vertex mode moves only that vertex, and a whole-vector plane drag in
 * Vertices mode moves every vertex by the same delta, each undone to full
 * restoration.
 *
 * Every gesture starts from a projected fixture target (the seeded polyline's
 * live vertex positions and gizmo handles, projected through the editor e2e
 * probe), never from guessed canvas coordinates. The camera never moves
 * during the test, so page-point deltas compare directly. Unsaved vertex
 * edits never reach the backend: both edits are undone before completion,
 * nothing is saved, and the describe opts out of retries.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  clickElement,
  dragFromProjectedTarget,
  editorPanel,
  type EditorProbePoint,
  type EditorProbeTransformTarget,
  exactButton,
  expectCurrentFrame,
  isButtonSelected,
  loadEditorFixture,
  openEditor,
  projectLabelPoint,
  SEED_IDS,
  selectActiveLayer,
  setCameraMode,
  uncoverScenePoint,
  zoomOutCamera,
} from "./editor-helpers";

/** Slack for the pointer→drag-plane mapping and handle hit snapping. */
const MOVED_TOLERANCE_PX = 15;
/** Model-space undo restores exact vertices; only projection noise remains. */
const RESTORED_TOLERANCE_PX = 2;

/** Blurs any focused form control, since editor hotkeys ignore those. */
async function pressEditorKey(page: Page, key: string) {
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  await page.keyboard.press(key);
}

/**
 * Nullable projection of a gizmo handle through the e2e probe. Unlike the
 * shared `projectTransformHandle`, this does not fail on `null`, so it also
 * serves for negative checks (a disabled mode's handles are unregistered).
 */
async function probeTransformHandle(
  page: Page,
  target: EditorProbeTransformTarget,
) {
  return page.evaluate(
    (probeTarget) =>
      window.__STA_E2E_PROBE__?.projectTransformHandle(probeTarget) ?? null,
    target,
  );
}

/** Projects a gizmo handle once it exists and registers (edit state settled). */
async function projectTransformHandleWhenReady(
  page: Page,
  target: EditorProbeTransformTarget,
) {
  await expect
    .poll(() => probeTransformHandle(page, target), {
      message: `gizmo handle ${JSON.stringify(target)} should project through the e2e probe`,
      timeout: 60_000,
    })
    .not.toBeNull();
  return (await probeTransformHandle(page, target))!;
}

/** Projects the polyline's three live vertices, in vertex order. */
async function projectedVertices(
  page: Page,
  id: string,
): Promise<EditorProbePoint[]> {
  return [
    await projectLabelPoint(page, { layer: "vector", id, index: 0 }),
    await projectLabelPoint(page, { layer: "vector", id, index: 1 }),
    await projectLabelPoint(page, { layer: "vector", id, index: 2 }),
  ];
}

function distance(from: EditorProbePoint, to: EditorProbePoint) {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

function translated(
  point: EditorProbePoint,
  delta: EditorProbePoint,
): EditorProbePoint {
  return { x: point.x + delta.x, y: point.y + delta.y };
}

/** Page-space distance of one live vertex from a reference point, polled. */
function vertexDistanceFrom(
  page: Page,
  id: string,
  vertex: number,
  reference: EditorProbePoint,
) {
  return expect.poll(
    async () =>
      distance(
        await projectLabelPoint(page, { layer: "vector", id, index: vertex }),
        reference,
      ),
    { timeout: 30_000 },
  );
}

function selectedHistory(page: Page): Locator {
  return editorPanel(page, "Project").locator(".labelset-history .selected");
}

/**
 * Selects a vector in the inspector dropdown by its label id. The tweakpane
 * list renders no option `value` attributes, so an option's DOM value is its
 * display text `P{<last 6 id chars>} ...` (see ShortUUID); match the seeded
 * id's short form. Selecting enters the edit state, which attaches the gizmo
 * (Tools Copy becomes enabled).
 */
async function selectVectorOption(
  selection: Locator,
  vectorId: string,
): Promise<string> {
  await selection.fill(vectorId);
  const option = selection
    .page()
    .locator(`[role="option"][data-label-id="${vectorId}"]`);
  await expect(option).toBeVisible({ timeout: 60_000 });
  const text = (await option.textContent()) ?? "";
  await option.click();
  return text;
}

/**
 * Sets the vector transformer's Translation Modes through the Tools panel
 * select grid (the `w`/`e` hotkeys only toggle, so they cannot reach a known
 * state from the default where BOTH modes are enabled). Each phase enables
 * exactly one mode because the two handle sets overlap at the seeded
 * polyline's bounding-box center, which is vertex 1, since the fixture line
 * is collinear and evenly spaced, and the per-mode drag controllers do not
 * arbitrate between each other.
 */
async function setTranslationModes(
  page: Page,
  modes: { vertex: boolean; vertices: boolean },
) {
  const tools = editorPanel(page, "Tools");
  // A prior gesture may have collapsed the Tools panel to uncover a scene
  // point; re-expand it so the Translation Mode buttons are reachable.
  if (
    await tools.evaluate((element) => element.classList.contains("collapsed"))
  ) {
    await tools.locator(".header label").last().dispatchEvent("pointerdown");
    await expect(tools).not.toHaveClass(/collapsed/);
  }
  for (const [label, wanted] of [
    ["Vertex", modes.vertex],
    ["Vertices", modes.vertices],
  ] as const) {
    const button = exactButton(tools, label);
    await expect(button).toBeEnabled();
    if ((await isButtonSelected(button)) !== wanted) {
      await clickElement(button);
    }
    await expect.poll(() => isButtonSelected(button)).toBe(wanted);
  }
}

/**
 * Reads the *live* Translation-Mode gizmo registration through the probe
 * (a mode is on exactly when its handles are registered/visible), rather than
 * trusting the Tools buttons' appearance.
 */
async function readLiveTranslationModes(page: Page) {
  return {
    vertex:
      (await probeTransformHandle(page, {
        layer: "vector",
        mode: "vertex",
        index: 1,
      })) != null,
    vertices:
      (await probeTransformHandle(page, {
        layer: "vector",
        mode: "vertices",
      })) != null,
  };
}

/**
 * Drives the Translation Modes to the requested exclusive state and waits for
 * the live gizmo registration to actually settle on it. Toggling the Tools
 * select grid echoes its state back into the transformer a beat later
 * (settings-change -> onInputChange -> setControlsEnabled), which can
 * re-enable a mode that was just disabled; re-applying and re-reading the
 * live handles converges on the requested state instead of racing it.
 */
async function enforceTranslationModes(
  page: Page,
  modes: { vertex: boolean; vertices: boolean },
) {
  const matches = (live: { vertex: boolean; vertices: boolean }) =>
    live.vertex === modes.vertex && live.vertices === modes.vertices;
  const deadline = Date.now() + 20_000;
  let live = await readLiveTranslationModes(page);
  while (!matches(live)) {
    await setTranslationModes(page, modes);
    // Let the select grid's settings echo settle before reading the handles.
    await page.waitForTimeout(400);
    live = await readLiveTranslationModes(page);
    if (matches(live)) break;
    expect(
      Date.now(),
      `the vector Translation Modes should settle to ${JSON.stringify(modes)}, still ${JSON.stringify(live)}`,
    ).toBeLessThan(deadline);
  }
}

test.describe("vector pointer routing", () => {
  // Mutates the shared fixture's label state in the browser. Every mutation
  // is undone before completion and nothing is saved, but a retry could
  // restart mid-gesture, so keep it retry-free like the other mutating
  // scenarios.
  test.describe.configure({ retries: 0 });

  test("vertex and whole-vector handle drags route real pointer gestures to the seeded polyline", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const errors: Error[] = [];
    page.on("pageerror", (error) => errors.push(error));

    // The seeded polyline carries a deterministic id (stable_uuid_int in the
    // fixture), so address it directly rather than parsing the bulk payload
    // captured during navigation: on load the editor first bulk-loads the
    // default frame and only then the requested one, and under shared-machine
    // load the captured response can race ahead of the seeded frame's data.
    const fixture = await loadEditorFixture(page);
    expect(fixture.frames.length).toBeGreaterThanOrEqual(5);
    const openedFrame = fixture.frames[2];
    await openEditor(page, openedFrame);
    // openEditor's data-load wait resolves on the task's DEFAULT frame bulk
    // responses; the navigation to the requested frame (and its label load)
    // completes asynchronously afterward. Wait for it explicitly so the seeded
    // polyline is present before it is looked up in the inspector.
    await expectCurrentFrame(page, openedFrame.id);
    // The vertex/whole-vector drag gestures require the orthographic top-down
    // view so page-space deltas map 1:1 onto the scene's horizontal plane and
    // a gesture that lands on a handle never falls through to the camera (see
    // setCameraMode). Then zoom out so the seeded polyline and its gizmo
    // handles sit inside the scene window, clear of the floating panels.
    await setCameraMode(page, "2D");
    await zoomOutCamera(page);
    await selectActiveLayer(page, "Label Data", "Vector");

    const polylineId = SEED_IDS.polyline;

    // Select the seeded polyline through the Vector inspector. The option
    // value is the display text `P{<last 6 id chars>} ...`, not the raw id;
    // selecting enters the edit state, which attaches the gizmo (Tools Copy
    // becomes enabled). selectVectorOption waits for the matching option, so
    // it also gates on the vector having loaded.
    const inspector = editorPanel(page, "Vector Objects");
    const selection = inspector.locator('input[placeholder="(New vector)"]');
    const polylineOption = await selectVectorOption(selection, polylineId);
    await expect(selection).toHaveValue(polylineOption);
    await expect(exactButton(editorPanel(page, "Tools"), "Copy")).toBeEnabled({
      timeout: 30_000,
    });
    await expect(page.locator(".hint")).toContainText("to reform");

    // Baseline projections of the three seeded vertices.
    const baseline = await projectedVertices(page, polylineId);
    // Fixture sanity: the seeded vertices are spaced evenly (5 m segments),
    // which the orthographic top-down camera renders at equal page lengths.
    expect(
      Math.abs(
        distance(baseline[0], baseline[1]) - distance(baseline[1], baseline[2]),
      ),
    ).toBeLessThanOrEqual(RESTORED_TOLERANCE_PX);

    const historySelected = selectedHistory(page);

    // --- Vertex mode: drag the middle handle; only that vertex changes ---
    await enforceTranslationModes(page, { vertex: true, vertices: false });
    // The disabled mode's plane handle is unregistered (hidden gizmo).
    await expect
      .poll(() =>
        probeTransformHandle(page, {
          layer: "vector",
          mode: "vertices",
        }),
      )
      .toBeNull();
    const vertexHandle = await projectTransformHandleWhenReady(page, {
      layer: "vector",
      mode: "vertex",
      index: 1,
    });

    const vertexDelta = { x: 55, y: 45 };
    await uncoverScenePoint(page, vertexHandle);
    await dragFromProjectedTarget(
      page,
      vertexHandle,
      translated(vertexHandle, vertexDelta),
    );

    // Vertex 1 moved by approximately the drag delta; vertices 0 and 2 are
    // untouched.
    await vertexDistanceFrom(
      page,
      polylineId,
      1,
      translated(baseline[1], vertexDelta),
    ).toBeLessThanOrEqual(MOVED_TOLERANCE_PX);
    await vertexDistanceFrom(
      page,
      polylineId,
      0,
      baseline[0],
    ).toBeLessThanOrEqual(RESTORED_TOLERANCE_PX);
    await vertexDistanceFrom(
      page,
      polylineId,
      2,
      baseline[2],
    ).toBeLessThanOrEqual(RESTORED_TOLERANCE_PX);
    // The drag checkpoint applied exactly one vector edit operation.
    await expect(historySelected).toContainText("Edit Vector Geometry");
    await expect(page.locator('[role="alert"]')).toHaveCount(0);

    // Undo restores all three vertices exactly.
    await pressEditorKey(page, "Control+z");
    for (const vertex of [0, 1, 2] as const) {
      await vertexDistanceFrom(
        page,
        polylineId,
        vertex,
        baseline[vertex],
      ).toBeLessThanOrEqual(RESTORED_TOLERANCE_PX);
    }
    await expect(historySelected).not.toContainText("Edit Vector Geometry");

    // --- Vertices mode: drag the whole-vector plane; every vertex moves ---
    await enforceTranslationModes(page, { vertex: false, vertices: true });
    // The disabled mode's vertex handles are unregistered (hidden gizmo).
    await expect
      .poll(() =>
        probeTransformHandle(page, {
          layer: "vector",
          mode: "vertex",
          index: 1,
        }),
      )
      .toBeNull();
    const planeHandle = await projectTransformHandleWhenReady(page, {
      layer: "vector",
      mode: "vertices",
    });

    const wholeDelta = { x: -45, y: 60 };
    await uncoverScenePoint(page, planeHandle);
    await dragFromProjectedTarget(
      page,
      planeHandle,
      translated(planeHandle, wholeDelta),
    );

    // All three vertices moved by approximately the SAME delta ...
    for (const vertex of [0, 1, 2] as const) {
      await vertexDistanceFrom(
        page,
        polylineId,
        vertex,
        translated(baseline[vertex], wholeDelta),
      ).toBeLessThanOrEqual(MOVED_TOLERANCE_PX);
    }
    // ... and uniformly: the shape (segment lengths) is preserved exactly.
    await expect
      .poll(async () => {
        const current = await projectedVertices(page, polylineId);
        return (
          Math.abs(
            distance(current[0], current[1]) -
              distance(baseline[0], baseline[1]),
          ) +
          Math.abs(
            distance(current[1], current[2]) -
              distance(baseline[1], baseline[2]),
          )
        );
      })
      .toBeLessThanOrEqual(2 * RESTORED_TOLERANCE_PX);
    await expect(historySelected).toContainText("Edit Vector Geometry");
    await expect(page.locator('[role="alert"]')).toHaveCount(0);

    // Undo restores the seeded geometry completely.
    await pressEditorKey(page, "Control+z");
    for (const vertex of [0, 1, 2] as const) {
      await vertexDistanceFrom(
        page,
        polylineId,
        vertex,
        baseline[vertex],
      ).toBeLessThanOrEqual(RESTORED_TOLERANCE_PX);
    }
    await expect(historySelected).not.toContainText("Edit Vector Geometry");
    // No pending labelset operations remain, so there is nothing to save.
    await expect(
      exactButton(editorPanel(page, "Project"), "Save Changes"),
    ).toBeDisabled();

    // Leave the edit state cleanly so no gizmo remains.
    await pressEditorKey(page, "Escape");
    await expect(page.locator(".hint")).toContainText(/select a vector/i);
    await expect
      .poll(() =>
        probeTransformHandle(page, {
          layer: "vector",
          mode: "vertex",
          index: 1,
        }),
      )
      .toBeNull();
    await expect
      .poll(() =>
        probeTransformHandle(page, {
          layer: "vector",
          mode: "vertices",
        }),
      )
      .toBeNull();
    await expect(page.locator('[role="alert"]')).toHaveCount(0);

    expect(errors).toEqual([]);
  });
});
