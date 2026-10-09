import _ from 'lodash';

/**
 * Redirects concurrent calls of a function with the same arguments to the
 * same promise instance.
 * 
 * @template {unknown[]} TArgs
 * @template TValue
 * @param {(...args: TArgs) => Promise<TValue>} fn The function to have its output memoized.
 * @returns {(...args: TArgs) => Promise<TValue>} The new memoized function.
 */
export function tempMemoize(fn) {
    /**
     * @type {Map<TArgs, Promise<TValue>>}
     */
    const tasks = new Map();

    /**
     * @type {(k1: TArgs, k2: TArgs) => boolean}
     */
    const keysAreEqual = (k1, k2) => _.zip(k1, k2).every(([a, b]) => a === b);

    return (...args) => {
        for (const [cachedArgs, cachedPromise] of tasks.entries()) {
            if (keysAreEqual(cachedArgs, args)) return cachedPromise;
        }

        const task = fn(...args)
            .finally(() => {
                for (const cachedArgs of tasks.keys()) {
                    if (keysAreEqual(cachedArgs, args)) {
                        tasks.delete(cachedArgs);
                        break;
                    }
                }
            });

        tasks.set(args, task);

        return task;
    };
}

/**
 * @template TValue
 * @template {any[]} [TArgs=[]]
 * @typedef {TValue | ((...args: TArgs) => TValue)} ValueOrGetFunc
 */

/**
 * Normalizes a value that is potentially evaluated through calling it, such that it is always so.
 * 
 * @template {any[]} TArgs
 * @template TReturn
 * @param {ValueOrGetFunc<TReturn, TArgs>} valueOrGetFunc The value to normalize.
 * @returns {(...args: TArgs) => TReturn} The normalized value.
 */
export function makeGetFunc(valueOrGetFunc) {
    // @ts-expect-error
    return (typeof valueOrGetFunc === 'function') ? valueOrGetFunc
        : (() => valueOrGetFunc);
}

/**
 * @typedef {object} RepeatingTimerOptions
 * @property {() => void} action The function that is invoked at the end of each period.
 * @property {number | (() => number)} [periodMillis=1000] The duration of each period,
 * in milliseconds.
 */

/**
 * Invokes a callback at a set interval.
 */
export class RepeatingTimer {

    /**
     * @type {?ReturnType<setInterval>}
     */
    #timer = null;

