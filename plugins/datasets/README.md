# ⭐ Datasets Plugin

This plugin provides helper commands to import datasets into ST Annotator.

Supported datasets:

- [SemanticKITTI](#semantickitti)
- [3RScan](#3rscan), including scene graph relationships from [3DSSG](https://github.com/ShunChengWu/3DSSG)
- [Argoverse 2 Sensor](#argoverse-2-sensor), including static vector maps

The dataset must be accessible under the application's configured filesystem
root. Log in with an ST Annotator account when prompted. Run the commands below
from the repository root. For available options, run
`sta-datasets import <dataset> --help` in the installed environment. The commands are
also available through `sta plugins -c <config> datasets import <dataset> <data-dir>`.

All importers use eight worker processes by default. Use `--workers N` to change
the process count or `--workers 1` to run serially. Each task imports one complete
SemanticKITTI sequence, 3RScan scan, or Argoverse 2 log.
Each worker owns its application context and database transaction. Shared classes
are committed before workers start, so concurrent tasks reuse the same classes.
SemanticKITTI and 3RScan also commit their shared groups before starting workers.
Their scan timestamps follow sorted IDs regardless of completion order;
Argoverse 2 retains the recorded sweep timestamps and workers read their own maps.

If a worker fails, pending tasks are cancelled and running workers finish before
cleanup. SemanticKITTI and 3RScan remove the failed import's groups. Argoverse 2
commits each complete log independently: completed logs remain available, while
failed logs roll back their groups and remove their converted files. Newly
created classes without remaining references are retired, and retries reactivate
them. The 3RScan and Argoverse 2 `--dry-run` options validate serially without
starting workers, regardless of `--workers`.

All importers assign newly created object classes bright, deterministic colors
based on the class name. Colors stay consistent across datasets and import order.
Existing classes, including unused retired classes reactivated during a retry,
retain their configured colors. Existing imports are not recolored.

## SemanticKITTI

The [SemanticKITTI](https://semantic-kitti.org/dataset.html) importer reads
Velodyne point clouds, instance segmentation, and fitted bounding boxes. Both
label types are imported by default.

```bash
sta-datasets import semantickitti \
    data/SemanticKITTI/dataset -c appconfig-postgis.json
```

Use `--label-type segmentation` or `--label-type bbox` to import a single label
type. `--skip-labels` imports point-cloud sources only.

## 3RScan

The [3RScan](https://github.com/WaldJohannaU/3RScan) importer reads raw annotated
PLY point clouds and imports instance segmentation by default. PLY colors are
annotation colors; textured meshes and RGB-D sequences are omitted.

```bash
sta-datasets import 3rscan \
    data/3RScan -c appconfig-postgis.json
```

Use `--label-type segmentation --label-type bbox` to include fitted bounding
boxes. Add `--label-type relations` to import directed 3DSSG relationships.

For 3DSSG relationships, download the official
[relationships.json](https://www.campar.in.tum.de/public_datasets/3DSSG/3DSSG_subset/relationships.json)
to `data/3RScan/relationships.json`, then run:

```bash
sta-datasets import 3rscan data/3RScan -c appconfig-postgis.json --label-type relations
```

The importer uses the 27 classes from the official
[relationships.txt](https://www.campar.in.tum.de/public_datasets/3DSSG/3DSSG_subset/relationships.txt)
vocabulary, which is embedded in the importer and requires no separate download.
The importer reads `relationships.json` from the dataset directory
and asks you to download it, with a URL and destination, if it is missing.
Self-relations and relationships referencing objects without PLY geometry are
skipped with a warning.
Relations alone import segmentation geometry for their endpoints. Add
`--label-type bbox` to link fitted boxes instead; if both geometry types are
selected, relations link segmentation selections. Repeated edges across scan
subgraphs are deduplicated, and scans absent from the relation file have no
relations. Add `--dry-run` to validate point clouds, relation classes, and endpoint
geometry without login or database writes. `--skip-labels` ignores relationships
and imports sources only.

Failed imports remove their groups and retire unused classes. Retrying an import
reactivates retired classes with no remaining references, including classes left
by a previous failed import.

## Argoverse 2 Sensor

The [Argoverse 2 Sensor](https://argoverse.github.io/user-guide/datasets/sensor.html)
importer reads extracted LiDAR Feather files, vehicle poses, and vector-map JSON.
It imports lane boundaries as polylines classified by marking type, and
crosswalks and drivable areas as polygons. Identical boundaries with the same
class, including reversed vertex order, are imported once. Camera images,
cuboid annotations, and raster maps are omitted.

Validate a small sample without login, configuration, or writes:

```bash
sta-datasets import argoverse2 data/argoverse2-sensor \
    --log <log-id> --max-frames 10 --dry-run
```

Import it into the configured application:

```bash
sta-datasets import argoverse2 data/argoverse2-sensor \
    -c appconfig-postgis.json --log <log-id> --max-frames 10
```

The input can contain log directories directly, contain `train`, `val`, or
`test` split directories, or be a single log directory. Repeat `--log` or pass
comma-separated IDs to select logs; omitting it imports all discovered logs.
`--stride N` selects every Nth sweep, and `--max-frames` limits each log after
striding. `--skip-labels` imports sources only and requires no map JSON.

Each log gets its own source group and label group, prefixed by `--name`
(default `Argoverse 2`), with a `main` label branch. Select matching groups when
creating a task. Retrying creates new groups rather than updating an existing
import.

LiDAR points are transformed from the ego-vehicle frame into city axes, then
translated by the first selected sweep's vehicle position. Map vertices use the
same translation. This keeps coordinates near the origin while preserving
alignment across frames. Sweeps require exact timestamp matches in
`city_SE3_egovehicle.feather`; timestamps retain microsecond precision in the
application. Static map labels have no timestamp and are available across frames.

Converted float32 XYZI `.bin` files live in a unique directory under each log's
`.sta-imports/`. Keep those files while their source group is in use. Raw files
are preserved; a failed log rolls back its database changes and removes its
converted files. The dataset and generated files must be under the configured
filesystem root. The dry run reads every selected sweep and checks map geometry
and pose matches without creating these files.

Argoverse data is distributed under
[CC BY-NC-SA 4.0](https://github.com/argoverse/av2-api/blob/main/NOTICE).

## Custom Data

For custom data, first use `sta-datasets generate st-data-info` to generate a
metadata CSV for import.

1. Place the data files in a directory under `FILESYSTEM_ROOT`. The generator
   scans only the immediate contents of that directory, not its subdirectories.
2. Name each file with its timestamp using
   `YYYY_MM_DD=HH_MM_SS_microseconds.<extension>`. For example:

    ```text
    data/
    └── custom-point-clouds/
        ├── 2026_08_25=09_30_00_000000.pcd
        └── 2026_08_25=09_30_01_000000.pcd
    ```

   Exported JSON labels named
   `YYYY_MM_DD=HH_MM_SS_microseconds.<source-extension>.json` are also
   supported.
3. From the repository root, generate the metadata CSV. The input data path is relative to `FILESYSTEM_ROOT`,
   while the output CSV is relative to the current working directory:

    ```bash
    sta-datasets generate st-data-info \
        custom-point-clouds \
        --output custom-point-clouds.csv \
        -c appconfig-postgis.json
    ```

   Edit the CSV before importing if the data requires translation, rotation,
   or scaling.
4. Run `sta plugins -c <config>` to list the available plugins, then inspect a
   plugin's commands with `sta plugins -c <config> <plugin> --help`.
5. Import the generated CSV with the plugin's `import-by-st` command.
   The input CSV is relative to the current working directory.
   Continuing the above example:

    ```bash
    sta plugins -c appconfig-postgis.json pcd import-by-st \
        custom-point-clouds.csv
    ```

   Log in when prompted and select the existing source group or label branch
   that should receive the imported data. Run the selected command with
   `--help` for plugin-specific options such as the source-data timezone.
