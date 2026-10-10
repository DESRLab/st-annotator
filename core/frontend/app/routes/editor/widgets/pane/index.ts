/**
 * Facilitates the composition of `tweakpane` elements.
 *
 * Each native `tweakpane` definition is hosted by React and rendered through a
 * {@link PaneElement} using the data flow defined by {@link PaneControllerDataProcessor}.
 *
 * Unlike in `tweakpane`, {@link PaneElement}s can be specified in advance (i.e., prior to
 * constructing the pane) through the use of {@link PaneElementFactory}; these factory instances
 * can in turn be created by {@link PaneElementFactoryBuilder}.
 *
 * We implement {@link PaneElement} in a way that makes {@link PaneElementFactory} composable.
 * More specifically, {@link PaneElementFactoryBuilder#sequential} and
 * {@link PaneElementFactoryBuilder#mapped} can be used to wrap child {@link PaneElementFactory}
 * instances inside a parent {@link PaneElementFactory} instance.
 *
 * Child factory parameters are composed with typed {@link ParamsMapper} values.
 */

import {
  createPaneFactory,
  lazyPaneFactory,
  mapPane,
  PaneElementFactoryBuilder,
  withPaneState,
} from "./PaneElementFactory.tsx";

export type {
  PaneControllerDataProcessor,
  PaneElementParams,
  PaneControllerDataTypes,
  PaneControllerChangeEvent,
  PaneControllerEventMap,
} from "./PaneController";
export type { _PaneElement, PaneElement } from "./PaneElement";
export type {
  AttachElementFunc,
  ImmutableParamsWithState,
  PaneElementBuilderContext,
  PaneElementEventTypes,
  PaneElementFactory,
  PartialPaneElementConfig,
  TableCellSpec,
  TabPageSpec,
  TweakpaneOptions,
} from "./PaneElementFactory.tsx";
export type {
  ParamsMapper,
  EventsMapper,
  DeepPartial,
  Partial2,
} from "./WrapperPaneElement.tsx";
export type { PaneLike, TweakpaneEventHandlers } from "./UnitPaneElement.tsx";
export type { TabApiEvents } from "./CompositePaneElement.tsx";
export { definePaneElements, paneControls } from "./DeclarativePane.ts";
export type { PaneControl, PaneControls } from "./DeclarativePane.ts";

export {
  createPaneFactory,
  lazyPaneFactory,
  mapPane,
  PaneElementFactoryBuilder,
  withPaneState,
};
