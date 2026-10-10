import { createActionPane } from "sta/app/editor";
import type {
  ActionOf,
  ActionPaneControllerParams as ActionPaneControllerParamsBase,
} from "sta/app/editor";

export const actionDefinitions = [
  { value: "edit", role: "base" },
  {
    value: "select",
    role: "selectable",
    label: "S",
    keyCombo: "s",
    keybindName: "Select vector",
  },
  {
    value: "draw",
    role: "selectable",
    label: "D",
    keyCombo: "d",
    keybindName: "Draw vector",
  },
] as const;

export type Action = ActionOf<typeof actionDefinitions>;
export type ActionPaneControllerParams = ActionPaneControllerParamsBase<Action>;

export const {
  ActionPaneView,
  actionPaneDataProcessor,
  actionPaneFactoryParams,
  baseAction,
  createActionPaneElementFactory,
} = createActionPane(actionDefinitions);
