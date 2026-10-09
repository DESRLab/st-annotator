/**
 * Facilitates the composition of `tweakpane` elements.
 * 
 * Each `tweakpane` pane is represented by a {@link PaneController}. The controller stores state
 * and uses it to render each {@link PaneElement} in the pane based on the data flow defined by
 * {@link PaneControllerDataProcessor}.
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
 * We also make the arguments to {@link PaneController} composable to some extent: given a
 * {@link PaneControllerDataProcessor} that is defined for a child {@link PaneElementFactory},
 * a mapper class {@link PaneControllerDataMapper} can be used to help create the
 * {@link PaneControllerDataProcessor} for the parent {@link PaneElementFactory}.
 * 
 * For a concrete example, please see the file associated with
 * {@link sta/services/editor/core.ColorBlenderPane}.
 * 
 * @module Composable Panes API
 */

import { PaneElementFactoryBuilder } from './PaneElementFactory';
import { PaneController, PaneControllerDataMapper } from './PaneController';

/**
 * @template T
 * @typedef {import('three')} THREE
 */

/**
 * @template P The type of parameters (props) passed to the element.
 * @template {{}} [E={}] The type of event emitted by the element.
 * @typedef {import('./PaneElement').PaneElement<P, E>} PaneElement
 */

/**
 * @template POuter The type of `params` in the wrapper factory.
 * @template PInner The type of `params` in the wrapped factory.
 * @typedef {import('./WrapperPaneElement').ParamsMapper<POuter, PInner>} ParamsMapper
 */

/**
 * @template {{}} EOuter The type of events in the wrapper element.
 * @template {{}} EInner The type of events in the wrapped element.
 * @typedef {import('./WrapperPaneElement').EventsMapper<EOuter, EInner>} EventsMapper
 */

/**
 * @template P The type of parameters (props) passed to the element.
 * @template {{}} [E={}] The type of event emitted by the element.
 * @typedef {import('./PaneElementFactory').PaneElementFactory<P, E>} PaneElementFactory
 */

/**
 * @typedef {import('./PaneController').PaneControllerDataTypes} PaneControllerDataTypes
 */

/**
 * @template {PaneControllerDataTypes} P The types of data in the controller.
 * @typedef {import('./PaneController').PaneElementParams<P>} PaneElementParams
 */

/**
 * @template {PaneControllerDataTypes} P The types of data in the controller.
 * @typedef {import('./PaneController').PaneControllerDataProcessor<P>} PaneControllerDataProcessor
 */

/**
 * @template {PaneControllerDataTypes} P The types of data in the controller.
 * @typedef {import('./PaneController').PaneControllerChangeEvent<P>} PaneControllerChangeEvent
 */

/**
 * @template {PaneControllerDataTypes} P The types of data in the controller.
 * @typedef {import('./PaneController').PaneControllerEventMap<P>} PaneControllerEventMap
 */

/**
 * @template {PaneControllerDataTypes} P The types of data in the controller.
 * @typedef {import('./PaneController').PaneControllerState<P>} PaneControllerState
 */

export { PaneElementFactoryBuilder, PaneController, PaneControllerDataMapper };
