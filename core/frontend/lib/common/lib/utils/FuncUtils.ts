import _ from "lodash";

/**
 * Redirects concurrent calls of a function with the same arguments to the
 * same promise instance.
 */
export function tempMemoize<TArgs extends unknown[], TValue>(
  fn: (...args: TArgs) => Promise<TValue>,
): (...args: TArgs) => Promise<TValue> {
  const tasks = new Map<TArgs, Promise<TValue>>();

  const keysAreEqual = (k1: TArgs, k2: TArgs): boolean =>
    _.zip(k1, k2).every(([a, b]) => a === b);

  return (...args: TArgs): Promise<TValue> => {
    for (const [cachedArgs, cachedPromise] of tasks.entries()) {
      if (keysAreEqual(cachedArgs, args)) return cachedPromise;
    }

    const task = fn(...args).finally(() => {
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
 * Normalizes a value that is potentially evaluated through calling it, such that it is always so.
 */
export type ValueOrGetFunc<TValue, TArgs extends any[] = []> =
  TValue | ((...args: TArgs) => TValue);

export function makeGetFunc<TArgs extends any[], TReturn>(
  valueOrGetFunc: ValueOrGetFunc<TReturn, TArgs>,
): (...args: TArgs) => TReturn {
  return typeof valueOrGetFunc === "function"
    ? (valueOrGetFunc as (...args: TArgs) => TReturn)
    : () => valueOrGetFunc;
}

/**
 * Options for {@link RepeatingTimer}.
 */
export interface RepeatingTimerOptions {
  /** The function that is invoked at the end of each period. */
  action: () => void;
  /** The duration of each period, in milliseconds. */
  periodMillis?: number | (() => number);
}

/**
 * Invokes a callback at a set interval.
 */
export class RepeatingTimer {
  #timer: ReturnType<typeof setInterval> | null = null;

  /**
   * `true` if {@link RepeatingTimer#action} is being recurrently invoked;
   * otherwise. `false`.
   */
  get isActive(): boolean {
    return this.#timer != null;
  }

  set isActive(value: boolean) {
    if (value) {
      this.start();
    } else {
      this.stop();
    }
  }

  #action: () => void;

  /**
   * The function that is invoked at the end of each period.
   */
  get action(): () => void {
    return this.#action;
  }

  set action(value: () => void) {
    if (this.#action !== value) {
      this.#action = value;

      this.#refresh();
    }
  }

  #periodMillis: number | (() => number);

  /**
   * The duration of each period, in milliseconds.
   */
  get periodMillis(): number | (() => number) {
    return this.#periodMillis;
  }

  set periodMillis(value: number | (() => number)) {
    if (this.#periodMillis !== value) {
      this.#periodMillis = value;

      this.#refresh();
    }
  }

  #refresh(): void {
    if (this.isActive) {
      this.stop();
      this.start();
    }
  }

  /**
   * Creates a new repeatable timer.
   */
  constructor(options: RepeatingTimerOptions) {
    this.#action = options.action;
    this.#periodMillis = options.periodMillis ?? 1000;
  }

  #onTimeout = (): void => {
    this.#action();

    // In case this.stop() is called by this.#action(), we need to stop the loop
    if (this.#timer == null) return;

    this.#setTimeout();
  };

  #setTimeout(): void {
    if (typeof this.#periodMillis === "function") {
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
  start(): void {
    if (this.#timer != null) this.stop();

    this.#setTimeout();
  }

  /**
   * Stops the timer so that {@link RepeatingTimer#action} is no longer recurrently invoked.
   */
  stop(): void {
    if (this.#timer == null) return;

    clearTimeout(this.#timer);
    this.#timer = null;
  }
}

/**
 * Options for {@link Batcher}.
 */
export interface BatcherOptions<I, O> {
  /** A function that accepts one or more inputs, and returns the result of the job on each (in the same order). */
  batchJob: (inputs: readonly I[]) => PromiseLike<readonly O[]>;
  /** The maximum number of jobs to run in each batch. */
  batchSize?: number;
  /** The number of milliseconds between two consecutive batches. */
  delay?: number;
}

/**
 * Executes a job in batches.
 */
export class Batcher<I, O> {
  /**
   * A function that accepts one or more inputs, and returns the result of
   * the job on each (in the same order).
   */
  batchJob: (inputs: readonly I[]) => PromiseLike<readonly O[]>;

  #batchSize: number;

  /**
   * The maximum number of jobs to run in each batch.
   */
  get batchSize(): number {
    return this.#batchSize;
  }

  set batchSize(value: number) {
    if (value <= 0 || !Number.isInteger(value)) {
      throw new Error("The batch size must be a positive integer");
    }

    this.#batchSize = value;
  }

  #delay: number;

  /**
   * The number of milliseconds between two consecutive batches.
   */
  get delay(): number {
    return this.#delay;
  }

  set delay(value: number) {
    if (value < 0) {
      throw new Error("The minimum delay must be non-negative");
    }

    this.#delay = value;
  }

  #items: [I, (output: O) => void, (reason: any) => void][] = [];

  #timer = new RepeatingTimer({
    periodMillis: (): number => this.delay,
    action: (): void => {
      void this.#runBatch();
    },
  });

  async #runBatch(): Promise<void> {
    const batchItems = this.#items.splice(0, this.batchSize);
    if (batchItems.length === 0) return;

    const batchInputs: I[] = [];
    const batchResolves: ((output: O) => void)[] = [];
    const batchRejects: ((reason: any) => void)[] = [];
    for (const [input, resolve, reject] of batchItems) {
      batchInputs.push(input);
      batchResolves.push(resolve);
      batchRejects.push(reject);
    }

    try {
      const batchOutputs = await this.batchJob(batchInputs);
      batchOutputs.forEach((output: O, i: number) => {
        try {
          batchResolves[i](output);
        } catch (e1) {
          // Avoid skipping other items
          console.error(e1);
        }
      });
    } catch (e) {
      batchRejects.forEach((reject: (reason: any) => void) => {
        try {
          reject(e);
        } catch (e2) {
          // Avoid skipping other items
          console.error(e2);
        }
      });
    }
  }

  /**
   * Creates a new batcher for a job.
   */
  constructor({ batchJob, batchSize = 8, delay = 1 }: BatcherOptions<I, O>) {
    this.batchJob = batchJob;
    this.batchSize = batchSize;
    this.delay = delay;

    this.#timer.start();
  }

  /**
   * Queues the job to be run with the given input.
   */
  async apply(input: I): Promise<O> {
    return new Promise((resolve, reject) => {
      this.#items.push([input, resolve, reject]);
    });
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose(): void {
    this.#timer.stop();

    const pendingItems = this.#items.splice(0);
    for (const [, , reject] of pendingItems) {
      reject(new Error("Batcher disposed"));
    }
  }
}
