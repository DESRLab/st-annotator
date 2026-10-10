import { default as React } from "react";

import {
  definePane,
  TweakpanePaneHost,
} from "../widgets/TweakpanePaneHost.react.tsx";
import { PaneElementFactoryBuilder } from "../widgets/pane/PaneElementFactory.tsx";
import type {
  PaneControllerDataProcessor,
  PaneElementParams,
} from "../widgets/pane/PaneController";
import type { PaneElementFactory } from "../widgets/pane/PaneElementFactory.tsx";
import type { ParamsMapper } from "../widgets/pane/WrapperPaneElement.tsx";

import { createActionsGridPaneElementFactory } from "./ActionGridPane.react.tsx";
import type {
  ActionsGridPaneControllerParams,
  ActionsGridPaneOptions,
} from "./ActionGridPane.react.tsx";

export interface BaseActionDefinition<Action extends string = string> {
  value: Action;
  role: "base";
}

export interface SelectableActionDefinition<Action extends string = string> {
  value: Action;
  role: "selectable";
  label: string;
  keyCombo: string;
  keybindName: string;
}

export type ActionPaneActionDefinition<Action extends string = string> =
  BaseActionDefinition<Action> | SelectableActionDefinition<Action>;

export type ActionOf<
  Definitions extends readonly ActionPaneActionDefinition[],
> = Definitions[number]["value"];

export interface ActionPaneSettings {
  disabled: boolean;
  hidden: boolean;
}

export interface ActionPaneControllerParams<Action extends string> {
  inputtedData: { action: Action };
  computedData: {};
  settings: ActionPaneSettings;
  internalData: {};
  outputData: { action: Action };
}

export type ActionPaneElementParams<Action extends string> = PaneElementParams<
  ActionPaneControllerParams<Action>
>;

export interface ActionPaneViewProps<Action extends string> {
  paneParams: Pick<
    ActionPaneControllerParams<Action>,
    "inputtedData" | "settings"
  > &
    Partial<Pick<ActionPaneControllerParams<Action>, "internalData">>;
  onInputChange: (change: { action: Action }) => void;
}

function parseActionDefinitions<Action extends string>(
  definitions: readonly ActionPaneActionDefinition<Action>[],
) {
  const baseActions = definitions.filter(
    (definition): definition is BaseActionDefinition<Action> =>
      definition.role === "base",
  );
  if (baseActions.length !== 1)
    throw new Error("An action pane requires exactly one base action");

  return {
    baseAction: baseActions[0].value,
    selectableActions: definitions.filter(
      (definition): definition is SelectableActionDefinition<Action> =>
        definition.role === "selectable",
    ),
  };
}

export function createActionPane<
  const Definitions extends readonly ActionPaneActionDefinition[],
>(definitions: Definitions) {
  type Action = ActionOf<Definitions>;

  const { baseAction, selectableActions } =
    parseActionDefinitions<Action>(definitions);
  const gridOptions: ActionsGridPaneOptions<Action> = {
    actions: selectableActions.map(({ value, label }) => ({
      value,
      label,
    })),
  };
  const actionPaneFactoryParams: ActionPaneElementParams<Action> = {
    inputtedData: { action: baseAction },
    computedData: {},
    settings: { disabled: false, hidden: false },
  };

  const actionPaneGridParamsMapper: ParamsMapper<
    ActionPaneElementParams<Action>,
    PaneElementParams<ActionsGridPaneControllerParams<Action>>
  > = {
    outerToInner: (outer) => ({
      inputtedData: {
        isActionSelected: Object.fromEntries(
          gridOptions.actions.map(({ value }) => [
            value,
            outer.inputtedData.action === value,
          ]),
        ) as Record<Action, boolean>,
      },
      computedData: outer.computedData,
      settings: outer.settings,
    }),
    innerToOuter: (inner) => {
      const selectedAction = gridOptions.actions.find(
        ({ value }) => inner.inputtedData.isActionSelected[value],
      )?.value;
      return { inputtedData: { action: selectedAction ?? baseAction } };
    },
  };

  function createActionPaneElementFactory(): PaneElementFactory<
    ActionPaneElementParams<Action>
  > {
    const builder = PaneElementFactoryBuilder.withoutEvents(
      actionPaneFactoryParams,
    );
    return builder.sequential([
      builder.mapped(
        createActionsGridPaneElementFactory(gridOptions),
        actionPaneGridParamsMapper,
        builder.identityEventMapper(),
      ),
    ]);
  }

  const actionPaneDataProcessor: PaneControllerDataProcessor<
    ActionPaneControllerParams<Action>
  > = {
    computeData: () => ({}),
    outputData: ({ inputtedData: { action } }) => ({ action }),
  };
  const actionPaneDefinition = definePane({
    dataProcessor: actionPaneDataProcessor,
    factory: createActionPaneElementFactory(),
  });

  function ActionPaneView({
    paneParams,
    onInputChange,
  }: ActionPaneViewProps<Action>): React.JSX.Element {
    return (
      <TweakpanePaneHost
        definition={actionPaneDefinition}
        mapOutputChange={({ inputtedData }) => inputtedData}
        onInputChange={onInputChange}
        paneParams={paneParams}
      />
    );
  }

  return {
    baseAction,
    actionPaneFactoryParams,
    actionPaneDataProcessor,
    createActionPaneElementFactory,
    ActionPaneView,
  };
}
