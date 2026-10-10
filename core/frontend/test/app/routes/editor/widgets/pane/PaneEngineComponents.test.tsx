import { describe, expect, it } from "vitest";

import { VanillaEventDispatcher } from "../../../../../../app/routes/editor/utils/VanillaEventDispatcher.ts";
import { CompositePaneElement } from "../../../../../../app/routes/editor/widgets/pane/CompositePaneElement.tsx";
import {
  definePaneElements,
  paneControls,
} from "../../../../../../app/routes/editor/widgets/pane/DeclarativePane.ts";
import {
  createPaneFactory,
  mapPane,
  PaneElementFactoryBuilder,
  withPaneState,
} from "../../../../../../app/routes/editor/widgets/pane/PaneElementFactory.tsx";
import { MultiWrapperPaneElement } from "../../../../../../app/routes/editor/widgets/pane/WrapperPaneElement.tsx";

class FakePaneElement extends VanillaEventDispatcher {
  renderCalls = [];
  updateCalls = [];
  disposed = false;

  render(params) {
    this.renderCalls.push({ ...params });
  }

  updateParams(params) {
    this.updateCalls.push({ ...params });
    params.value = params.value + ":updated";
  }

  dispose() {
    this.disposed = true;
  }
}

describe("Pane engine React-compatible components", () => {
  it("compiles typed declarative controls into a functional factory", () => {
    const controls = paneControls<{ inputtedData: { enabled: boolean } }>();
    const factory = definePaneElements(
      { inputtedData: { enabled: false } },
      [],
      controls.sequential([
        controls.input(["inputtedData", "enabled"], {
          options: { label: "Enabled" },
        }),
        controls.separator({ options: {} }),
      ]),
    );

    expect(factory).toHaveProperty("attach");
    expect(factory.debugContext.operationPath).toEqual(["compose"]);
  });

  it("creates immutable functional factories with compact debug paths", () => {
    const factory = createPaneFactory([], () => new FakePaneElement(), {
      operationPath: ["test"],
    });

    expect(Object.isFrozen(factory)).toBe(true);
    expect(factory.debugContext).toEqual({ operationPath: ["test"] });
    expect(() => Object.assign(factory, { attach: null })).toThrow();
  });

  it("maps parameters and event payloads through mapPane", () => {
    const wrapped = [];
    const innerFactory = createPaneFactory(
      ["change"],
      () => {
        const elem = new FakePaneElement();
        wrapped.push(elem);
        return elem;
      },
      { operationPath: ["inner"] },
    );
    const factory = mapPane(
      innerFactory,
      {
        outerToInner: ({ outer }) => ({ value: outer }),
        innerToOuter: ({ value }) => ({ outer: value }),
      },
      {
        outerEventTypes: ["changed"],
        innerToOuter: (event) => ({
          type: "changed",
          value: event.value + 1,
        }),
      },
    );
    const elem = factory.attach({} as any, { outer: "initial" });
    const events = [];
    elem.addEventListener("changed", (event) => events.push(event));

    wrapped[0].dispatchEvent({ type: "change", value: 4 });
    const params = { outer: "next" };
    elem.updateParams(params);

    expect(events).toMatchObject([{ type: "changed", value: 5 }]);
    expect(params).toEqual({ outer: "next:updated" });
  });

  it("isolates withPaneState state between attached elements", () => {
    const rendered = [];
    const innerFactory = createPaneFactory(
      [],
      () => {
        const elem = new FakePaneElement();
        rendered.push(elem);
        return elem;
      },
      { operationPath: ["inner"] },
    );
    const factory = withPaneState(
      innerFactory,
      ({ state }, params) => ({
        params: { value: `${params.value}:${state.count}` },
        state: { count: state.count + 1 },
      }),
      { count: 0 },
    );
    const first = factory.attach({} as any, { value: "a" });
    const second = factory.attach({} as any, { value: "b" });

    first.render({ value: "a" });
    first.render({ value: "a" });
    second.render({ value: "b" });

    expect(rendered[0].renderCalls.at(-1)).toEqual({ value: "a:1" });
    expect(rendered[1].renderCalls.at(-1)).toEqual({ value: "b:0" });
  });

  it("exports composite pane elements through the public shim", () => {
    expect(CompositePaneElement).toBeTypeOf("function");
  });

  it("forwards wrapper events and lifecycle calls to wrapped pane elements", () => {
    const wrapped = [];
    const wrapper = new MultiWrapperPaneElement(
      {},
      { value: "initial" },
      (_pane, _params) => {
        const elem = new FakePaneElement();
        wrapped.push(elem);
        return [elem];
      },
      ["change"],
    );
    const events = [];
    wrapper.addEventListener("change", (event) => events.push(event));

    wrapped[0].dispatchEvent({ type: "change", value: 1 });
    wrapper.render({ value: "rendered" });
    const params = { value: "next" };
    wrapper.updateParams(params);
    wrapper.dispose();
    wrapped[0].dispatchEvent({ type: "change", value: 2 });

    expect(events).toHaveLength(1);
    expect(events[0].value).toBe(1);
    expect(wrapped[0].renderCalls).toEqual([{ value: "rendered" }]);
    expect(wrapped[0].updateCalls).toEqual([{ value: "next" }]);
    expect(params).toEqual({ value: "next:updated" });
    expect(wrapped[0].disposed).toBe(true);
  });

  it("builds sequential pane factories through the public shim", () => {
    const wrapped = [];
    const childFactory = {
      eventTypes: ["change"],
      attach: () => {
        const elem = new FakePaneElement();
        wrapped.push(elem);
        return elem;
      },
    };
    const builder = new PaneElementFactoryBuilder({ value: "" }, ["change"]);
    const factory = builder.sequential([childFactory as any]);
    const elem = factory.attach({} as any, { value: "initial" });
    const events = [];
    elem.addEventListener("change", (event) => events.push(event));

    wrapped[0].dispatchEvent({ type: "change", value: 7 });
    elem.render({ value: "rendered" });
    const params = { value: "next" };
    elem.updateParams(params);
    elem.dispose();
    wrapped[0].dispatchEvent({ type: "change", value: 8 });

    expect(events).toHaveLength(1);
    expect(events[0].value).toBe(7);
    expect(wrapped[0].renderCalls).toEqual([{ value: "rendered" }]);
    expect(params).toEqual({ value: "next:updated" });
    expect(wrapped[0].disposed).toBe(true);
  });
});
