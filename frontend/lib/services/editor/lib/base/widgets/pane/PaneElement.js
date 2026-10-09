/**
 * @typedef {import('three')} THREE
 */

/**
 * @template T
 * @typedef {import('../../../../../../common/lib/utils').TypeUtils.Expand<T>} Expand
 */

/**
 * @template T
 * @typedef {import('../../../../../../common/lib/utils').TypeUtils.Immutable<T>} Immutable
 */

/**
 * @interface
 * @template P The type of parameters (props) passed to the element.
 * @see PaneElement
 */
export class _PaneElement {

    /**
     * Disposes of this pane element. Do not use it afterwards.
     * 
     * @abstract
     */
    dispose() {
        throw new Error('Not implemented');
    }

    /**
     * Updates this pane element with the given parameters (props).
     * 
     * @abstract
     * @param {Immutable<P>} params The input parameters.
     */
    render(params) {
        throw new Error('Not implemented');
    }

    /**
     * Updates the parameters with the ones that are currently represented by this pane element.
     * 
     * @abstract
     * @param {P} params The parameters to update.
     */
    updateParams(params) {
        throw new Error('Not implemented');
    }
}

/**
 * Represents an element of a `tweakpane` pane containing information to display to the user.
 * 
 * @template P The type of parameters (props) passed to the element.
 * @template {{}} E The type of event emitted by the element.
 * @typedef {Expand<_PaneElement<P> & THREE.EventDispatcher<E>>} PaneElement
 */

/**
 * Attaches event handlers to a `tweakpane` element.
 * 
 * @template P
 * @template {{}} E
 * @template {ReadonlyArray<string>} EventNames
 * @template {Record<EventNames[number], (element: PaneElement<P, E>, ev: any) => void>} THandler
 * @param {PaneElement<P, E>} paneElem The pane element that wraps the `tweakpane` element.
 * @param {[...EventNames]} eventNames The name of each `tweakpane` event supported by the
 * `tweakpane` element.
 * @param {Partial<THandler>} handlers The handlers to attach.
 * @param {{
 *     on<EventName extends EventNames[number]>(
 *         eventName: EventName,
 *         handler: (ev: Parameters<THandler[EventName]>[1]) => void
 *     ): unknown
 * }} tweakpaneElem The `tweakpane` element being wrapped.
 */
export function bindHandlers(paneElem, eventNames, handlers, tweakpaneElem) {
    for (const eventName of eventNames) {
        const handler = handlers[eventName];

        if (handler !== undefined) {
            tweakpaneElem.on(eventName, (ev) => handler(paneElem, ev));
        }
    }
}

/**
 * Attempts to assign each attribute in `attrs` to `target`.
 * 
 * @template T
 * @param {object} target The target to assign the attributes to.
 * @param {Immutable<T>} attrs The attributes to assign.
 * @returns {Partial<T>} A subset of `attrs` containing the entries that are
 * not assignable to `target`.
 */
export function safeAssign(target, attrs) {
    /**
     * @type {Partial<T>}
     */
    const unsafeEntries = {};

    for (const [k, v] of Object.entries(attrs)) {
        if (k in target) {
            // Avoid unnecessary updates
            // @ts-expect-error
            if (target[k] !== v) {
                try {
                    // @ts-expect-error
                    target[k] = v;
                } catch (e) {
                    // @ts-expect-error
                    unsafeEntries[k] = v;
                }
            }
        } else {
            // @ts-expect-error
            unsafeEntries[k] = v;
        }
    }

    return unsafeEntries;
}
