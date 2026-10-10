declare const process: { env: Record<string, string | undefined> };

import { createHash } from "node:crypto";

import {
  expect,
  type Locator,
  type Page,
  type Request,
  type Response,
} from "@playwright/test";

import { loginWith } from "../helpers/accounts";
import {
  backendUrl,
  escapeRegex,
  pluginCompositionProblem,
} from "../helpers/ui";

export const FIXTURE_PROJECT_NAME = "E2E Editor";
export const FIXTURE_TASK_NAME = "E2E Annotation";
export const FIXTURE_ANNOTATOR_USERNAME = "e2e-annotator";
export const FIXTURE_USER_PASSWORD = "password";

export interface Project {
  id: number;
  name: string;
}
export interface Task {
  id: number;
  name: string;
}
export interface Frame {
  id: number;
  task_id: number;
  source_group_id: number;
  label_branch_id: number;
  is_complete?: boolean;
}
export interface BBoxPayload {
  boxes?: unknown[];
  elements?: unknown[];
}

export interface EditorFixture {
  project: Project;
  task: Task;
  frame: Frame;
  frames: Frame[];
}

export function exactText(value: string) {
  return new RegExp(`^\\s*${escapeRegex(value)}\\s*$`);
}

export async function getAccessToken(page: Pick<Page, "request">) {
  const response = await page.request.post(`${backendUrl()}/auth/login`, {
    // Retry connection resets during fixture setup without rerunning a test
    // that may have already mutated the shared database. HTTP errors still fail.
    maxRetries: 2,
    form: {
      username: process.env.STA_E2E_ADMIN_USERNAME ?? "admin",
      password: process.env.STA_E2E_ADMIN_PASSWORD ?? "admin",
    },
  });
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { access_token: string }).access_token;
}

