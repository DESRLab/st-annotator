import { PaneElementFactoryBuilder } from "../widgets/pane/PaneElementFactory";
import type { InspectorPaneRenderTrigger } from "../widgets/InspectorPaneRenderTrigger";
import type {
  PaneControllerDataProcessor,
  PaneElementParams,
} from "../widgets/pane/PaneController";
import type { PaneElementFactory } from "../widgets/pane/PaneElementFactory";

/** The label-class members this pane displays. */
export interface LabelClassSelectionItem {
  readonly id: number;
  readonly name: string;
}

export interface LabelClassSelectionPaneOptions {
  header?: string;
  nullText?: string;
}

export interface LabelClassSelectionPaneControllerParams {
  inputtedData: { classId: number | null };
  computedData: { classes: ReadonlyMap<number, LabelClassSelectionItem> };
  settings: { disabled: boolean; hidden: boolean };
  internalData: {
    classes: ReadonlyMap<number, LabelClassSelectionItem>;
  } | null;
  outputData: { classId: number | null };
}

export type LabelClassSelectionPaneElementParams =
  PaneElementParams<LabelClassSelectionPaneControllerParams>;

/** The index events that change what this pane displays. */
export interface LabelClassIndexEventMap {
  "class-add": {};
  "class-delete": {};
  "bulk-add": {};
  "bulk-delete": {};
  "class-update": { propertyKey: string };
}

/** Refresh triggers for item counts and displayed class names. */
export const labelClassSelectionRenderTriggers: InspectorPaneRenderTrigger<LabelClassIndexEventMap> =
  {
    "class-add": true,
    "class-delete": true,
    "bulk-add": true,
    "bulk-delete": true,
    "class-update": (event) => event.propertyKey === "name",
  };

export function getLabelClassSelectionOutputData({
  inputtedData: { classId },
  computedData: { classes },
}: LabelClassSelectionPaneElementParams): { classId: number | null } {
  return {
    classId: classId != null && !classes.has(classId) ? null : classId,
  };
}

export const labelClassSelectionPaneFactoryParams: LabelClassSelectionPaneElementParams =
  {
    inputtedData: { classId: null },
    computedData: { classes: new Map() },
    settings: { disabled: false, hidden: false },
  };

export function getLabelClassSelectionItemText(
  item: LabelClassSelectionItem,
): string {
  return item.name;
}

export function createLabelClassSelectionPaneElementFactory(
  options: LabelClassSelectionPaneOptions = {},
): PaneElementFactory<LabelClassSelectionPaneElementParams> {
  const header = options.header ?? "Object Class";
  const nullText = options.nullText ?? "(No class selected)";
  const builder = PaneElementFactoryBuilder.withoutEvents(
    labelClassSelectionPaneFactoryParams,
  );

  return builder.sequential([
    builder.list(["inputtedData", "classId"], {
      options: ({
        computedData: { classes },
        settings: { disabled, hidden },
      }) => ({
        label: header,
        options: [
          { text: nullText, value: null },
          ...Array.from(classes.values(), (item) => ({
            text: getLabelClassSelectionItemText(item),
            value: item.id,
          })),
        ],
        disabled,
        hidden,
      }),
    }),
  ]);
}

export const labelClassSelectionPaneDataProcessor: PaneControllerDataProcessor<LabelClassSelectionPaneControllerParams> =
  {
    computeData: (_inputtedData, internalData) => ({
      classes: internalData?.classes ?? new Map(),
    }),
    outputData: getLabelClassSelectionOutputData,
  };
