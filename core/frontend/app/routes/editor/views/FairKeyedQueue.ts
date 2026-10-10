interface PendingTask<T> {
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

/**
 * A bounded task queue that dispatches waiting keys in round-robin order.
 *
 * Pumping is deferred to a microtask so requests issued by several layers in
 * the same render/navigation turn are considered together. A lone layer may
 * still borrow every worker when no other layer is waiting.
 */
export class FairKeyedQueue<K> {
  readonly #concurrency: number;
  #active = 0;
  #pumpScheduled = false;
  readonly #tasks = new Map<K, PendingTask<unknown>[]>();
  readonly #readyKeys: K[] = [];
  readonly #readyKeySet = new Set<K>();

  constructor(concurrency: number) {
    if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
      throw new Error(
        `Concurrency must be a positive integer. Found: ${concurrency}`,
      );
    }
    this.#concurrency = concurrency;
  }

  run<T>(key: K, task: () => Promise<T>): Promise<T> {
    const result = new Promise<T>((resolve, reject) => {
      const tasks = this.#tasks.get(key) ?? [];
      tasks.push({ run: task, resolve, reject } as PendingTask<unknown>);
      this.#tasks.set(key, tasks);
      this.#markReady(key);
    });
    this.#schedulePump();
    return result;
  }

  #markReady(key: K): void {
    if (this.#readyKeySet.has(key)) return;
    this.#readyKeySet.add(key);
    this.#readyKeys.push(key);
  }

  #schedulePump(): void {
    if (this.#pumpScheduled) return;
    this.#pumpScheduled = true;
    queueMicrotask(() => {
      this.#pumpScheduled = false;
      this.#pump();
    });
  }

  #pump(): void {
    while (this.#active < this.#concurrency && this.#readyKeys.length > 0) {
      const key = this.#readyKeys.shift()!;
      this.#readyKeySet.delete(key);
      const tasks = this.#tasks.get(key)!;
      const task = tasks.shift()!;
      if (tasks.length > 0) this.#markReady(key);
      else this.#tasks.delete(key);

      this.#active += 1;
      void Promise.resolve()
        .then(task.run)
        .then(task.resolve, task.reject)
        .finally(() => {
          this.#active -= 1;
          this.#schedulePump();
        });
    }
  }
}
