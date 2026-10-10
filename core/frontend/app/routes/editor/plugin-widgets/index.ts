/**
 * Widget panes shared by the label plugins.
 *
 * @module app/editor
 */

export { createActionPane } from "./ActionPane.react.tsx";
export type {
  ActionPaneActionDefinition,
  BaseActionDefinition,
  SelectableActionDefinition,
  ActionOf,
  ActionPaneControllerParams,
  ActionPaneElementParams,
  ActionPaneSettings,
  ActionPaneViewProps,
} from "./ActionPane.react.tsx";

export {
  createLabelClassSelectionPaneElementFactory,
  getLabelClassSelectionItemText,
  getLabelClassSelectionOutputData,
  labelClassSelectionPaneDataProcessor,
  labelClassSelectionPaneFactoryParams,
  labelClassSelectionRenderTriggers,
} from "./LabelClassSelectionPane.ts";
export type {
  LabelClassSelectionPaneOptions,
  LabelClassIndexEventMap,
  LabelClassSelectionItem,
  LabelClassSelectionPaneControllerParams,
  LabelClassSelectionPaneElementParams,
} from "./LabelClassSelectionPane.ts";
