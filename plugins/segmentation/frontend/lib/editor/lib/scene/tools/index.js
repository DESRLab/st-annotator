export { SelectionCurator } from './SelectionCurator';

export { BrushCurator, SelectionParametricCurator } from './parametric';
export { LassoCurator, PolygonCurator, RectangleCurator } from './vertex';

/* eslint-disable max-len */
/**
 * @typedef {import('./SelectionCurator').VertexGeo} VertexGeo
 */

/**
 * @typedef {import('./SelectionCurator').ParametricGeo} ParametricGeo
 */

/**
 * @template {ParametricGeo | VertexGeo} T
 * @typedef {import('./SelectionCurator').SelectionCuratorEventMap<T>} SelectionCuratorEventMap
 */

/**
 * @typedef {import('./SelectionCurator').ToolTypes} ToolTypes
 */

/**
 * @typedef {import('./SelectionCurator').ObjQuery} ObjQuery
 */
/* eslint-enable max-len */
