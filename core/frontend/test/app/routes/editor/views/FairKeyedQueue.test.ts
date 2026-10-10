import { describe, expect, it, vi } from "vitest";

import { FairKeyedQueue } from "../../../../../app/routes/editor/views/FairKeyedQueue";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("FairKeyedQueue", () => {
  it("shares workers across waiting keys before giving one key another turn", async () => {
    const queue = new FairKeyedQueue<string>(2);
    const releases = [deferred(), deferred(), deferred(), deferred()];
    const started: string[] = [];
    const submit = (key: string, index: number) =>
      queue.run(key, async () => {
        started.push(`${key}-${index}`);
        await releases[index].promise;
      });

    const requests = [
      submit("primary", 0),
      submit("primary", 1),
      submit("primary", 2),
      submit("secondary", 3),
    ];
    await vi.waitFor(() => expect(started).toHaveLength(2));
    expect(started).toEqual(["primary-0", "secondary-3"]);

    releases[0].resolve();
    releases[3].resolve();
    await vi.waitFor(() => expect(started).toHaveLength(4));
    releases[1].resolve();
    releases[2].resolve();
    await Promise.all(requests);
  });

  it("allows one key to use all workers when no other key is waiting", async () => {
    const queue = new FairKeyedQueue<string>(3);
    const release = deferred();
    const task = vi.fn(async () => release.promise);
    const requests = [
      queue.run("primary", task),
      queue.run("primary", task),
      queue.run("primary", task),
    ];

    await vi.waitFor(() => expect(task).toHaveBeenCalledTimes(3));
    release.resolve();
    await Promise.all(requests);
  });
});
