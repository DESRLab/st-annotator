import { expect, test } from "@playwright/test";

import {
  isEditorDataResponse,
  loadEditorFixture,
  openEditor,
} from "./editor-helpers";

test("loads a time-path label window in one ordered bulk response", async ({
  page,
}) => {
  test.setTimeout(180_000);

  const fixture = await loadEditorFixture(page);
  const target = fixture.frames[2];
  const responsePromise = page.waitForResponse((response) => {
    if (!isEditorDataResponse(response, "/editor/label/data/bulk", "bbox"))
      return false;
    return new URL(response.url()).searchParams.getAll("frame_ids").length > 1;
  });

  await openEditor(page, target);
  const response = await responsePromise;
  const requested = new URL(response.url()).searchParams.getAll("frame_ids");
  const payload = (await response.json()) as unknown[];

  expect(response.ok()).toBe(true);
  expect(payload).toHaveLength(requested.length);
});
