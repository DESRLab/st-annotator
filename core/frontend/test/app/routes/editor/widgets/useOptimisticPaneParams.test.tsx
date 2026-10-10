/* @vitest-environment jsdom */

import { act, useMemo, useRef, useState, type JSX } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { useOptimisticPaneParams } from "../../../../../app/routes/editor/widgets/useOptimisticPaneParams.react.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

interface TestPaneParams {
  inputtedData: { value: number };
  computedData: {};
  internalData: {};
  settings: { disabled: boolean };
  outputData: {};
}

interface HarnessProps {
  committed: Pick<TestPaneParams, "inputtedData" | "settings">;
  onInputChange: (inputtedData: TestPaneParams["inputtedData"]) => void;
}

function Harness({ committed, onInputChange }: HarnessProps): JSX.Element {
  const committedParams = useMemo(
    (): Pick<TestPaneParams, "inputtedData" | "settings"> => committed,
    [committed],
  );
  const { onInputChange: handleInputChange, paneParams } =
    useOptimisticPaneParams({
      committedParams,
      onInputChange,
    });
  return (
    <button
      onClick={() =>
        handleInputChange({ value: paneParams.inputtedData.value + 1 })
      }
      type="button"
    >
      {paneParams.inputtedData.value}
    </button>
  );
}

