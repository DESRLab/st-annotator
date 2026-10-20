import { expect, test } from "@playwright/test";

import { openRowCommand, openSelectionCommand } from "./helpers/ui";

test.describe("row command helper", () => {
  for (const selection of [false, true]) {
    test(`reopens a menu removed during clicking (batch: ${selection})`, async ({
      page,
    }) => {
      test.setTimeout(10_000);
      await page.setContent(`
        <table><tbody><tr role="row"><td>Frame 123</td></tr></tbody></table>
        <output id="result"></output>
        <script>
          const row = document.querySelector('tr');
          let opens = 0;
          let selections = 0;
          row.addEventListener('click', () => { selections++; });
          row.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            document.querySelector('[role="menu"]')?.remove();
            const menu = document.createElement('div');
            menu.role = 'menu';
            const command = document.createElement('button');
            command.textContent = 'Edit Details';
            menu.append(command);
            document.body.append(menu);
            opens++;
            if (opens === 1) {
              command.addEventListener('mouseover', () => menu.remove(), { once: true });
            }
            command.addEventListener('click', () => {
              document.querySelector('#result').textContent = JSON.stringify({ opens, selections });
              menu.remove();
            });
          });
        </script>
      `);
      if (selection) {
        await openSelectionCommand(
          page,
          page.getByRole("row", { name: "Frame 123" }),
          "Edit Details",
        );
      } else {
        await openRowCommand(page, "Frame 123", "Edit Details");
      }
      await expect(page.locator("#result")).toHaveText(
        JSON.stringify({ opens: 2, selections: selection ? 0 : 1 }),
      );
    });
  }
});

test("pane controls match label text rather than another control's options", async ({
  page,
}) => {
  const { selectControl } = await import("./with-data/editor-helpers");
  await page.setContent(`
    <section id="pane">
      <div class="tp-lblv">
        <div class="tp-lblv_l">Blender Type</div>
        <select id="blender"><option>ApplyColormap</option><option>ComposeRGB</option></select>
      </div>
      <div class="tp-lblv">
        <div class="tp-lblv_l">Colormap</div>
        <select id="colormap"><option>viridis</option><option>greys</option></select>
      </div>
    </section>
  `);
  const pane = page.locator("#pane");
  await expect(selectControl(pane, "Colormap")).toHaveAttribute(
    "id",
    "colormap",
  );
  await selectControl(pane, "Colormap").selectOption({ label: "greys" });
  await expect(page.locator("#blender")).toHaveValue("ApplyColormap");
  await expect(page.locator("#colormap")).toHaveValue("greys");
});

test("numeric input helpers reject clamped values that contain the requested digits", async ({
  page,
}) => {
  const { fillNumberInput } = await import("./with-data/editor-helpers");
  await page.setContent(`
    <input id="number">
    <script>
      document.querySelector('input').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') event.target.value = '0.9';
      });
    </script>
  `);
  await expect(fillNumberInput(page.locator("input"), "0")).rejects.toThrow();
});

test("numeric input helpers accept equivalent decimal formatting", async ({
  page,
}) => {
  const { fillNumberInput } = await import("./with-data/editor-helpers");
  await page.setContent(`
    <input>
    <script>
      document.querySelector('input').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') event.target.value = '1.000';
      });
    </script>
  `);
  await fillNumberInput(page.locator("input"), "1");
});
