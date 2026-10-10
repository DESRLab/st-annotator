import { describe, expect, it } from "vitest";

import { createInspectorEventBus } from "../../../../../app/routes/editor/widgets/InspectorHandle.ts";

interface TestInspectorEvents {
  select: { id: string | null };
  toggle: { active: boolean };
}

describe("createInspectorEventBus", () => {
  it("routes typed events and stops after listener removal", () => {
    const events = createInspectorEventBus<TestInspectorEvents>();
    const selected: (string | null)[] = [];
    const listener = ({ id }: { type: "select"; id: string | null }): void =>
      selected.push(id);

    events.addEventListener("select", listener);
    events.dispatchEvent({ type: "select", id: "box-1" });
    events.dispatchEvent({ type: "toggle", active: true });
    events.removeEventListener("select", listener);
    events.dispatchEvent({ type: "select", id: null });

    expect(selected).toEqual(["box-1"]);
  });

  it("clears all listeners during disposal", () => {
    const events = createInspectorEventBus<TestInspectorEvents>();
    const toggle = (): void => {};

    events.addEventListener("toggle", toggle);
    events.clear();

    expect(() =>
      events.dispatchEvent({ type: "toggle", active: false }),
    ).not.toThrow();
  });
});
