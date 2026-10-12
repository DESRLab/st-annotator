# ⭐ Dataset Import Plugin

This plugin imports supported datasets into ST Annotator as point-cloud sources
and object labels. Its backend package is `sta-datasets` (`sta_datasets`), and
`bash scripts/install.sh` installs it by default. It contributes CLI commands
without a frontend workspace.

The supported datasets are:

- **SemanticKITTI:** Velodyne point clouds, instance segmentation, and fitted
  bounding boxes. Both label types are imported by default.
- **3RScan:** Raw annotated PLY point clouds and instance segmentation. Use
  `--label-type segmentation --label-type bbox` to include fitted bounding boxes.
  PLY colors are annotation colors; textured meshes and RGB-D sequences are
  omitted.

From the repository root, run:

```bash
uv run --package sta-datasets --directory . sta-datasets semantickitti \
    data/SemanticKITTI/dataset -c appconfig-postgis.json

uv run --package sta-datasets --directory . sta-datasets 3rscan \
    data/3RScan -c appconfig-postgis.json
```

The dataset must be accessible under the application's configured filesystem
root. Log in with an ST Annotator account when prompted. For available options,
run `sta-datasets <dataset> --help` in the installed environment. The commands
are also available through `sta plugins -c <config> datasets <dataset> <data-dir>`.

Dataset readers live in separate modules under `backend/sta_datasets/`.
`common.py` provides shared geometry, label creation, batching, and import cleanup
helpers. The original `scripts/import_*.py` files remain thin command launchers.

See the [dataset import guide](https://desrlab.github.io/st-annotator/quickstart.md#import-data)
for further usage details and the [plugin development guide](https://desrlab.github.io/st-annotator/dev/plugin.md#dataset-import-plugin)
for the package structure.
