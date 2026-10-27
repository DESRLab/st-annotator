# Repository scripts

User-facing commands live directly in `scripts/`. Their implementation helpers
and tooling tests are grouped by workflow stage in subdirectories.

Run commands from the repository root. The root npm workspace has no script
aliases; invoke shell scripts with `bash`, JavaScript tools with `node`, and
Python tools with the activated workspace environment.

| Purpose | Commands in `scripts/` |
| --- | --- |
| Install | `install.sh` |
| Lint and format | `lint.sh`, `format.sh` |
| Build | `build-dev.sh`, `build-prod.sh` |
| Serve | `serve-dev.sh`, `serve-prod.sh` |
| Test | `test.sh`, `smoke-prod.sh` |
| Documentation | `doc.sh` |
| Release | `set-version.sh` |
| Performance | `perf_label_storage.sh`, `perf_label_latency.sh`, `perf_label_latency_multi_user.sh` |

| Helper directory | Purpose |
| --- | --- |
| `lint/` | Frontend dependency checks run automatically by `lint.sh` |
| `build/` | Package compilation, assets, composition, freshness, and API-client generation and exports |
| `serve/` | Shared port helpers |
| `doc/` | Documentation version configuration and site packaging |
| `release/` | Shared version update implementation |
| `test/` | Frontend package consumer checks and tests for build, documentation, and release tooling |

Dataset imports use `sta-datasets import 3rscan` and `sta-datasets import semantickitti`;
custom metadata generation uses `sta-datasets generate st-data-info`. See the [dataset plugin guide](../plugins/datasets/README.md).

The shared Python configuration remains in `scripts/pyproject.toml` and applies
to its subdirectories. See [the build guide](../docs/dev/build.md) for command
sequences and prerequisites.