async function renderHarness(node: JSX.Element) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(node);
  });

  return {
    container,
    unmount: async (): Promise<void> => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("useOptimisticPaneParams", () => {
  it("renders the committed params", async () => {
    const view = await renderHarness(
      <Harness
        committed={{
          inputtedData: { value: 3 },
          settings: { disabled: false },
        }}
        onInputChange={() => {}}
      />,
    );

    expect(view.container.querySelector("button")?.textContent).toBe("3");
    await view.unmount();
  });

  it("shows the optimistic draft when the round-trip does not apply the input", async () => {
    const changes: TestPaneParams["inputtedData"][] = [];
    const committed = {
      inputtedData: { value: 0 },
      settings: { disabled: false },
    };
    const view = await renderHarness(
      <Harness
        committed={committed}
        onInputChange={(inputtedData) => changes.push(inputtedData)}
      />,
    );

    const button = view.container.querySelector("button");
    await act(async () => {
      button?.click();
    });

    // The committed params never changed, so the visible value must come
    // from the local draft while the input was still forwarded.
    expect(button?.textContent).toBe("1");
    expect(changes).toEqual([{ value: 1 }]);
    await view.unmount();
  });

  it("keeps the latest draft over repeated input before the round-trip", async () => {
    const committed = {
      inputtedData: { value: 0 },
      settings: { disabled: false },
    };
    const view = await renderHarness(
      <Harness committed={committed} onInputChange={() => {}} />,
    );

    const button = view.container.querySelector("button");
    await act(async () => {
      button?.click();
    });
    await act(async () => {
      button?.click();
    });
    expect(button?.textContent).toBe("2");
    await view.unmount();
  });

  it("drops the draft when the committed params catch up", async () => {
    function RoundTripHarness(): JSX.Element {
      const [committedInput, setCommittedInput] = useState({ value: 0 });
      const committed = useMemo(
        () => ({
          inputtedData: committedInput,
          settings: { disabled: false },
        }),
        [committedInput],
      );
      const { onInputChange, paneParams } = useOptimisticPaneParams<
        typeof committed
      >({
        committedParams: committed,
        onInputChange: setCommittedInput,
      });
      return (
        <button
          onClick={() =>
            onInputChange({
              value: paneParams.inputtedData.value + 1,
            })
          }
          type="button"
        >
          {paneParams.inputtedData.value}
        </button>
      );
    }

    const view = await renderHarness(<RoundTripHarness />);
    const button = view.container.querySelector("button");

    await act(async () => {
      button?.click();
    });
    // The round-trip applied: the committed value replaced the draft.
    expect(button?.textContent).toBe("1");

    await act(async () => {
      button?.click();
    });
    expect(button?.textContent).toBe("2");
    await view.unmount();
  });

  it("follows outside committed changes", async () => {
    function SwitchingHarness(): JSX.Element {
      const [value, setValue] = useState(0);
      const committed = useMemo(
        () => ({
          inputtedData: { value },
          settings: { disabled: false },
        }),
        [value],
      );
      const { paneParams } = useOptimisticPaneParams<typeof committed>({
        committedParams: committed,
        onInputChange: () => {},
      });
      return (
        <>
          <button onClick={() => setValue(7)} type="button">
            {paneParams.inputtedData.value}
          </button>
        </>
      );
    }

    const view = await renderHarness(<SwitchingHarness />);
    const button = view.container.querySelector("button");
    expect(button?.textContent).toBe("0");

    await act(async () => {
      button?.click();
    });
    expect(button?.textContent).toBe("7");
    await view.unmount();
  });

  it("drops a pending draft when settings metadata changes without replacing the values", async () => {
    function MetadataHarness(): JSX.Element {
      const [disabled, setDisabled] = useState(false);
      // One stable values object: the disabled transition deliberately
      // does NOT replace it, as a data-load transition would not.
      const valuesRef = useRef({ value: 0 });
      const committed = useMemo(
        () => ({
          inputtedData: valuesRef.current,
          settings: { disabled },
        }),
        [disabled],
      );
      const { onInputChange, paneParams } = useOptimisticPaneParams<
        typeof committed
      >({
        committedParams: committed,
        onInputChange: () => {},
      });
      return (
        <>
          <button
            onClick={() =>
              onInputChange({
                value: paneParams.inputtedData.value + 1,
              })
            }
            type="button"
          >
            {paneParams.inputtedData.value}
          </button>
          <button onClick={() => setDisabled(true)} type="button">
            disable
          </button>
        </>
      );
    }

    const view = await renderHarness(<MetadataHarness />);
    const [inputButton, disableButton] =
      view.container.querySelectorAll("button");

    await act(async () => {
      inputButton?.click();
    });
    // The input lives only in the local draft.
    expect(inputButton?.textContent).toBe("1");

    await act(async () => {
      disableButton?.click();
    });
    // The disabled transition changed the committed params identity, so
    // the pending draft is dropped and the committed value wins.
    expect(inputButton?.textContent).toBe("0");
    await view.unmount();
  });

  it("drops rapid drafts when the selection changes before reconciliation", async () => {
    function RapidSelectionHarness(): JSX.Element {
      const [selection, setSelection] = useState({ id: "a", value: 10 });
      const nextValue = useRef(11);
      const committed = useMemo(
        () => ({
          inputtedData: { value: selection.value },
          settings: { disabled: false },
        }),
        [selection],
      );
      const { onInputChange, paneParams } = useOptimisticPaneParams<
        typeof committed
      >({
        committedParams: committed,
        onInputChange: () => {},
      });
      return (
        <>
          <button
            onClick={() => onInputChange({ value: nextValue.current++ })}
            type="button"
          >
            {paneParams.inputtedData.value}
          </button>
          <button
            onClick={() => setSelection({ id: "b", value: 99 })}
            type="button"
          >
            switch
          </button>
        </>
      );
    }

    const view = await renderHarness(<RapidSelectionHarness />);
    const [inputButton, switchButton] =
      view.container.querySelectorAll("button");

    // Two rapid values, then a selection change, all before any
    // reconciliation: the queued drafts must not survive the swap.
    await act(async () => {
      inputButton?.click();
      inputButton?.click();
      switchButton?.click();
    });
    expect(inputButton?.textContent).toBe("99");

    // A fresh input after the swap drafts against the NEW selection; the
    // old drafts are never resurrected.
    await act(async () => {
      inputButton?.click();
    });
    expect(inputButton?.textContent).toBe("13");
    await view.unmount();
  });

  it("shows authoritative data after re-enabling and accepts fresh drafts", async () => {
    function ReenableHarness(): JSX.Element {
      const [disabled, setDisabled] = useState(false);
      const valuesRef = useRef({ value: 5 });
      const committed = useMemo(
        () => ({
          inputtedData: valuesRef.current,
          settings: { disabled },
        }),
        [disabled],
      );
      const { onInputChange, paneParams } = useOptimisticPaneParams<
        typeof committed
      >({
        committedParams: committed,
        onInputChange: () => {},
      });
      return (
        <>
          <button
            onClick={() =>
              onInputChange({
                value: paneParams.inputtedData.value + 1,
              })
            }
            type="button"
          >
            {paneParams.inputtedData.value}
          </button>
          <button onClick={() => setDisabled((value) => !value)} type="button">
            toggle
          </button>
        </>
      );
    }

    const view = await renderHarness(<ReenableHarness />);
    const [inputButton, toggleButton] =
      view.container.querySelectorAll("button");

    await act(async () => {
      inputButton?.click();
    });
    expect(inputButton?.textContent).toBe("6");

    // Disable: the draft is dropped and the committed value wins.
    await act(async () => {
      toggleButton?.click();
    });
    expect(inputButton?.textContent).toBe("5");

    // Re-enable: the authoritative committed value is still shown, and a
    // fresh input drafts normally again.
    await act(async () => {
      toggleButton?.click();
    });
    expect(inputButton?.textContent).toBe("5");

    await act(async () => {
      inputButton?.click();
    });
    expect(inputButton?.textContent).toBe("6");
    await view.unmount();
  });
});
