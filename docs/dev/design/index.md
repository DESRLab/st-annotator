# Design Docs

These pages describe the architectural decisions and cross-cutting protocols that contributors need when changing ST Annotator:

- [Editor State Management](./editor-state-management.md) defines ownership across the imperative editor, three.js scene, and React UI.
- [Background Jobs](./background-jobs.md) explains how backend work is enqueued, claimed, executed concurrently, and recovered after shutdown.
- [Placeholder Values](./placeholder-values.md) explains how dependent labelset operations refer to server-generated values before a save is applied.
