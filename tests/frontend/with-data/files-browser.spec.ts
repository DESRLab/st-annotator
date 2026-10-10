import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { expect, type Page, test } from "@playwright/test";

import { loginWith } from "../helpers/accounts";
import { clickBreadcrumbLink, uniqueName } from "../helpers/ui";

function findDotenv(): string {
  let directory = path.resolve(process.cwd());

  while (true) {
    const dotenvPath = path.join(directory, ".env");
    if (fs.existsSync(dotenvPath) && fs.statSync(dotenvPath).isFile()) {
      return dotenvPath;
    }

    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error(`Unable to load \`.env\` file at path: ${dotenvPath}`);
    }
    directory = parent;
  }
}

function filesystemRootFromEnvFile(): string {
  const dotenvPath = findDotenv();
  const envFile = fs.readFileSync(dotenvPath, "utf8");
  const match = envFile.match(/^FILESYSTEM_ROOT\s*=\s*(.+?)\s*$/m);

  if (!match) {
    throw new Error(`FILESYSTEM_ROOT must be configured in ${dotenvPath}`);
  }

  const configuredRoot = match[1].replace(
    /^(?:"([\s\S]*)"|'([\s\S]*)')$/,
    "$1$2",
  );
  return path.resolve(path.dirname(dotenvPath), configuredRoot);
}

// Match the backend's find_dotenv(usecwd=True) lookup and root resolution.
// The fixture lives in a uniquely-named subdirectory and is removed after the run.
const DATA_DIR = filesystemRootFromEnvFile();
const FIXTURE_NAME = uniqueName("e2e-file-browser");
const FIXTURE_DIR = path.join(DATA_DIR, FIXTURE_NAME);

const GRID_ID = "file-explorer-grid";
const LOADING_STATUS = "#grid-container div[role=status]";
const NOTES_CONTENT = "files-e2e-notes-content";
const DEEP_CONTENT = "files-e2e-deep-content";
// Spans more than one backend CHUNK_SIZE so the download paths exercise
// chunked streaming; renders as '2.0 MB' in the grid.
const BIG_CONTENT = Buffer.alloc(2 * 1024 * 1024 + 123, 7);

function gridRows(page: Page) {
  return page.locator(`#${GRID_ID} .slick-row`);
}

async function columnIndex(page: Page, name: string): Promise<number> {
  const headers = page.locator(
    `#${GRID_ID} .slick-header-column .slick-column-name`,
  );
  const count = await headers.count();
  for (let index = 0; index < count; index += 1) {
    if ((await headers.nth(index).innerText()).trim() === name) {
      return index;
    }
  }
  throw new Error(`Column ${name} not found in #${GRID_ID}`);
}

function cellAt(row: ReturnType<typeof gridRows>, column: number) {
  return row.locator(`.slick-cell.l${column}`);
}

/**
 * Whether the loading indicator, not the grid, is what a pointer would hit on
 * the first listed cell. Only the browser knows the stacking of the overlay
 * against the grid's own layers.
 */
async function loadingStatusCoversGrid(page: Page): Promise<boolean> {
  return page.evaluate(
    ({ gridId, statusSelector }) => {
      const cell = document.querySelector(`#${gridId} .slick-row .slick-cell`);
      const status = document.querySelector(statusSelector);
      if (!cell || !status) {
        return false;
      }

      const rect = cell.getBoundingClientRect();
      const hit = document.elementFromPoint(
        rect.x + rect.width / 2,
        rect.y + rect.height / 2,
      );
      return hit !== null && status.contains(hit);
    },
    { gridId: GRID_ID, statusSelector: LOADING_STATUS },
  );
}

async function openFixtureListing(page: Page) {
  await loginWith(page, "e2e-data-manager", "password");
  await page.goto(`/source/files?path=${encodeURIComponent(FIXTURE_NAME)}`);
  await expect(gridRows(page)).toHaveCount(4);
}

function zipEntries(zipPath: string): {
  names: string[];
  contents: Record<string, string>;
} {
  // Playwright has no zip support; the backend venv guarantees python3.
  const script = `
import json, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as zf:
    names = sorted(zf.namelist())
    contents = {name: zf.read(name).decode() for name in names if not name.endswith('/')}
print(json.dumps({'names': names, 'contents': contents}))
`;
  const output = execFileSync("python3", ["-c", script, zipPath], {
    encoding: "utf-8",
  });
  return JSON.parse(output) as {
    names: string[];
    contents: Record<string, string>;
  };
}

test.beforeAll(() => {
  fs.mkdirSync(path.join(FIXTURE_DIR, "nested"), { recursive: true });
  fs.mkdirSync(path.join(FIXTURE_DIR, "empty"));
  fs.writeFileSync(path.join(FIXTURE_DIR, "notes.txt"), NOTES_CONTENT);
  fs.writeFileSync(path.join(FIXTURE_DIR, "big.dat"), BIG_CONTENT);
  fs.writeFileSync(path.join(FIXTURE_DIR, "nested", "deep.txt"), DEEP_CONTENT);
});

