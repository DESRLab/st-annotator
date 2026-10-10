# Background Jobs

The backend uses a persistent database queue for work that must happen outside a request, especially work that reads data files. Core owns the `Job` model, claiming, execution, progress, and inventory API. Plugins own the work itself and register an executor for each job kind from their `register()` function with `register_job_executor(kind, executor)`.

## When to enqueue work

A request should update the authoritative domain records first, marking any derived data as unfinished, and then call `enqueue_job()` in the same transaction. The job row is bookkeeping and history, not the source of truth for whether work remains. This ordering means a lost or deleted job does not make incomplete data look complete, and a later write can discover the unfinished records and schedule the work again.

Use a job when the work is slow or performs file I/O. Do not read a data file in the request that schedules its processing. The producer supplies:

- a plugin-owned `kind` matching a registered executor;
- a JSON `payload`, which the executor validates against its own schema;
- a human-readable `label` for the job inventory;
- an optional `dedupe_key` identifying equivalent pending work.

`enqueue_job()` flushes the new row so its ID can be returned by APIs through `QueuedJobsResponse`. It does not commit: the caller's transaction makes both the domain mutation and its job durable together. If the same deduplication key already has a `pending` row, no row is created and the function returns `None`.

Deduplication deliberately does not consider `running` rows. A running sweep may already have read its candidate set before a concurrent write marks more records unfinished, and a stuck running row must not prevent replacement work from being queued. The deduplication check is also not a database uniqueness constraint, so concurrent producers may create duplicate jobs. Executors must therefore be idempotent and re-read the current unfinished domain records instead of assuming that their payload is an exact work list.

## Execution and transactions

`sta serve` enables one in-process worker loop per API process. The loop opens a fresh session for each pass, runs in a worker thread so blocking file I/O does not stall the asyncio event loop, drains all currently pending jobs, and waits five seconds by default before polling again. `STA_JOB_POLL_INTERVAL_SECONDS` changes that positive polling interval.

`build_api()` leaves the worker disabled by default. This keeps tests and embedded API users in control of when queued work runs. A caller that requires derived data before returning, such as a bulk importer or fixture server, commits its enqueue transaction and then calls `run_pending_jobs()`. Committing first is required: if an executor fails, its session is rolled back, which would otherwise also discard the uncommitted job row.

For each job, the worker commits its claim before resolving the user who enqueued it and executing domain operations with that identity. Publishing the claim makes the running state visible to inventory readers and lets shutdown update it from a separate session. A missing user or executor marks the job failed. An executor receives a `JobContext` containing the session, job, current user, payload, and progress methods. `report()` updates in-memory progress and commits every 20 reports; an executor may call `checkpoint()` at an explicit safe boundary. Checkpointed domain work and progress survive a later failure. Uncheckpointed changes are rolled back, the error is recorded, and the runner continues with the next job. A successful executor is marked `succeeded` and committed.

## Concurrency

Multiple API processes may drain the same queue. Claiming first selects the oldest pending ID, then conditionally updates only a row whose state is still `pending` to `running`. The affected-row count decides whether that worker won. If another process won the race, the loser runs nothing and tries again on its next pass. This compare-and-set pattern behaves consistently on both PostgreSQL and SQLite and prevents two workers from executing the same claimed row.

Claim exclusivity does not provide exactly-once processing. Duplicate enqueueing, crashes, and replacement jobs are expected, so correctness belongs to the domain protocol:

1. Persist an unfinished marker before enqueueing.
2. Make the executor idempotent.
3. Re-read the unfinished records when execution starts.
4. Checkpoint independent batches so completed work remains durable.
5. Mark each domain record complete only after its work succeeds.

## Shutdown and restart

Pending jobs are database rows, so shutting down the backend leaves them intact. When `sta serve` starts again and loads the plugin that registered their executor, its worker claims and runs them normally.

During graceful shutdown, the worker is asked to stop and the job currently owned by that process is conditionally marked `cancelled`. Blocking executor work runs in a thread and may continue briefly; shutdown waits up to five seconds before allowing the process to finish. Any checkpoints completed before termination remain committed, and a late executor return cannot overwrite the terminal cancellation state.

A data manager may also cancel a pending or running job from the jobs inventory. The transition is conditional, so completion wins cleanly if it races the request, and terminal jobs cannot be cancelled again. Cancelling a running row cannot interrupt blocking Python code already executing in the worker thread; it makes that row terminal and prevents a late return from overwriting the cancellation. As with shutdown, already checkpointed domain work remains committed.

If the process is killed without graceful shutdown, uncommitted domain changes are rolled back by the database connection and the job can remain recorded as `running`. Startup does not automatically reset or reclaim such rows. Recovery instead relies on the authoritative domain records: unfinished records remain pending, and the next relevant producer can enqueue a replacement because deduplication ignores `running` jobs. Operators can use the data-manager-only jobs inventory to distinguish pending, running, succeeded, failed, and cancelled history. An interrupted row is diagnostic history, not a retry mechanism; work that requires automatic crash retry needs an explicit recovery policy beyond the current queue.