export async function apiGet<T>(page: Page, token: string, path: string) {
  const response = await page.request.get(`${backendUrl()}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as T;
}

export async function loadEditorFixture(page: Page): Promise<EditorFixture> {
  const token = await getAccessToken(page);
  const projects = await apiGet<Project[]>(
    page,
    token,
    `/projects/?name=${encodeURIComponent(FIXTURE_PROJECT_NAME)}`,
  );
  expect(
    projects,
    `missing fixture project ${FIXTURE_PROJECT_NAME}`,
  ).toHaveLength(1);

  const project = projects[0];
  const tasks = await apiGet<Task[]>(
    page,
    token,
    `/tasks/?project_id=${project.id}&name=${encodeURIComponent(FIXTURE_TASK_NAME)}`,
  );
  expect(tasks, `missing fixture task ${FIXTURE_TASK_NAME}`).toHaveLength(1);

  const task = tasks[0];
  // Sort by min_timestamp: index-based picks like `frames[2]` rely on
  // `frames[i]` being the frame at t_i (the seeds are timestamped against
  // t_i). The listing's default order is a stable spatiotemporal one, but
  // pinning the sort keeps this invariant explicit and independent of the
  // endpoint default.
  const frames = await apiGet<Frame[]>(
    page,
    token,
    `/frames/?task_id=${task.id}&work_type=annotate&limit=10&sort_by=min_timestamp&sort_dir=asc`,
  );
  expect(
    frames.length,
    "fixture task should have annotate frames",
  ).toBeGreaterThan(0);

  return { project, task, frame: frames[0], frames };
}

/**
 * Replicates `stable_uuid_int` in `tests/frontend/serve_e2e_fixture.py`:
 * `uuid5(NAMESPACE_URL, "e2e-fixture:" + parts.join(':'))`. The fixture
 * seeds its pointer-target labels with these deterministic ids, so specs can
 * address a seed directly instead of discovering it by parsing bulk payloads
 * captured during navigation (which is load/order sensitive).
 */
export function seededLabelId(...parts: (string | number)[]): string {
  const namespaceUrl = Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex");
  const digest = createHash("sha1")
    .update(namespaceUrl)
    .update(`e2e-fixture:${parts.join(":")}`, "utf8")
    .digest();
  digest[6] = (digest[6] & 0x0f) | 0x50; // version 5
  digest[8] = (digest[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = digest.toString("hex", 0, 16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/** The fixture's seeded pointer-target label ids (see seededLabelId). */
export const SEED_IDS = {
  transformTrack: seededLabelId("e2e-bbox-track", "transform"),
  transformBox: seededLabelId("e2e-bbox-box", "transform"),
  earlierTrack: seededLabelId("e2e-bbox-track", "earlier"),
  earlierBox: seededLabelId("e2e-bbox-box", "earlier"),
  laterTrack: seededLabelId("e2e-bbox-track", "later"),
  laterBox: seededLabelId("e2e-bbox-box", "later"),
  polyline: seededLabelId("e2e-vector-polyline"),
  selection: seededLabelId("e2e-seg-selection"),
} as const;

/** The label group id and branch head hash of the fixture task's label branch. */
export interface LabelBranchKeys {
  groupId: number;
  commitHash: string;
}

export async function readLabelBranchKeys(
  page: Page,
  taskId: number,
): Promise<LabelBranchKeys> {
  const token = await getAccessToken(page);
  const branches = await apiGet<
    { group_id: number; head_hash?: string; head?: { hash: string } }[]
  >(
    page,
    token,
    `/editor/task/label/branches?task_id=${taskId}&work_type=annotate`,
  );
  expect(
    branches,
    "the fixture task should have exactly one label branch",
  ).toHaveLength(1);
  const branch = branches[0];
  const commitHash = branch.head_hash ?? branch.head?.hash;
  expect(
    commitHash,
    "the fixture label branch should expose its head commit hash",
  ).toBeTruthy();
  return { groupId: branch.group_id, commitHash: commitHash! };
}

/** A bbox element record as returned by `/label/data/bbox/element/`. */
export interface BBoxElementRecord {
  id: string;
  centerX: number;
  centerY: number;
  centerZ: number;
  angle: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  timestamp: string | null;
  entityId: string | null;
}

/**
 * Reads the seeded bbox element records by their deterministic ids through
 * the single-element API, the deterministic alternative to discovering
 * seeds in bulk payloads captured during navigation. The list endpoint's
 * `ids` filter is not usable (FastAPI rejects a repeated `ids` query param
 * as a malformed frozenset), so each record is fetched by path id.
 */
export async function readSeededBoxes(
  page: Page,
  branchKeys: LabelBranchKeys,
  ids: readonly string[],
): Promise<BBoxElementRecord[]> {
  const token = await getAccessToken(page);
  const records = await Promise.all(
    ids.map((id) =>
      apiGet<Record<string, unknown>>(
        page,
        token,
        `/label/data/bbox/element/${encodeURIComponent(id)}` +
          `?group_id=${branchKeys.groupId}&commit_hash=${encodeURIComponent(branchKeys.commitHash)}`,
      ),
    ),
  );
  return records.map((record) => ({
    id: String(record.id),
    centerX: Number(record.center_x),
    centerY: Number(record.center_y),
    centerZ: Number(record.center_z),
    angle: Number(record.angle),
    sizeX: Number(record.size_x),
    sizeY: Number(record.size_y),
    sizeZ: Number(record.size_z),
    timestamp: record.timestamp as string | null,
    entityId: record.entity_id == null ? null : String(record.entity_id),
  }));
}

export function isEditorDataResponse(
  response: Response,
  path: string,
  key: string,
) {
  if (response.request().method() !== "POST") return false;

  const url = new URL(response.url());
  // Requests may go directly to the backend (`/editor/...`) or through the
  // frontend proxy (`/api/backend/editor/...`) depending on the E2E server
  // configuration. Match the stable backend path suffix in either case.
  return url.pathname.endsWith(path) && url.searchParams.get("key") === key;
}

/**
 * Tests whether a response is an editor bulk data response whose requested
 * frames include `frameId`.
 *
 * On navigation the editor first bulk-loads the task's default frame and
 * only then the frame requested through the URL, so a plain
 * {@link isEditorDataResponse} wait resolves to the default frame's (stale,
 * seedless) payload; matching the `frame_ids` query parameter selects the
 * payload of the frame the test actually opened.
 */
export function isEditorDataResponseForFrame(
  response: Response,
  path: string,
  key: string,
  frameId: number,
) {
  if (!isEditorDataResponse(response, path, key)) return false;

  const url = new URL(response.url());
  return url.searchParams.getAll("frame_ids").includes(String(frameId));
}

export async function expectPointCloudResponse(response: Response) {
  expect(response.ok()).toBe(true);
  const numPoints = Number(response.headers()["x-num-points"] ?? 0);
  const numChannels = Number(response.headers()["x-num-channels"] ?? 0);
  expect(numPoints).toBeGreaterThan(0);
  expect(numChannels).toBeGreaterThanOrEqual(4);
}

export async function expectBBoxResponse(response: Response) {
  expect(response.ok()).toBe(true);
  const payloads = (await response.json()) as BBoxPayload[];
  expect(payloads).not.toHaveLength(0);
  const boxes = payloads.flatMap(
    (payload) => payload.boxes ?? payload.elements ?? [],
  );
  expect(boxes.length).toBeGreaterThan(0);
}

/**
 * How long the editor may take to ask for its frame data.
 *
 * The window opens when {@link waitForEditorDataLoad} is registered, which
 * every caller does before navigating; a healthy load issues its first bulk
 * request seconds after the page mounts.
 */
const DATA_REQUEST_BUDGET_MS = 60_000;

/**
 * Whether a request is one of the editor's bulk data loads.
 *
 * Both endpoints belong to a plugin-contributed layer and neither to core, so
 * the absence of any such request says the page was served no layers.
 */
function isEditorDataRequest(request: Request) {
  if (request.method() !== "POST") return false;

  const { pathname } = new URL(request.url());
  return (
    pathname.endsWith("/editor/source/data/bulk") ||
    pathname.endsWith("/editor/label/data/bulk")
  );
}

/**
 * Turns "the editor never asked for its data" into a named cause.
 *
 * Every editor layer comes from a registered plugin, and a layer is what issues
 * the bulk data request, so no request at all means the page was served a
 * composition with no layers. The load otherwise hangs indistinguishably from a
 * slow one until the test timeout ends it, and one re-pointed file then reads as
 * the whole editor suite failing independently.
 */
async function noDataRequestMessage(page: Page) {
  const problem = await pluginCompositionProblem(page);

  return (
    `The editor issued no bulk data request within ` +
    `${DATA_REQUEST_BUDGET_MS / 1000}s, so no editor layer is registered.\n\n` +
    (problem ??
      "The served composition does register plugins, so this load stalled for " +
        "some other reason: read the page errors and the trace.")
  );
}

export async function waitForEditorDataLoad(page: Page) {
  // Registered before the caller navigates, alongside the response waits below.
  // A response wait cannot tell a load that will never start from one that is
  // merely slow, and without this the only thing that notices is the timeout.
  const dataRequested = page.waitForRequest(isEditorDataRequest, {
    timeout: DATA_REQUEST_BUDGET_MS,
  });
  const pointCloudResponse = page.waitForResponse((response) =>
    isEditorDataResponse(response, "/editor/source/data/bulk", "pcd"),
  );
  const bboxResponse = page.waitForResponse((response) =>
    isEditorDataResponse(response, "/editor/label/data/bulk", "bbox"),
  );
  const vectorResponse = page.waitForResponse((response) =>
    isEditorDataResponse(response, "/editor/label/data/bulk", "vector"),
  );
  const segmentationResponse = page.waitForResponse((response) =>
    isEditorDataResponse(response, "/editor/label/data/bulk", "segmentation"),
  );
  const groundMeshResponse = page.waitForResponse((response) =>
    isEditorDataResponse(response, "/editor/source/data/bulk", "gmesh"),
  );

  try {
    await dataRequested;
  } catch (error) {
    // Only an expired budget says something about the composition. A page that
    // closed or a test that was aborted is its own truth, and mislabelling it
    // here would send the reader looking at the wrong file.
    if ((error as Error).name !== "TimeoutError") throw error;
    throw new Error(await noDataRequestMessage(page), { cause: error });
  }

  await expectPointCloudResponse(await pointCloudResponse);
  await expectBBoxResponse(await bboxResponse);
  for (const response of await Promise.all([
    vectorResponse,
    segmentationResponse,
    groundMeshResponse,
  ]))
    expect(response.ok()).toBe(true);
}

export async function openEditor(page: Page, frame?: Frame) {
  const fixture = await loadEditorFixture(page);
  const selectedFrame = frame ?? fixture.frame;
  const dataLoad = waitForEditorDataLoad(page);

  await loginWith(page, FIXTURE_ANNOTATOR_USERNAME, FIXTURE_USER_PASSWORD);
  await page.goto(
    `/projects/${fixture.project.id}/annotate?task_id=${fixture.task.id}&frame_id=${selectedFrame.id}`,
  );
  await expect(
    page.locator(
      '[data-test="editor-display"] canvas, #display-container canvas',
    ),
  ).toBeVisible({ timeout: 60_000 });
  await dataLoad;

  return { ...fixture, frame: selectedFrame };
}

/** Mirrors the editor's `toDataTestSlug`; keep in sync with the frontend. */
function toDataTestSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function editorPanel(page: Page, title: string) {
  const slug = toDataTestSlug(title);
  const byTestId = page.locator(`[data-test="editor-panel-${slug}"]`);
  return byTestId
    .or(
      page.locator(".draggable-panel").filter({
        has: page
          .locator(".header label")
          .filter({ hasText: exactText(title) }),
      }),
    )
    .first();
}

export async function selectConfiguredLayer(
  page: Page,
  panelTitle: string,
  layerName: string,
) {
  const panel = editorPanel(page, panelTitle);
  await expect(panel).toBeVisible();
  await exactButton(panel, "Layer").click();
  await expect(panel).toContainText(layerName);
  return panel;
}

/**
 * Sets the main scene window's camera mode through the Preferences
 * "View Mode" radio grid and waits for the scene to settle on it.
 *
 * The gizmo pointer-routing scenarios require the orthographic top-down
 * (`'2D'`) view: in that view the ground/translation plane is perpendicular
 * to the view direction, rotation rings project as true circles (so a
 * screen-space tangential drag is a true tangential drag), and page-space
 * gesture deltas map 1:1 onto the scene's horizontal plane. In the tilted
 * `'3D'` perspective view these gestures are ambiguous, and a gesture that
 * misses a handle falls through to orbiting the camera instead.
 */
export async function setCameraMode(page: Page, mode: "2D" | "3D") {
  const prefs = editorPanel(page, "Preferences");
  await expect(prefs).toBeVisible();
  const radio = prefs.getByRole("radio", { name: exactText(mode) });
  await expect(radio).toBeEnabled();
  await radio.evaluate((element: HTMLInputElement) => element.click());
  await expect(radio).toBeChecked();
  // Let the camera switch and the re-render settle before projecting targets.
  await page.waitForTimeout(300);
}

/**
 * Zooms the main camera out about the scene center by wheeling `ticks` times.
 * The seeded pointer targets sit toward the edge of the frame, and their
 * gizmo handles (rotate ring, scale vertices, whole-vector plane) extend
 * beyond the label itself; zooming out keeps the handles inside the scene
 * window and clear of the floating panels so real pointer gestures can reach
 * them. Wheel events are delivered at the scene center so the camera's
 * OrbitControls (not a floating panel) receives them.
 */
export async function zoomOutCamera(page: Page, ticks = 5) {
  const rect = await page.locator("#main-window").boundingBox();
  expect(rect, "the main scene window should have bounds").not.toBeNull();
  await page.mouse.move(
    rect!.x + rect!.width * 0.5,
    rect!.y + rect!.height * 0.5,
  );
  for (let i = 0; i < ticks; i += 1) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(300);
}

/**
 * Pans the (2D orthographic) camera so the point returned by `project` moves
 * to the center of the main window, via right-drags. For an orthographic
 * camera the pan is 1:1 with the drag distance in screen pixels, so a drag
 * of `d` pixels shifts the scene content by `d` pixels.
 *
 * The target can start far outside the canvas (the fixture anchor is not
 * guaranteed to sit in the default camera framing), so every drag starts at
 * the window center and ends at a clamped interior point: a gesture that
 * begins outside the canvas never reaches the camera controls. Re-projecting
 * between drags makes the loop converge regardless of the starting offset.
 */
export async function centerCameraOnPoint(
  page: Page,
  project: () => Promise<{ x: number; y: number }>,
) {
  const rect = await page.locator("#main-window").boundingBox();
  expect(rect, "the main scene window should have bounds").not.toBeNull();
  const centerX = rect!.x + rect!.width * 0.5;
  const centerY = rect!.y + rect!.height * 0.5;
  const margin = 60;
  const clamp = (value: number, lo: number, hi: number) =>
    Math.min(Math.max(value, lo), hi);

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const point = await project();
    const dx = centerX - point.x;
    const dy = centerY - point.y;
    if (Math.abs(dx) <= 8 && Math.abs(dy) <= 8) return;

    const endX = clamp(
      centerX + dx,
      rect!.x + margin,
      rect!.x + rect!.width - margin,
    );
    const endY = clamp(
      centerY + dy,
      rect!.y + margin,
      rect!.y + rect!.height - margin,
    );
    await page.mouse.move(centerX, centerY);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(endX, endY, { steps: 10 });
    await page.mouse.up({ button: "right" });
    await page.waitForTimeout(250);
  }

  const point = await project();
  expect(
    Math.abs(centerX - point.x) <= 8 && Math.abs(centerY - point.y) <= 8,
    "the camera should be re-centered on the projected point",
  ).toBe(true);
}

export async function selectActiveLayer(
  page: Page,
  tabName: "Source Data" | "Label Data",
  layerName: string,
) {
  const layers = editorPanel(page, "Layers");
  await expect(layers).toBeVisible();
  await layers.getByText(tabName, { exact: true }).click();

  const slug = toDataTestSlug(layerName);
  const row = layers
    .locator(`[data-test="editor-layer-row-${slug}"]`)
    .or(layers.locator(".layer-menu-table-row").filter({ hasText: layerName }))
    .first();
  const rowName = row
    .locator('[data-test="editor-layer-name"], .layer-name')
    .filter({ hasText: exactText(layerName) });

  await expect(rowName).toBeVisible();
  await rowName.click();
  await expect(rowName).toHaveClass(/active/);

  return row;
}

export function paneRow(scope: Locator, label: string | RegExp) {
  return scope.locator(".tp-lblv").filter({ hasText: label }).first();
}

export function checkboxControl(scope: Locator, label: string | RegExp) {
  return paneRow(scope, label).locator('input[type="checkbox"]').first();
}

export function inputControl(scope: Locator, label: string | RegExp) {
  return paneRow(scope, label).locator("input").first();
}

export function selectControl(scope: Locator, label: string | RegExp) {
  return paneRow(scope, label).locator("select").first();
}

export async function setSelectByLabel(select: Locator, label: string) {
  await expect(select).toBeEnabled();
  await select.selectOption({ label }, { force: true });
  const optionValue = await select.evaluate(
    (element: HTMLSelectElement, optionLabel: string) => {
      const option = [...element.options].find(
        (candidate) => candidate.label === optionLabel,
      );
      if (option == null)
        throw new Error(`Missing select option: ${optionLabel}`);
      return option.value;
    },
    label,
  );
  await expect(select).toHaveValue(optionValue);
}

export async function fillNumberInput(input: Locator, value: string) {
  await expect(input).toBeEnabled();
  await input.fill(value);
  await input.press("Enter");
  await expect(input).toHaveValue(new RegExp(escapeRegex(value)));
}

export function exactButton(scope: Locator, label: string) {
  const name = exactText(label);
  return scope
    .getByRole("button", { name })
    .or(scope.getByRole("tab", { name }))
    .first();
}

export async function clickElement(locator: Locator) {
  await expect(locator).toBeEnabled();
  await locator.evaluate((element: HTMLElement) => element.click());
}

/**
 * Expands a collapsible section of the Project panel if it is collapsed.
 *
 * `title` is the section's header label (for example `Playback` or `Frames`),
 * not one of the panel's top-level tabs (Task / Scene / Frame). These sections
 * are expanded by default, so clicking a header unconditionally would toggle an
 * already-open section closed. This only clicks when the given control is not
 * yet visible, then waits for it to be visible.
 *
 * @param project The Project panel.
 * @param title The header label of the section to expand, e.g. `Playback`.
 * @param visibleControl A control inside the section, used to detect whether it
 * is already visible.
 */
export async function openProjectPanelSection(
  project: ReturnType<typeof editorPanel>,
  title: string,
  visibleControl: ReturnType<typeof inputControl>,
) {
  if (!(await visibleControl.isVisible()))
    await clickElement(exactButton(project, title));
  await expect(visibleControl).toBeVisible();
}

export async function setCheckboxInput(checkbox: Locator, checked: boolean) {
  await expect(checkbox).toBeEnabled();
  if ((await checkbox.isChecked()) !== checked) {
    await clickElement(checkbox);
  }
  if (checked) {
    await expect(checkbox).toBeChecked();
  } else {
    await expect(checkbox).not.toBeChecked();
  }
}

export async function setCheckbox(
  scope: Locator,
  label: string | RegExp,
  checked: boolean,
) {
  await setCheckboxInput(checkboxControl(scope, label), checked);
}

export async function waitForPointCloudReload(
  page: Page,
  removeBg: boolean,
  cropArea: boolean,
) {
  const response = await page.waitForResponse((candidate) => {
    if (!isEditorDataResponse(candidate, "/editor/source/data/bulk", "pcd"))
      return false;
    const postData = candidate.request().postData() ?? "";
    return (
      postData.includes(`"remove_bg":${removeBg}`) &&
      postData.includes(`"crop_area":${cropArea}`)
    );
  });
  await expectPointCloudResponse(response);
}

export async function isButtonSelected(button: Locator) {
  return button.evaluate(
    (element) =>
      element.classList.contains("tp-selectbtnv_b-selected") ||
      element.getAttribute("aria-pressed") === "true" ||
      element.getAttribute("aria-selected") === "true",
  );
}

export async function expectButtonSelected(scope: Locator, label: string) {
  await expect
    .poll(async () => isButtonSelected(exactButton(scope, label)))
    .toBe(true);
}

export function currentFrameIdInput(page: Page) {
  return inputControl(editorPanel(page, "Project"), "Current Frame ID");
}

export async function readCurrentFrameId(page: Page) {
  const value = await currentFrameIdInput(page).inputValue();
  const parsed = Number(value);
  expect(
    Number.isNaN(parsed),
    `invalid current frame id input value: ${value}`,
  ).toBe(false);
  return parsed;
}

export function framePathRow(page: Page, frameId: number) {
  return page
    .locator(`[data-test="editor-frame-row"][data-frame-id="${frameId}"]`)
    .or(
      editorPanel(page, "Project")
        .locator(".frame-path .scrolllist-item")
        .filter({ hasText: `[F{${frameId}}` }),
    )
    .first();
}

export async function expectCurrentFrame(page: Page, frameId: number) {
  await expect(currentFrameIdInput(page)).toHaveValue(String(frameId));
  await expect(framePathRow(page, frameId)).toHaveClass(/selected/);
}

/** Returns an unoccluded point inside the main scene window. */
export async function scenePoint(page: Page, fx = 0.5, fy = 0.5) {
  const mainWindow = page.locator("#main-window");
  await expect(mainWindow).toBeVisible();
  const bounds = await mainWindow.boundingBox();
  expect(bounds, "the main scene window should have bounds").not.toBeNull();

  const offsets: [number, number][] = [
    [0, 0],
    [-0.1, -0.1],
    [0.1, 0.1],
    [-0.15, 0.1],
    [0.15, -0.1],
  ];
  const point = await page.evaluate(
    ([rect, targetX, targetY, candidates]) => {
      const isOnScene = (x: number, y: number) => {
        let element: Element | null = document.elementFromPoint(x, y);
        while (element != null) {
          if (element.id === "main-window") return true;
          element = element.parentElement;
        }
        return false;
      };

      for (const [dx, dy] of candidates) {
        const x =
          rect.x + rect.width * Math.min(0.9, Math.max(0.1, targetX + dx));
        const y =
          rect.y + rect.height * Math.min(0.9, Math.max(0.1, targetY + dy));
        if (isOnScene(x, y)) return { x, y };
      }
      return null;
    },
    [bounds!, fx, fy, offsets] as const,
  );

  expect(
    point,
    "the requested scene area should have an unoccluded point",
  ).not.toBeNull();
  return point!;
}

/**
 * Clears `target`'s probe point of any overlapping draggable panel so a real
 * pointer gesture (hover/drag) can reach it.
 *
 * The default editor layout stacks draggable panels over the display and over
 * each other, so the topmost element at many targets is another panel and
 * `locator.hover()` is intercepted. Occluding panels are collapsed (shrinking
 * them to their header bar, which is deterministic unlike guessing a drag
 * distance) or dragged clear if already collapsed.
 */
export async function uncoverTarget(
  page: Page,
  target: Locator,
  fx = 0.5,
  fy = 0.5,
) {
  await target.evaluate((element) =>
    element.setAttribute("data-uncover-target", ""),
  );
  try {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const box = await target.boundingBox();
      expect(box, "the uncover target should have bounds").not.toBeNull();
      const x = box!.x + box!.width * fx;
      const y = box!.y + box!.height * fy;

      const occludedByPanel = await page.evaluate(
        ([px, py]) => {
          const top = document.elementFromPoint(px, py);
          if (top == null) return false;
          if (top.closest("[data-uncover-target]") != null) return false;
          const panel = top.closest(".draggable-panel");
          if (panel == null) return false;
          panel.setAttribute("data-occluder", "");
          return true;
        },
        [x, y] as const,
      );
      if (!occludedByPanel) return;

      const occluder = page.locator(".draggable-panel[data-occluder]").first();
      const alreadyCollapsed = await occluder.evaluate((element) =>
        element.classList.contains("collapsed"),
      );
      if (!alreadyCollapsed) {
        await occluder
          .locator(".header label")
          .last()
          .dispatchEvent("pointerdown");
        await expect(occluder).toHaveClass(/collapsed/);
      } else {
        const occluderBox = await occluder.boundingBox();
        expect(
          occluderBox,
          "the occluding panel should have bounds",
        ).not.toBeNull();
        await occluder.locator(".header label").first().hover();
        await page.mouse.down();
        await page.mouse.move(occluderBox!.x + 900, occluderBox!.y + 480, {
          steps: 8,
        });
        await page.mouse.up();
      }
      await occluder.evaluate((element) =>
        element.removeAttribute("data-occluder"),
      );
    }
    throw new Error("draggable panels still occlude the uncover target");
  } finally {
    await target
      .evaluate((element) => element.removeAttribute("data-uncover-target"))
      .catch(() => undefined);
  }
}

/**
 * Clears any draggable panel occluding a projected scene point (a variant of
 * {@link uncoverTarget} for probe-projected points, which have no locator of
 * their own). Occluding panels are collapsed, or dragged clear if already
 * collapsed, so a real pointer gesture can reach the scene at the point.
 */
export async function uncoverScenePoint(
  page: Page,
  point: { x: number; y: number },
) {
  const mainWindow = page.locator("#main-window");
  await mainWindow.evaluate((element) =>
    element.setAttribute("data-uncover-target", ""),
  );
  try {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const occludedByPanel = await page.evaluate(
        ([px, py]) => {
          const top = document.elementFromPoint(px, py);
          if (top == null) return false;
          if (top.closest("[data-uncover-target]") != null) return false;
          const panel = top.closest(".draggable-panel");
          if (panel == null) return false;
          panel.setAttribute("data-occluder", "");
          return true;
        },
        [point.x, point.y] as const,
      );
      if (!occludedByPanel) return;

      const occluder = page.locator(".draggable-panel[data-occluder]").first();
      const alreadyCollapsed = await occluder.evaluate((element) =>
        element.classList.contains("collapsed"),
      );
      if (!alreadyCollapsed) {
        await occluder
          .locator(".header label")
          .last()
          .dispatchEvent("pointerdown");
        await expect(occluder).toHaveClass(/collapsed/);
      } else {
        const occluderBox = await occluder.boundingBox();
        expect(
          occluderBox,
          "the occluding panel should have bounds",
        ).not.toBeNull();
        await occluder.locator(".header label").first().hover();
        await page.mouse.down();
        await page.mouse.move(occluderBox!.x + 900, occluderBox!.y + 480, {
          steps: 8,
        });
        await page.mouse.up();
      }
      await occluder.evaluate((element) =>
        element.removeAttribute("data-occluder"),
      );
    }
    throw new Error("draggable panels still occlude the projected scene point");
  } finally {
    await mainWindow
      .evaluate((element) => element.removeAttribute("data-uncover-target"))
      .catch(() => undefined);
  }
}

/** A point in viewport coordinates (CSS pixels relative to the viewport origin), usable by `page.mouse`. */
export interface EditorProbePoint {
  x: number;
  y: number;
}

/** A contributor-defined label target the editor e2e probe can project. */
export interface EditorProbeLabelTarget {
  layer: string;
  id: string;
  index?: number;
}

/** A contributor-defined active-selection handle the e2e probe can project. */
export interface EditorProbeTransformTarget {
  layer: string;
  mode: string;
  index?: number;
}

/** A label layer whose interaction state the editor e2e probe can inspect. */
export interface EditorProbeLayerTarget {
  layer: string;
}

/** Candidate count and closest hit id of a probe selector raycast. */
export interface EditorProbeRaycastResult {
  count: number;
  hitId: string | null;
}

/**
 * The read-only projection probe the editor runtime exposes on
 * `window.__STA_E2E_PROBE__` when it runs with `VITE_STA_E2E_PROBE` set —
 * which only `playwright.with-data.config.ts` does. Mirrors
 * `core/frontend/app/routes/editor/e2eProbe.ts`; keep in sync.
 */
interface EditorProbeApi {
  getRenderState(): { generation: number; pending: boolean };
  projectLabelPoint(target: EditorProbeLabelTarget): EditorProbePoint | null;
  projectTransformHandle(
    target: EditorProbeTransformTarget,
  ): EditorProbePoint | null;
  projectWorldPoint(dbPoint: {
    x: number;
    y: number;
    z: number;
  }): EditorProbePoint;
  getHoveredLabel(target: EditorProbeLayerTarget): string | null;
  raycastSelector(
    target: EditorProbeLayerTarget,
    pagePoint: EditorProbePoint,
  ): EditorProbeRaycastResult | null;
  getSelectorState(
    target: EditorProbeLayerTarget,
  ): EditorProbeSelectorState | null;
}

/** Reads the demand renderer's current test-only generation and pending state. */
export async function getEditorRenderState(page: Page) {
  await page.waitForFunction(
    () => window.__STA_E2E_PROBE__ != null,
    undefined,
    { timeout: 30_000 },
  );
  return page.evaluate(() => window.__STA_E2E_PROBE__!.getRenderState());
}

/** Waits until a frame newer than `generation` has painted and the scheduler is idle. */
export async function waitForEditorRenderAfter(page: Page, generation: number) {
  await page.waitForFunction(
    (previous) => {
      const state = window.__STA_E2E_PROBE__?.getRenderState();
      return state != null && state.generation > previous && !state.pending;
    },
    generation,
    { timeout: 30_000 },
  );
  return getEditorRenderState(page);
}

/**
 * Waits until the demand renderer has stayed idle across several browser
 * animation frames.
 *
 * A form event can queue one render immediately and then cause React effects
 * to queue another after committing the updated layer settings. Observing a
 * single non-pending state between those frames is therefore not sufficient
 * for a pixel snapshot.
 */
export async function waitForEditorRenderSettled(page: Page) {
  const deadline = Date.now() + 30_000;
  let previousGeneration: number | null = null;
  let idleFrames = 0;

  while (Date.now() < deadline) {
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        }),
    );
    const state = await getEditorRenderState(page);

    if (!state.pending && state.generation === previousGeneration) {
      idleFrames += 1;
      if (idleFrames >= 3) return state;
    } else {
      previousGeneration = state.generation;
      idleFrames = state.pending ? 0 : 1;
    }
  }

  throw new Error("the editor renderer did not settle within 30 seconds");
}

declare global {
  interface Window {
    __STA_E2E_PROBE__?: EditorProbeApi;
  }
}

const MISSING_PROBE_MESSAGE =
  "editor e2e probe is missing on window.__STA_E2E_PROBE__ — " +
  "is the frontend being served by playwright.with-data.config.ts with VITE_STA_E2E_PROBE?";

/**
 * Projects a contributor-defined label target into viewport coordinates.
 * Fails when the probe or target is unavailable in the live scene.
 */
export async function projectLabelPoint(
  page: Page,
  target: EditorProbeLabelTarget,
): Promise<EditorProbePoint> {
  const point = await page.evaluate(
    (probeTarget) =>
      window.__STA_E2E_PROBE__?.projectLabelPoint(probeTarget) ?? null,
    target,
  );
  expect(
    point,
    `${MISSING_PROBE_MESSAGE} Could not project label target ${JSON.stringify(target)}.`,
  ).not.toBeNull();
  return point!;
}

/**
 * Projects a contributor-defined active-selection handle into viewport
 * coordinates. Fails when the probe or handle is unavailable.
 */
export async function projectTransformHandle(
  page: Page,
  target: EditorProbeTransformTarget,
): Promise<EditorProbePoint> {
  const point = await page.evaluate(
    (probeTarget) =>
      window.__STA_E2E_PROBE__?.projectTransformHandle(probeTarget) ?? null,
    target,
  );
  expect(
    point,
    `${MISSING_PROBE_MESSAGE} Could not project transform handle ${JSON.stringify(target)}.`,
  ).not.toBeNull();
  return point!;
}

/**
 * Converts a database-space point to world coordinates and projects it
 * into viewport coordinates through the editor e2e probe.
 *
 * Fails the test with a descriptive message if the probe is missing
 * (config error).
 */
export async function projectWorldPoint(
  page: Page,
  dbPoint: { x: number; y: number; z: number },
): Promise<EditorProbePoint> {
  const point = await page.evaluate((probePoint) => {
    const probe = window.__STA_E2E_PROBE__;
    return probe == null ? null : probe.projectWorldPoint(probePoint);
  }, dbPoint);
  expect(point, MISSING_PROBE_MESSAGE).not.toBeNull();
  return point!;
}

/**
 * Reads the id of the label the layer's selector currently reports as
 * hovered, or `null` when nothing is hovered. Fails the test with a
 * descriptive message if the probe is missing (config error). Unlike the
 * `project*` helpers this returns `null` freely: absence of a hovered
 * label is a meaningful state, not an error.
 */
export async function probeHoveredLabel(
  page: Page,
  target: EditorProbeLayerTarget,
): Promise<string | null> {
  const probePresent = await page.evaluate(
    () => window.__STA_E2E_PROBE__ != null,
  );
  expect(probePresent, MISSING_PROBE_MESSAGE).toBe(true);
  return page.evaluate(
    (probeTarget) => window.__STA_E2E_PROBE__!.getHoveredLabel(probeTarget),
    target,
  );
}

/**
 * Raycasts the layer's selector with the exact ray a real pointer at
 * `point` would produce (diagnostic: separates "ray misses / empty group"
 * from "pointer events never reached the selector"). Fails the test with a
 * descriptive message if the probe is missing (config error).
 */
export async function probeSelectorRaycast(
  page: Page,
  target: EditorProbeLayerTarget,
  point: EditorProbePoint,
): Promise<EditorProbeRaycastResult> {
  const result = await page.evaluate(
    ([probeTarget, probePoint]) =>
      window.__STA_E2E_PROBE__?.raycastSelector(probeTarget, probePoint) ??
      null,
    [target, point] as const,
  );
  expect(
    result,
    `${MISSING_PROBE_MESSAGE} Could not raycast selector for ${JSON.stringify(target)}.`,
  ).not.toBeNull();
  return result!;
}

/** The layer's live selector hover state, as reported by the probe. */
export interface EditorProbeSelectorState {
  hoverEnabled: boolean;
  ray: {
    origin: { x: number; y: number; z: number };
    direction: { x: number; y: number; z: number };
  };
}

/**
 * Reads the layer selector's live hover-enabled flag and current raycaster
 * ray (diagnostic: a stale ray proves pointer events never reached the
 * selector; `hoverEnabled: false` proves they were ignored). Fails the test
 * with a descriptive message if the probe is missing (config error).
 */
export async function probeSelectorState(
  page: Page,
  target: EditorProbeLayerTarget,
): Promise<EditorProbeSelectorState> {
  const result = await page.evaluate(
    (probeTarget) =>
      window.__STA_E2E_PROBE__?.getSelectorState(probeTarget) ?? null,
    target,
  );
  expect(
    result,
    `${MISSING_PROBE_MESSAGE} Could not read selector state for ${JSON.stringify(target)}.`,
  ).not.toBeNull();
  return result!;
}

/**
 * Performs a real mouse gesture from `from` to `to` (both viewport-space
 * points, e.g. from the `project*` helpers): move, press, drag in
 * intermediate steps, release. Unlike locator-based actions, this is the
 * genuine pointer event sequence the editor's scene pointer handling
 * observes.
 */
export async function dragFromProjectedTarget(
  page: Page,
  from: EditorProbePoint,
  to: EditorProbePoint,
  options?: { steps?: number },
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: options?.steps ?? 12 });
  await page.mouse.up();
}