    /**
     * `true` if {@link RepeatingTimer#action} is being recurrently invoked;
     * otherwise. `false`.
     * 
     * @type {boolean}
     */
    get isActive() { return this.#timer != null; }

    set isActive(value) {
        if (value) {
            this.start();
        } else {
            this.stop();
        }
    }

    /**
     * @type {() => void}
     */
    #action;

    /**
     * The function that is invoked at the end of each period.
     * 
     * @returns {() => void} The function that is invoked at the end of each period.
     */
    get action() { return this.#action; }

    set action(value) {
        if (this.#action !== value) {
            this.#action = value;

            this.#refresh();
        }
    }

    /**
     * @type {number | (() => number)}
     */
    #periodMillis;

    /**
     * The duration of each period, in milliseconds.
     * 
     * @type {number | (() => number)}
     */
    get periodMillis() { return this.#periodMillis; }

    set periodMillis(value) {
        if (this.#periodMillis !== value) {
            this.#periodMillis = value;

            this.#refresh();
        }
    }

    #refresh() {
        if (this.isActive) {
            this.stop();
            this.start();
        }
    }

    /**
     * Creates a new repeatable timer.
     * 
     * @param {RepeatingTimerOptions} options The options of the timer.
     */
    constructor(options) {
        this.#action = options.action;
        this.#periodMillis = options.periodMillis ?? 1000;
    }

    #onTimeout = () => {
        this.#action();

        // In case this.stop() is called by this.#action(), we need to stop the loop
        if (this.#timer == null) return;

        this.#setTimeout();
    };

    #setTimeout() {
        if (typeof this.#periodMillis === 'function') {
            this.#timer = setTimeout(this.#onTimeout, this.#periodMillis());
        } else {
            this.#timer = setTimeout(this.#onTimeout, this.#periodMillis);
        }
    }

    /**
     * Starts the timer so that {@link RepeatingTimer#action} is recurrently invoked.
     * 
     * If the timer is already active, resets the period.
     */
    start() {
        if (this.#timer != null) this.stop();

        this.#setTimeout();
    }

    /**
     * Stops the timer so that {@link RepeatingTimer#action} is no longer recurrently invoked.
     */
    stop() {
        if (this.#timer == null) return;

        clearTimeout(this.#timer);
        this.#timer = null;
    }
}

/**
 * @template I The type of input.
 * @template O The type of output.
 * @typedef {object} BatcherOptions
 * @property {(inputs: ReadonlyArray<I>) => PromiseLike<ReadonlyArray<O>>} batchJob A function that
 * accepts one or more inputs, and returns the result of the job on each (in the same order).
 * @property {number} [batchSize=8] The maximum number of jobs to run in each batch.
 * @property {number} [delay=1] The number of milliseconds between two consecutive batches.
 */

/**
 * Executes a job in batches.
 * 
 * @template I The type of input.
 * @template O The type of output.
 */
export class Batcher {

    /**
     * A function that accepts one or more inputs, and returns the result of
     * the job on each (in the same order).
     * 
     * @readonly
     * @type {(inputs: ReadonlyArray<I>) => PromiseLike<ReadonlyArray<O>>}
     */
    batchJob;

    /**
     * @type {number}
     */
    #batchSize;

    /**
     * The maximum number of jobs to run in each batch.
     * 
     * @type {number}
     */
    get batchSize() { return this.#batchSize; }

    set batchSize(value) {
        if (value <= 0 || !Number.isInteger(value)) {
            throw new Error('The batch size must be a positive integer');
        }

        this.#batchSize = value;
    }

    /**
     * @type {number}
     */
    #delay;

    /**
     * The number of milliseconds between two consecutive batches.
     * 
     * @type {number}
     */
    get delay() { return this.#delay; }

    set delay(value) {
        if (value < 0) {
            throw new Error('The minimum delay must be non-negative');
        }

        this.#delay = value;
    }

    /**
     * @type {[I, (output: O) => void, (reason: any) => void][]}
     */
    #items = [];

    /**
     * @readonly
     * @type {RepeatingTimer}
     */
    #timer = new RepeatingTimer({
        periodMillis: () => this.delay,
        action: async () => {
            const batchItems = this.#items.splice(0, this.batchSize);
            if (batchItems.length === 0) return;

            /** @type {[I[], ((output: O) => void)[], ((reason: any) => void)[]]} */
            // @ts-expect-error
            const [batchInputs, batchResolves, batchRejects] = _.unzip(batchItems);

            try {
                const batchOutputs = await this.batchJob(batchInputs);
                batchOutputs.forEach((output, i) => {
                    try {
                        batchResolves[i](output);
                    } catch (e1) {
                        // Avoid skipping other items
                        console.error(e1);
                    }
                });
            } catch (e) {
                batchRejects.forEach((reject) => {
                    try {
                        reject(e);
                    } catch (e2) {
                        // Avoid skipping other items
                        console.error(e2);
                    }
                });
            }
        },
    });

    /**
     * Creates a new batcher for a job.
     * 
     * @param {BatcherOptions<I, O>} options The options of the batcher.
     */
    constructor({ batchJob, batchSize = 8, delay = 1 }) {
        this.batchJob = batchJob;
        this.batchSize = batchSize;
        this.delay = delay;

        this.#timer.start();
    }

    /**
     * Queues the job to be run with the given input.
     * 
     * @param {I} input The input to the job.
     * @returns {Promise<O>} A promise that resolves to the output of the job.
     */
    async apply(input) {
        return new Promise((resolve, reject) => {
            this.#items.push([input, resolve, reject]);
        });
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#timer.stop();
    }
}
