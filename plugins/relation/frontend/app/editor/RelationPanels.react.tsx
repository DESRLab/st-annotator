import {
  default as React,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createActionPane,
  LayerOverlayView,
  PaneElementFactoryBuilder,
  TweakpanePaneHost,
  VirtualCombobox,
  VirtualList,
  createPluginSliceSelectorHook,
  useEditorIntents,
} from "sta/app/editor";
import type {
  ActionPaneControllerParams,
  PaneElementParams,
  TweakpanePaneDefinition,
} from "sta/app/editor";
import type { RelationIntents, RelationSlice } from "./RelationSlice";
import { defaultRelationSettings } from "./RelationSettings";
import type { RelationSettings } from "./RelationSettings";

export const useRelationSelector = createPluginSliceSelectorHook<
  "relation",
  RelationSlice
>("relation");

const { ActionPaneView } = createActionPane([
  { value: "edit", role: "base" },
  {
    value: "select",
    role: "selectable",
    label: "S",
    keyCombo: "s",
    keybindName: "Select relation",
  },
  {
    value: "create",
    role: "selectable",
    label: "D",
    keyCombo: "d",
    keybindName: "Draw relation",
  },
] as const);

export function RelationActions(): React.JSX.Element {
  const mode = useRelationSelector((slice) => slice.mode);
  const disabled = useRelationSelector((slice) => slice.disabled);
  const classId = useRelationSelector((slice) => slice.classId);
  const intents = useEditorIntents<{ relation: RelationIntents }>().relation;
  const action = mode === "select" || mode === "create" ? mode : "edit";
  const paneParams = useMemo(
    (): Pick<
      ActionPaneControllerParams<"edit" | "select" | "create">,
      "inputtedData" | "settings"
    > => ({
      inputtedData: { action },
      settings: { disabled, hidden: false },
    }),
    [action, disabled],
  );
  const onInputChange = useCallback(
    ({ action: next }: { action: "edit" | "select" | "create" }) => {
      if (next === "create") {
        if (classId != null) intents.setMode("create");
      } else if (next === "select") intents.setMode("select");
      else intents.cancel();
    },
    [intents, classId],
  );
  return (
    <ActionPaneView paneParams={paneParams} onInputChange={onInputChange} />
  );
}

