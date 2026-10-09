import _ from 'lodash';
import * as THREE from 'three';

import { ALL_EVENT_TYPES } from '../data/VectorIndex';

/* eslint-disable max-len */
/**
 * @template T
 * @typedef {import('sta/common/utils').TypeUtils.Immutable<T>} Immutable
 */

/**
 * @typedef {import('../data').VectorIndexEventMap} VectorIndexEventMap
 */

/**
 * @typedef {import('../data').ReadonlyVectorIndex} ReadonlyVectorIndex
 */
/* eslint-enable max-len */

/**
 * For each event in {@link ReadonlyVectorIndex}, return `true` if it should trigger
 * the pane element to be re-rendered.
 * 
 * @typedef {{
 *     [K in Extract<keyof VectorIndexEventMap, string>]?:
 *      boolean | ((event: VectorIndexEventMap[K]) => boolean)
 * }} InspectorPaneRenderTrigger
 */

/**
 * Combines multiple {@link InspectorPaneRenderTrigger}s together such that for any given event,
 * the combined trigger returns `true` if any of its elements returns `true`.
 * 
 * @param {...InspectorPaneRenderTrigger} triggers The triggers to combine together.
 * @returns {InspectorPaneRenderTrigger} The combined trigger.
 */
export function composeRenderTriggers(...triggers) {
    /**
     * @type {InspectorPaneRenderTrigger}
     */
    const combined = {};

    for (const eventType of ALL_EVENT_TYPES) {
        if (triggers.some((trigger) => eventType in trigger)) {
            const combinedTriggerForEventType = (/** @type {any} */ ev) => (
                triggers.some((trigger) => {
                    const triggerForEventType = trigger[eventType];
                    if (typeof triggerForEventType === 'boolean') return triggerForEventType;
                    if (typeof triggerForEventType === 'function') return triggerForEventType(ev);

                    return false;
                })
            );

            // Silence TS2590: Expression produces a union type that is too complex to represent.
            // @ts-ignore
            combined[eventType] = combinedTriggerForEventType;
        }
    }

    return combined;
}

/**
 * Defines each event that can be dispatched by {@link InspectorRenderSignaller}.
 * 
 * @typedef {object} InspectorRenderSignallerEventMap
 * @property {{}} render A signal that the pane element should be re-rendered.
 */

/**
 * Helper class that emits {@link RenderEvent} whenever the observed
 * {@link ReadonlyVectorIndex} emits an event that requires the
 * pane element to be re-rendered.
 * 
 * @augments THREE.EventDispatcher<InspectorRenderSignallerEventMap>
 */
export class InspectorRenderSignaller extends THREE.EventDispatcher {

    /**
     * Defines whether each event requires the pane element to be re-rendered.
     * 
     * @readonly
     * @type {Immutable<InspectorPaneRenderTrigger>}
     */
    trigger;

    /**
     * @readonly
     * @type {Record<string, (ev: any) => void>}
     */
    #listeners;

    /**
     * @type {?ReadonlyVectorIndex}
     */
    #labels;

    /**
     * The collection of labels to observe.
     * 
     * @type {?ReadonlyVectorIndex}
     */
    get labels() { return this.#labels; }

    set labels(value) {
        if (this.#labels !== value) {
            this.#detach(this.#labels);

            this.#labels = value;

            this.#attach(this.#labels);

            this.dispatchEvent({ type: 'render' });
        }
    }

    /**
     * Observes a collection of labels so that {@link RenderEvent}
     * is emitted whenever the pane element should be re-rendered.
     *
     * @param {?ReadonlyVectorIndex} labels The collection to observe.
     */
    #attach(labels) {
        if (labels == null) return;

        for (const eventType of ALL_EVENT_TYPES) {
            const eventListener = this.#listeners[eventType];

            if (eventListener !== undefined) {
                labels.addEventListener(eventType, eventListener);
            }
        }
    }

    /**
     * Unobserves a collection of labels so that {@link RenderEvent}
     * is no longer emitted whenever the pane element should be re-rendered.
     *
     * @param {?ReadonlyVectorIndex} labels The collection to unobserve.
     */
    #detach(labels) {
        if (labels == null) return;

        for (const eventType of ALL_EVENT_TYPES) {
            const eventListener = this.#listeners[eventType];

            if (eventListener !== undefined) {
                labels.removeEventListener(eventType, eventListener);
            }
        }
    }

    /**
     * Creates a new helper class to emit {@link RenderEvent}s by observing a
     * {@link ReadonlyVectorTrackingIndex}.
     * 
     * @param {Immutable<InspectorPaneRenderTrigger>} trigger Defines whether each event
     * requires the pane element to be re-rendered.
     * @param {?ReadonlyVectorIndex} labels The collection of labels to observe.
     */
    constructor(trigger, labels = null) {
        super();

        this.trigger = trigger;

        this.#listeners = _.mapValues(trigger, (triggerForEventType, key) => {
            if (typeof triggerForEventType === 'boolean') {
                return () => {
                    if (triggerForEventType) {
                        this.dispatchEvent({ type: 'render' });
                    }
                };
            }

            if (typeof triggerForEventType === 'function') {
                return (/** @type {any} */ ev) => {
                    if (triggerForEventType(ev)) {
                        this.dispatchEvent({ type: 'render' });
                    }
                };
            }

            console.error('triggerForEventType:', triggerForEventType);
            console.error('key:', key);
            throw new Error('Unknown trigger for event type');
        });

        this.#labels = labels;
        this.#attach(this.#labels);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#detach(this.#labels);
    }
}
