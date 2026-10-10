import { expect, test, type Page } from "@playwright/test";

import {
  clickElement,
  editorPanel,
  exactButton,
  fillNumberInput,
  inputControl,
  openEditor,
  readCurrentFrameId,
} from "./editor-helpers";

// Every test in this file persists frame-status mutations to the shared
// fixture database (restoring them at the end), so a retry could start from a
// mid-mutation state; keep them retry-free even though the suite retries.
test.describe.configure({ retries: 0 });

async function pressEditorKey(page: Page, key: string) {
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  await page.keyboard.press(key);
}

async function selectFrameStatus(
  page: Page,
  status: "Complete" | "Incomplete",
) {
  const project = editorPanel(page, "Project");
  await clickElement(exactButton(project, "Frame"));
  const radio = project.getByRole("radio", { name: status, exact: true });
  await expect(radio).toBeEnabled();

  const response = page.waitForResponse((candidate) => {
    const url = new URL(candidate.url());
    return (
      candidate.request().method() === "POST" &&
      url.pathname.endsWith("/editor/frame/is_complete") &&
      url.searchParams.get("is_complete") ===
        String(status === "Complete").toLowerCase()
    );
  });
  await radio.evaluate((element: HTMLInputElement) => element.click());
  expect((await response).ok()).toBe(true);
  await expect(radio).toBeChecked();
}

test("Incomplete/Complete frame status persists across page reloads", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const fixture = await openEditor(page);
  const initialStatus = fixture.frame.is_complete ? "Complete" : "Incomplete";
  const changedStatus =
    initialStatus === "Complete" ? "Incomplete" : "Complete";

  await selectFrameStatus(page, changedStatus);
  await page.reload();
  await expect(page.locator("#main-window")).toBeVisible({ timeout: 60_000 });
  await clickElement(exactButton(editorPanel(page, "Project"), "Frame"));
  await expect(
    editorPanel(page, "Project").getByRole("radio", {
      name: changedStatus,
      exact: true,
    }),
  ).toBeChecked();

  // Restore the fixture so this persistence test is order-independent.
  await selectFrameStatus(page, initialStatus);
  await page.reload();
  await expect(page.locator("#main-window")).toBeVisible({ timeout: 60_000 });
  await clickElement(exactButton(editorPanel(page, "Project"), "Frame"));
  await expect(
    editorPanel(page, "Project").getByRole("radio", {
      name: initialStatus,
      exact: true,
    }),
  ).toBeChecked();
});

test("Frame Progress content updates when the current frame status changes", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const fixture = await openEditor(page);
  const project = editorPanel(page, "Project");
  await clickElement(exactButton(project, "Task"));
  const progress = inputControl(project, "Frame Progress");
  const before = await progress.inputValue();
  const initialStatus = fixture.frame.is_complete ? "Complete" : "Incomplete";
  const changedStatus =
    initialStatus === "Complete" ? "Incomplete" : "Complete";
  await selectFrameStatus(page, changedStatus);
  await clickElement(exactButton(project, "Task"));
  await expect(progress).not.toHaveValue(before);
  expect(await progress.inputValue()).toMatch(/^\d+\/\d+ \(.+%\) completed$/);

  await selectFrameStatus(page, initialStatus);
  await clickElement(exactButton(project, "Task"));
  await expect(progress).toHaveValue(before);
});

test("Shift+C and Shift+Z cycle status while navigating and preserve the changes", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const fixture = await openEditor(page);
  expect(fixture.frames.length).toBeGreaterThan(1);
  const project = editorPanel(page, "Project");
  await clickElement(exactButton(project, "Scene"));
  await fillNumberInput(inputControl(project, "Stride"), "1");
  await clickElement(exactButton(project, "Frames"));
  await expect(exactButton(project, "Step >")).toBeEnabled({
    timeout: 30_000,
  });

  const firstId = await readCurrentFrameId(page);
  const firstFrame = fixture.frames.find((frame) => frame.id === firstId)!;
  const firstChanged = !firstFrame.is_complete;
  const firstStatusResponse = page.waitForResponse((candidate) => {
    const url = new URL(candidate.url());
    return (
      candidate.request().method() === "POST" &&
      url.pathname.endsWith("/editor/frame/is_complete") &&
      url.searchParams.get("frame_id") === String(firstId) &&
      url.searchParams.get("is_complete") === String(firstChanged)
    );
  });
  await pressEditorKey(page, "Shift+c");
  expect((await firstStatusResponse).ok()).toBe(true);
  await expect.poll(() => readCurrentFrameId(page)).not.toBe(firstId);

  const secondId = await readCurrentFrameId(page);
  const secondFrame = fixture.frames.find((frame) => frame.id === secondId)!;
  const secondChanged = !secondFrame.is_complete;
  const secondStatusResponse = page.waitForResponse((candidate) => {
    const url = new URL(candidate.url());
    return (
      candidate.request().method() === "POST" &&
      url.pathname.endsWith("/editor/frame/is_complete") &&
      url.searchParams.get("frame_id") === String(secondId) &&
      url.searchParams.get("is_complete") === String(secondChanged)
    );
  });
  await expect(exactButton(project, "< Step")).toBeEnabled({
    timeout: 30_000,
  });
  await pressEditorKey(page, "Shift+z");
  expect((await secondStatusResponse).ok()).toBe(true);
  await expect.poll(() => readCurrentFrameId(page)).toBe(firstId);

  await page.reload();
  await expect(page.locator("#main-window")).toBeVisible({ timeout: 60_000 });
  await clickElement(exactButton(editorPanel(page, "Project"), "Frame"));
  await expect(
    editorPanel(page, "Project").getByRole("radio", {
      name: firstChanged ? "Complete" : "Incomplete",
      exact: true,
    }),
  ).toBeChecked();

  // Restore both frames so repeated runs remain independent.
  await selectFrameStatus(
    page,
    firstFrame.is_complete ? "Complete" : "Incomplete",
  );
  await clickElement(exactButton(editorPanel(page, "Project"), "Scene"));
  await fillNumberInput(
    inputControl(editorPanel(page, "Project"), "Stride"),
    "1",
  );
  await pressEditorKey(page, "c");
  await expect.poll(() => readCurrentFrameId(page)).toBe(secondId);
  await selectFrameStatus(
    page,
    secondFrame.is_complete ? "Complete" : "Incomplete",
  );
});
