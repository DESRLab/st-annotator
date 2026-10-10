import { default as React } from "react";

import { TweakpanePaneHost } from "../widgets/TweakpanePaneHost.react.tsx";
import { PaneElementFactoryBuilder } from "../widgets/pane/PaneElementFactory.tsx";
import type {
  PaneControllerDataProcessor,
  PaneElementParams,
} from "../widgets/pane/PaneController";
import type { PaneElementFactory } from "../widgets/pane/PaneElementFactory.tsx";

export interface ActionsGridPaneAction<Action extends string> {
  value: Action;
  label: string;
}

export interface ActionsGridPaneOptions<Action extends string> {
  actions: readonly ActionsGridPaneAction<Action>[];
  label?: string;
}

interface ActionsGridInputtedData<Action extends string> {
  isActionSelected: Record<Action, boolean>;
}

interface ActionsGridPaneSettings {
  disabled: boolean;
  hidden: boolean;
}
interface ActionsGridSelection<Action extends string> {
  isActionSelected: Record<Action, boolean>;
}

export interface ActionsGridPaneControllerParams<Action extends string> {
  inputtedData: ActionsGridInputtedData<Action>;
  computedData: {};
  settings: ActionsGridPaneSettings;
  internalData: {};
  outputData: ActionsGridSelection<Action>;
}

type ActionsGridPaneElementParams<Action extends string> = PaneElementParams<
  ActionsGridPaneControllerParams<Action>
>;
type BooleanKey<T> = Extract<
  keyof { [K in keyof T as T[K] extends boolean ? K : never]: true },
  string
>;

export function createActionsGridPaneFactoryParams<Action extends string>(
  options: ActionsGridPaneOptions<Action>,
): ActionsGridPaneElementParams<Action> {
  return {
    inputtedData: {
      isActionSelected: Object.fromEntries(
        options.actions.map(({ value }) => [value, false]),
      ) as Record<Action, boolean>,
    },
    computedData: {},
    settings: { disabled: false, hidden: false },
  };
}

export function getActionsGridPaneActionSelectSettings<Action extends string>(
  { settings: { disabled, hidden } }: ActionsGridPaneElementParams<Action>,
  options: ActionsGridPaneOptions<Action>,
) {
  return {
    label: options.label ?? "Action",
    size: [options.actions.length, 1] as [number, number],
    cells: (x: number) => ({
      title: options.actions[x]?.label,
      value: options.actions[x]?.value as BooleanKey<Record<Action, boolean>>,
    }),
    isMultiSelect: false,
    disabled,
    hidden,
  };
}

export function createActionsGridPaneElementFactory<Action extends string>(
  options: ActionsGridPaneOptions<Action>,
): PaneElementFactory<ActionsGridPaneElementParams<Action>> {
  const builder = PaneElementFactoryBuilder.withoutEvents(
    createActionsGridPaneFactoryParams(options),
  );

  return builder.sequential([
    builder.selectGrid(["inputtedData", "isActionSelected"], {
      options: (paneParams) =>
        getActionsGridPaneActionSelectSettings(paneParams, options),
      modifyHTML: (element) => {
        const labelContainer = element.querySelector(".tp-lblv_l");
        if (labelContainer instanceof HTMLDivElement)
          labelContainer.style.display = "none";
        else console.warn("Cannot find label container");

        const buttonsContainer = element.querySelector(".tp-lblv_v");
        if (buttonsContainer instanceof HTMLDivElement)
          buttonsContainer.style.width = "100%";
        else console.warn("Cannot find buttons container");
      },
    }),
  ]);
}

export const actionsGridPaneDataProcessor: PaneControllerDataProcessor<
  ActionsGridPaneControllerParams<string>
> = {
  computeData: () => ({}),
  outputData: ({ inputtedData: { isActionSelected } }) => ({
    isActionSelected,
  }),
};

interface ActionsGridPaneViewProps<Action extends string> {
  paneParams: Pick<
    ActionsGridPaneControllerParams<Action>,
    "inputtedData" | "settings"
  > &
    Partial<Pick<ActionsGridPaneControllerParams<Action>, "internalData">>;
  options: ActionsGridPaneOptions<Action>;
  onInputChange: (change: ActionsGridSelection<Action>) => void;
}

export function ActionsGridPaneView<Action extends string>({
  paneParams,
  options,
  onInputChange,
}: ActionsGridPaneViewProps<Action>): React.JSX.Element {
  return (
    <TweakpanePaneHost
      definition={{
        dataProcessor: actionsGridPaneDataProcessor,
        factory: createActionsGridPaneElementFactory(options),
      }}
      onInputChange={onInputChange}
      paneParams={paneParams}
    />
  );
}
