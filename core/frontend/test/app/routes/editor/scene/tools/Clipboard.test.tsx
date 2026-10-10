/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { ClipboardToolView } from "../../../../../../app/routes/editor/scene/tools/Clipboard.react.tsx";
import { Clipboard } from "../../../../../../app/routes/editor/scene/tools/Clipboard.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function flushReact() {
  await act(async () => {});
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("Clipboard", () => {
  it("renders through an owning React tree while preserving copy and paste behavior", async () => {
    let clipboard;
    await act(async () => {
      clipboard = new Clipboard({
        objToData: (selected) => ({ id: (selected as any).id }),
      });
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<ClipboardToolView clipboard={clipboard} />);
    });
    await flushReact();

    const copyButton = () => host.querySelectorAll("button")[0];
    const pasteButton = () => host.querySelectorAll("button")[1];

    expect(copyButton().textContent).toBe("Copy");
    expect(pasteButton().textContent).toBe("Paste");
    expect(host.querySelector(".tp-lblv_l")).toBeNull();
    expect(
      host.querySelector(".tp-lblv")?.classList.contains("tp-lblv-nol"),
    ).toBe(true);
    expect(host.querySelector(".react-clipboard-actions")?.style.width).toBe(
      "100%",
    );
    expect(copyButton().parentElement?.parentElement?.style.display).toBe(
      "flex",
    );
    expect(copyButton().disabled).toBe(true);
    expect(pasteButton().disabled).toBe(true);

    const copied = [];
    const pasted = [];
    clipboard.addEventListener("copy", (event) => copied.push(event.clipboard));
    clipboard.addEventListener("paste", (event) =>
      pasted.push(event.clipboard),
    );

    await act(async () => clipboard.select({ id: 7 }));
    expect(copyButton().disabled).toBe(false);

    await act(async () => copyButton().click());
    expect(copied).toEqual([{ id: 7 }]);
    expect(clipboard.clipboard).toEqual({ id: 7 });
    expect(pasteButton().disabled).toBe(false);

    await act(async () => pasteButton().click());
    expect(pasted).toEqual([{ id: 7 }]);

    await act(async () => {
      clipboard.disabled = true;
    });
    expect(
      host.querySelector(".tp-lblv")?.classList.contains("tp-v-disabled"),
    ).toBe(true);
    expect(copyButton().disabled).toBe(true);
    expect(pasteButton().disabled).toBe(true);

    await act(async () => {
      copyButton().click();
      pasteButton().click();
    });
    expect(copied).toEqual([{ id: 7 }]);
    expect(pasted).toEqual([{ id: 7 }]);

    await act(async () => root.unmount());
    await act(async () => clipboard.dispose());
    expect(host.innerHTML).toBe("");
  });
});
