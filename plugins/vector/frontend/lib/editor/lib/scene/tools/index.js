/**
 * @typedef {import('./LabelVectorClipboard').VectorClipboardData} VectorClipboardData
 */

/**
 * @typedef {import('sta/services/editor/core').ClipboardEventMap<VectorClipboardData>
 * } LabelVectorClipboardEventMap
 */

/**
 * @typedef {import('./VectorCreator').VectorCreatorEventMap} VectorCreatorEventMap
 */

export { VectorCreator } from './VectorCreator';
export { PolylineCreator } from './Polyline';
export { PolygonCreator } from './Polygon';
export { PointCreator } from './Point';
export { LabelVectorClipboard } from './LabelVectorClipboard';