interface CycleToolsParams {
  inputtedData: { isolated: boolean };
  computedData: { disabled: boolean; empty: boolean };
  settings: { disabled: boolean; hidden: boolean };
  internalData: { disabled: boolean; empty: boolean };
  outputData: { isolated: boolean };
}
const cycleToolsBuilder = PaneElementFactoryBuilder.withoutEvents({
  inputtedData: { isolated: false },
  computedData: { disabled: true, empty: true },
  settings: { disabled: false, hidden: false },
});
const createCycleToolsDefinition = (
  slots: Readonly<Record<string, HTMLElement>>,
): TweakpanePaneDefinition<CycleToolsParams> => ({
  factory: cycleToolsBuilder.sequential([
    cycleToolsBuilder.input(["inputtedData", "isolated"], {
      options: ({ inputtedData, computedData }) => ({
        label: "Isolate current relation",
        disabled:
          !inputtedData.isolated &&
          (computedData.disabled || computedData.empty),
      }),
    }),
    cycleToolsBuilder.folder(
      cycleToolsBuilder.htmlContainer({
        options: { innerElem: slots.relations },
        modifyHTML: (element) => {
          element.style.color = "var(--cnt-fg)";
        },
      }),
      { options: { title: "Relations", expanded: true } },
    ),
  ]),
  dataProcessor: {
    computeData: (_input, internalData) => internalData,
    outputData: ({ inputtedData }) => inputtedData,
  },
});
/** Persistent tools and the ordered set of relation groups available to cycle. */
export function RelationTools(): React.JSX.Element {
  const state = useRelationSelector((slice) => slice);
  const intents = useEditorIntents<{ relation: RelationIntents }>().relation;
  const entries = state.relations.filter((relation) => relation.visible);
  const list = useRef<HTMLDivElement>(null);
  const height = 128;
  const rowHeight = 19;
  const currentIndex = state.cycling
    ? entries.findIndex((relation) => relation.id === state.selectedId)
    : -1;
  useLayoutEffect(() => {
    const scroller =
      list.current?.querySelector<HTMLElement>('[role="listbox"]');
    if (scroller == null) return;
    scroller.scrollTop = Math.max(
      0,
      Math.min(
        currentIndex < 0 ? scroller.scrollTop : currentIndex * rowHeight,
        entries.length * rowHeight - height,
      ),
    );
    scroller.dispatchEvent(new Event("scroll"));
  }, [currentIndex, entries.length, height]);
  return (
    <div data-testid="relation-tools">
      <TweakpanePaneHost<CycleToolsParams, CycleToolsParams["outputData"]>
        definition={createCycleToolsDefinition}
        mapOutputChange={({ inputtedData }) => inputtedData}
        onInputChange={({ isolated }) => intents.setIsolation(isolated)}
        paneParams={{
          inputtedData: { isolated: state.cycling },
          internalData: {
            disabled: state.disabled,
            empty: entries.length === 0,
          },
          settings: { disabled: false, hidden: false },
        }}
        slots={{
          relations: (
            <div ref={list}>
              <VirtualList
                items={entries.length === 0 ? [null] : entries}
                ariaLabel="Relation cycle order"
                className={`scrolllist relation-cycle-list${state.disabled ? " disabled" : ""}`}
                role="listbox"
                height={height}
                rowHeight={rowHeight}
                renderItem={(relation, index) => {
                  if (relation == null)
                    return (
                      <div
                        className="scrolllist-item disabled"
                        role="option"
                        aria-disabled="true"
                        aria-selected="false"
                      >
                        No relations in the current view
                      </div>
                    );
                  const selected = relation.id === state.selectedId;
                  const current = state.cycling && selected;
                  return (
                    <div
                      role="option"
                      key={relation.id}
                      className={`scrolllist-item${selected ? " selected" : ""}${state.disabled ? " disabled" : ""}`}
                      style={{
                        height: rowHeight,
                        boxSizing: "border-box",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      data-testid="relation-cycle-entry"
                      data-relation-id={relation.id}
                      aria-current={current ? "step" : undefined}
                      aria-selected={selected}
                      aria-disabled={state.disabled}
                      tabIndex={state.disabled ? -1 : 0}
                      onClick={() => {
                        if (!state.disabled) intents.select(relation.id);
                      }}
                      onKeyDown={(event) => {
                        if (
                          !state.disabled &&
                          (event.key === "Enter" || event.key === " ")
                        ) {
                          event.preventDefault();
                          event.stopPropagation();
                          intents.select(relation.id);
                        }
                      }}
                      title={`${relation.displayId}: ${relation.source} → ${relation.target}`}
                    >
                      {`${index + 1}. ${relation.name} — ${relation.sourceClassName ?? relation.source} → ${relation.targetClassName ?? relation.target}`}
                    </div>
                  );
                }}
              />
            </div>
          ),
        }}
      />
    </div>
  );
}

interface InspectorParams {
  inputtedData: {
    hidden?: boolean;
    selectedId: string | null;
    directionId: string | null;
    classId: number | null;
  };
  computedData: { state: RelationSlice | null };
  settings: { disabled: boolean; hidden: boolean };
  internalData: RelationSlice | null;
  outputData: {
    hidden?: boolean;
    selectedId: string | null;
    directionId: string | null;
    classId: number | null;
  };
}
interface InspectorEvents {
  source: {};
  target: {};
  draw: {};
  add: {};
}
const defaults: PaneElementParams<InspectorParams> = {
  inputtedData: {
    hidden: false,
    selectedId: null,
    directionId: null,
    classId: null,
  },
  computedData: { state: null },
  settings: { disabled: true, hidden: false },
};
const builder = new PaneElementFactoryBuilder<
  PaneElementParams<InspectorParams>,
  InspectorEvents
>(defaults, ["source", "target", "draw", "add"]);
const createInspectorDefinition = (
  slots: Readonly<Record<string, HTMLElement>>,
): TweakpanePaneDefinition<InspectorParams, InspectorEvents> => ({
  factory: builder.sequential([
    builder.tableRow(
      [
        {
          factory: builder.htmlContainer({
            options: { innerElem: slots.selection },
          }),
          options: { minWidth: "128px" },
        },
        {
          factory: builder.button({
            options: ({ computedData: { state }, settings }) => ({
              title: "D",
              disabled: settings.disabled || state?.classId == null,
              hidden: settings.hidden,
            }),
            modifyHTML: (element, { computedData: { state } }) => {
              element.style.marginTop = "0";
              const button = element.querySelector("button")!;
              button.title = "Toggle Draw Mode (D)";
              button.setAttribute(
                "aria-pressed",
                String(state?.mode === "create"),
              );
              button.style.backgroundColor =
                state?.mode === "create"
                  ? "var(--selectgrid-selected-bg, royalblue)"
                  : "";
              button.style.color =
                state?.mode === "create"
                  ? "var(--selectgrid-selected-fg, #fff)"
                  : "";
            },
            eventHandlers: {
              click: (element) => element.dispatchEvent({ type: "draw" }),
            },
          }),
          options: { width: "24px" },
        },
      ],
      {
        options: ({ settings }) => ({
          label: "Select item to inspect:",
          ...settings,
        }),
      },
    ),
    builder.input(["inputtedData", "hidden"], {
      options: ({ inputtedData, settings }) => ({
        label: "Hide in scene",
        ...settings,
        disabled: settings.disabled || inputtedData.selectedId == null,
      }),
    }),
    builder.list(["inputtedData", "directionId"], {
      options: ({ computedData: { state }, settings }) => {
        const relation = state?.relations.find(
          (item) => item.id === state.selectedId,
        );
        const records = relation?.records ?? [];
        const sources = [...new Set(records.map((item) => item.source))];
        return {
          label: "Direction",
          options: [
            { text: "(Select a relation)", value: null },
            ...sources.map((sourceId) => {
              const item = records.find(
                (record) => record.source === sourceId,
              )!;
              const source = relation?.sourceClassName ?? "(Unclassified)";
              const target = relation?.targetClassName ?? "(Unclassified)";
              const count = records.filter(
                (record) => record.source === sourceId,
              ).length;
              return {
                text: `${item.reversed ? `${target} → ${source}` : `${source} → ${target}`} (${count})`,
                value: sourceId,
              };
            }),
          ],
          ...settings,
        };
      },
    }),
    builder.folder(
      builder.sequential([
        builder.htmlContainer({ options: { innerElem: slots.records } }),
        builder.button({
          options: ({ computedData: { state }, settings }) => ({
            title: "Add relation",
            ...settings,
            disabled:
              settings.disabled ||
              state?.classId == null ||
              !state.relations.some((item) => item.id === state.selectedId),
          }),
          eventHandlers: {
            click: (element) => element.dispatchEvent({ type: "add" }),
          },
        }),
      ]),
      { options: ({ settings }) => ({ title: "Relations", ...settings }) },
    ),
    builder.list(["inputtedData", "classId"], {
      options: ({ computedData: { state }, settings }) => ({
        label: "Relation class",
        options: [
          { text: "(Select a class)", value: null },
          ...(state?.classes ?? []).map((item) => ({
            text: item.name,
            value: item.id,
          })),
        ],
        ...settings,
        hidden:
          settings.hidden ||
          state?.relations.some((item) => item.id === state.selectedId) ===
            true,
      }),
    }),
    ...(["source", "target"] as const).map((endpoint) =>
      builder.folder(
        builder.sequential([
          builder.tableRow(
            [
              {
                factory: builder.htmlContainer({
                  options: { innerElem: slots[endpoint] },
                }),
                options: { minWidth: "128px" },
              },
            ],
            { options: { label: "ID" } },
          ),
          builder.text({
            options: ({ computedData: { state } }) => {
              const selected = state?.relations.find(
                (item) => item.id === state.selectedId,
              );
              return {
                label: "Object class",
                value:
                  selected == null
                    ? ""
                    : (selected[`${endpoint}ClassName`] ?? "(Unclassified)"),
                parse: (value: string) => value,
                format: (value: string) => value,
                disabled: true,
              };
            },
          }),
          builder.button({
            options: ({
              inputtedData: { selectedId },
              computedData: { state },
              settings,
            }) => ({
              title: `Replace ${endpoint}`,
              disabled:
                settings.disabled ||
                !state?.relations.some((item) => item.id === selectedId),
              hidden: settings.hidden,
            }),
            eventHandlers: {
              click: (element) => element.dispatchEvent({ type: endpoint }),
            },
          }),
        ]),
        {
          options: ({ settings }) => ({
            title: endpoint === "source" ? "Source" : "Target",
            ...settings,
          }),
        },
      ),
    ),
  ]),
  dataProcessor: {
    computeData: (_input, state) => ({ state }),
    outputData: ({ inputtedData }) => inputtedData,
  },
});

function EndpointFields({
  state,
  endpoint,
  intents,
}: {
  state: RelationSlice;
  endpoint: "source" | "target";
  intents: RelationIntents;
}): React.JSX.Element {
  const selected = state.relations.find((item) => item.id === state.selectedId);
  const currentId = selected?.[endpoint] ?? null;
  const [type, setType] = useState<string | null>(
    () => state.endpoints.find((item) => item.id === currentId)?.type ?? null,
  );
  const candidates = state.endpoints.filter(
    (item) =>
      (item.visible || item.id === currentId) &&
      item.id !== selected?.[endpoint === "source" ? "target" : "source"],
  );
  const disabled = state.disabled || selected == null;
  return (
    <div style={{ display: "flex", gap: "4px", width: "100%" }}>
      <div style={{ width: "80px", flexShrink: 0 }}>
        <VirtualCombobox
          disabled={disabled}
          items={[...new Set(candidates.map((item) => item.type))].map(
            (id) => ({ id, text: id }),
          )}
          nullText="(Type)"
          value={type}
          onChange={setType}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <VirtualCombobox
          disabled={disabled}
          items={candidates.filter(
            (item) => type == null || item.type === type,
          )}
          nullText="(Search ID)"
          value={
            candidates.find((item) => item.id === currentId)?.type === type ||
            type == null
              ? currentId
              : null
          }
          onChange={(id) => {
            if (id != null) intents.replaceEndpoint(endpoint, id);
          }}
        />
      </div>
    </div>
  );
}

/** Native class controls for every record in the inspected direction. */
function DirectionRelations({
  state,
  intents,
}: {
  state: RelationSlice;
  intents: RelationIntents;
}): React.JSX.Element {
  const selected = state.relations.find((item) => item.id === state.selectedId);
  const records =
    selected?.records.filter((item) => item.source === selected.source) ?? [];
  return (
    <div data-testid="direction-relations">
      {records.map((record) => (
        <div
          key={record.id}
          data-relation-id={record.id}
          role="group"
          tabIndex={state.disabled ? -1 : 0}
          aria-label={record.displayId}
          onFocusCapture={() => {
            if (!state.disabled && record.id !== state.selectedId)
              intents.select(record.id);
          }}
        >
          <TweakpanePaneHost<InspectorParams, InspectorParams["outputData"]>
            definition={relationRecordDefinition}
            paneParams={{
              inputtedData: {
                selectedId: record.id,
                directionId: record.source,
                classId: record.classId,
              },
              internalData: state,
              settings: { disabled: state.disabled, hidden: false },
            }}
            onInputChange={({ classId }) => {
              if (classId != null && classId !== record.classId)
                intents.setClass(classId, record.id);
            }}
            mapOutputChange={({ outputData }) => outputData}
          />
        </div>
      ))}
    </div>
  );
}

const recordBuilder = PaneElementFactoryBuilder.withoutEvents(defaults);
const relationRecordDefinition: TweakpanePaneDefinition<InspectorParams> = {
  factory: recordBuilder.sequential([
    recordBuilder.text({
      options: ({ inputtedData: { selectedId }, computedData: { state } }) => ({
        label: "ID",
        value:
          state?.relations
            .flatMap((item) => item.records)
            .find((item) => item.id === selectedId)?.displayId ?? "",
        parse: (value: string) => value,
        format: (value: string) => value,
        disabled: true,
      }),
    }),
    recordBuilder.list(["inputtedData", "classId"], {
      options: ({
        computedData: { state },
        inputtedData: { selectedId, classId },
        settings,
      }) => {
        const record = state?.relations
          .flatMap((item) => item.records)
          .find((item) => item.id === selectedId);
        const classes = state?.classes ?? [];
        return {
          label: "Relation class",
          options: [
            ...(classId != null && !classes.some((item) => item.id === classId)
              ? [{ text: record?.name ?? "", value: classId }]
              : []),
            ...classes.map((item) => ({ text: item.name, value: item.id })),
          ],
          ...settings,
        };
      },
    }),
  ]),
  dataProcessor: {
    computeData: (_input, state) => ({ state }),
    outputData: ({ inputtedData }) => inputtedData,
  },
};

export function RelationInspector(): React.JSX.Element {
  const state = useRelationSelector((slice) => slice);
  const intents = useEditorIntents<{ relation: RelationIntents }>().relation;
  const selected = state.relations.find((item) => item.id === state.selectedId);
  const endpointSelector = (endpoint: "source" | "target") => (
    <EndpointFields
      key={`${state.selectedId}:${selected?.[endpoint]}`}
      endpoint={endpoint}
      state={state}
      intents={intents}
    />
  );
  const items = useMemo(
    () =>
      state.relations.map((relation) => ({
        id: relation.id,
        text: `${relation.displayId} — ${relation.name}: ${relation.source} ${relation.records?.some((item) => item.reversed) ? "↔" : "→"} ${relation.target}${relation.visible ? "" : " (outside view)"}`,
      })),
    [state.relations],
  );
  const paneParams = useMemo(
    () => ({
      inputtedData: {
        hidden: selected?.hidden ?? false,
        selectedId: state.selectedId,
        directionId: selected?.source ?? null,
        classId: state.classId,
      },
      settings: { disabled: state.disabled, hidden: false },
      internalData: state,
    }),
    [state],
  );
  return (
    <div data-testid="relation-inspector">
      <TweakpanePaneHost<
        InspectorParams,
        InspectorParams["outputData"],
        InspectorEvents
      >
        definition={(slots) => createInspectorDefinition(slots)}
        paneEventTypes={["source", "target", "draw", "add"]}
        paneParams={paneParams}
        onInputChange={({ classId, selectedId, directionId, hidden }) => {
          if (
            selected != null &&
            (hidden ?? false) !== (selected.hidden ?? false)
          ) {
            intents.setHidden(selected.id, hidden ?? false);
          }
          if (directionId !== (selected?.source ?? null)) {
            const record = selected?.records.find(
              (item) => item.source === directionId,
            );
            if (record != null) intents.select(record.id);
            else if (directionId == null) intents.select(null);
            return;
          }
          if (selectedId !== state.selectedId) {
            intents.select(selectedId);
            return;
          }
          if (classId != null && classId !== state.classId)
            intents.setClass(classId);
        }}
        mapOutputChange={({ outputData }): InspectorParams["outputData"] =>
          outputData
        }
        onPaneEvent={({ type }) => {
          if (type === "add") {
            void intents.add();
          } else if (type === "draw") {
            if (state.mode === "create") intents.cancel();
            else if (state.classId != null) intents.setMode("create");
          } else intents.setMode(type);
        }}
        slots={{
          records: <DirectionRelations state={state} intents={intents} />,
          source: endpointSelector("source"),
          target: endpointSelector("target"),
          selection: (
            <VirtualCombobox
              disabled={state.disabled}
              items={items}
              nullText="(New relation)"
              value={state.selectedId}
              onChange={(id) => intents.select(id)}
            />
          ),
        }}
      />
    </div>
  );
}

export function RelationOverlay(): React.JSX.Element {
  const active = useRelationSelector((slice) => slice.active);
  return (
    <LayerOverlayView
      panels={[
        {
          key: "inspector",
          title: "Relations",
          hidden: !active,
          content: (
            <div
              style={{ width: "384px", maxHeight: "256px", overflowY: "auto" }}
            >
              <RelationInspector />
            </div>
          ),
        },
      ]}
      tooltips={[]}
    />
  );
}

interface PreferencesParams {
  inputtedData: RelationSettings;
  computedData: {};
  settings: { disabled: boolean; hidden: boolean };
  internalData: {};
  outputData: RelationSettings;
}
const preferencesBuilder = PaneElementFactoryBuilder.withoutEvents({
  inputtedData: defaultRelationSettings,
  computedData: {},
  settings: { disabled: false, hidden: false },
});
const preferencesDefinition: TweakpanePaneDefinition<PreferencesParams> = {
  factory: preferencesBuilder.sequential([
    preferencesBuilder.input(["inputtedData", "hoverColor"], {
      options: ({ settings }) => ({
        label: "Hover color",
        color: { alpha: false, type: "float" },
        ...settings,
      }),
    }),
    preferencesBuilder.input(["inputtedData", "selectColor"], {
      options: ({ settings }) => ({
        label: "Select color",
        color: { alpha: false, type: "float" },
        ...settings,
      }),
    }),
    preferencesBuilder.input(["inputtedData", "lineWidth"], {
      options: ({ settings }) => ({
        label: "Line thickness",
        min: 1,
        max: 20,
        step: 1,
        ...settings,
      }),
    }),
    preferencesBuilder.input(["inputtedData", "showTooltips"], {
      options: ({ settings }) => ({ label: "Show tooltips", ...settings }),
    }),
  ]),
  dataProcessor: {
    computeData: () => ({}),
    outputData: ({ inputtedData }) => inputtedData,
  },
};

export function RelationPreferences(): React.JSX.Element {
  const settings = useRelationSelector((slice) => slice.settings);
  const intents = useEditorIntents<{ relation: RelationIntents }>().relation;
  const paneParams = useMemo(
    () => ({
      inputtedData: settings,
      settings: { disabled: false, hidden: false },
    }),
    [settings],
  );
  return (
    <div data-testid="relation-preferences">
      <TweakpanePaneHost<PreferencesParams, RelationSettings>
        definition={preferencesDefinition}
        paneParams={paneParams}
        mapOutputChange={({ inputtedData }) => inputtedData}
        onInputChange={(values) => intents.setSettings(values)}
      />
    </div>
  );
}