test.afterAll(() => {
  fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
});

test.describe("file explorer", () => {
  test("lists directories before files and navigates through parent-derived paths", async ({
    page,
  }) => {
    await openFixtureListing(page);

    const nameColumn = await columnIndex(page, "Name");
    const sizeColumn = await columnIndex(page, "Size");

    // Directories are listed first, then files, both case-insensitively by
    // name. Directory sizes carry no content information and stay empty.
    await expect(cellAt(gridRows(page).nth(0), nameColumn)).toContainText(
      "empty",
    );
    await expect(cellAt(gridRows(page).nth(0), sizeColumn)).toHaveText("");
    await expect(cellAt(gridRows(page).nth(1), nameColumn)).toContainText(
      "nested",
    );
    await expect(cellAt(gridRows(page).nth(1), sizeColumn)).toHaveText("");
    await expect(cellAt(gridRows(page).nth(2), nameColumn)).toContainText(
      "big.dat",
    );
    await expect(cellAt(gridRows(page).nth(2), sizeColumn)).toHaveText(
      "2.0 MB",
    );
    await expect(cellAt(gridRows(page).nth(3), nameColumn)).toContainText(
      "notes.txt",
    );
    await expect(cellAt(gridRows(page).nth(3), sizeColumn)).toHaveText(
      `${NOTES_CONTENT.length} B`,
    );

    // Row identity is composed from the parent URI reported by the API;
    // double-click navigation proves the composition is intact.
    await gridRows(page).nth(1).dblclick();
    await page.waitForURL(
      (url) => url.searchParams.get("path") === `${FIXTURE_NAME}/nested`,
    );
    await expect(gridRows(page)).toHaveCount(1);
    await expect(gridRows(page).first()).toContainText("deep.txt");

    // The breadcrumb prepends the '.' root segment, so its links navigate to
    // './<dir>' rather than '<dir>', both resolve to the same listing.
    await clickBreadcrumbLink(page, FIXTURE_NAME);
    await page.waitForURL(
      (url) => url.searchParams.get("path") === `./${FIXTURE_NAME}`,
    );
    await expect(gridRows(page)).toHaveCount(4);
  });

  test("announces a pending directory load over the stale listing", async ({
    page,
  }) => {
    await openFixtureListing(page);

    // Hold the router data round-trip open: the grid keeps showing the parent
    // listing until its loader resolves, which is exactly the window the
    // loading screen exists to cover.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(/\.data\?/, async (route) => {
      await held;
      await route.continue();
    });

    const nameColumn = await columnIndex(page, "Name");
    const staleUrl = page.url();
    await gridRows(page).nth(1).dblclick();

    const status = page.locator(LOADING_STATUS);
    await expect(status).toBeVisible();
    await expect(status).toContainText("Opening nested");
    expect(page.url()).toBe(staleUrl);
    await expect(cellAt(gridRows(page).nth(1), nameColumn)).toContainText(
      "nested",
    );
    expect(await loadingStatusCoversGrid(page)).toBe(true);

    release();
    await page.waitForURL(
      (url) => url.searchParams.get("path") === `${FIXTURE_NAME}/nested`,
    );
    await expect(status).toHaveCount(0);
    await expect(gridRows(page)).toHaveCount(1);
    await expect(gridRows(page).first()).toContainText("deep.txt");
  });

  test("downloads a single file under its own name", async ({ page }) => {
    await openFixtureListing(page);

    await gridRows(page).filter({ hasText: "notes.txt" }).click();
    await expect(
      page.getByRole("button", { name: "Deselect All (1 selected)" }),
    ).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download", exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("notes.txt");

    const target = test.info().outputPath("notes.txt");
    await download.saveAs(target);
    expect(fs.readFileSync(target, "utf-8")).toBe(NOTES_CONTENT);
  });

  test("downloads a zip archive for multi-selection", async ({ page }) => {
    await openFixtureListing(page);

    await gridRows(page).filter({ hasText: "notes.txt" }).click();
    await gridRows(page)
      .filter({ hasText: "nested" })
      .click({ modifiers: ["Control"] });
    await expect(
      page.getByRole("button", { name: "Deselect All (2 selected)" }),
    ).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download (2 items)" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("files.zip");

    const target = test.info().outputPath("files.zip");
    await download.saveAs(target);
    const { names, contents } = zipEntries(target);
    const notesPath = `${FIXTURE_NAME}/notes.txt`;
    const deepPath = `${FIXTURE_NAME}/nested/deep.txt`;
    expect(names).toEqual([deepPath, notesPath]);
    expect(contents[notesPath]).toBe(NOTES_CONTENT);
    expect(contents[deepPath]).toBe(DEEP_CONTENT);
  });
});
