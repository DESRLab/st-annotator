# ⭐ Quickstart Guide

Get started with ST Annotator by hosting the example application.

## Prerequisites

- [Install the repository](./install.md)

## Procedure

### Setup the environment

1. Set up a [PostgreSQL](https://www.postgresql.org/) database server, then
   create the database and database user that you will configure below. Grant
   that user access to the database. `sta init` initializes the schema in this
   existing database; it does not create the database or database user.
2. Create a `data` directory under the root of this repository to contain the data for the ST Annotator platform. You may create symbolic links to access data stored elsewhere on the machine.
3. Generate a token-signing key at the repository root:

    ```bash
    openssl ecparam -name prime256v1 -genkey -noout -out jwt-signing.key
    ```

4. Create an `.env` file at the root of the repository with the following information to access the database and file server:

    ```env
    POSTGRESQL_HOST=<host>
    POSTGRESQL_PORT=<port>
    POSTGRESQL_DBSE=<database>
    POSTGRESQL_USER=<username>
    POSTGRESQL_PASS=<password>
    FILESYSTEM_ROOT=data
    STA_JWT_PRIVATE_KEY_PATH=jwt-signing.key
    ```

5. Select a `.json` configuration file for the example application:
    - `appconfig-postgis.json` enables PostGIS in the database. PostGIS must be available on the database server.
    - `appconfig-postgres.json` is for a database where PostGIS is already enabled.

    Use `appconfig-postgis.json` unless you install the PostGIS extension separately. Pass the selected file to `<config>` in each `sta` command, and to the serve scripts used in [Host the platform](#host-the-platform) with the required `-c <config>` option.

### (Optional) Start DynamicSAM

To use point prompts for assisted segmentation, install [DynamicSAM](https://github.com/DESRLab/dynamic-sam), then start its service in a separate terminal:

```bash
dynamic-sam serve --hf-repo-id Marali/dynamic-sam --port 9000
```

Keep the service running while using the annotator.

Then update your `.env` file with a `STA_ASSISTANT_URL` that points the annotator backend to this service, e.g.:

```env
STA_ASSISTANT_URL=http://localhost:9000
```

If you run DynamicSAM on another host or port, set the URL to the address reachable from the annotator backend.

### Create the database

1. Run `sta init -c <config>` to create the database.
    - Installed backend plugins are loaded before table creation, so their tables are included.
    - The command first asks you to type the name of the configured database to confirm the operation, and stops when the typed name does not match it.
    - Follow the prompts in the command line to create a default account on the ST Annotator platform to access the website with full privileges.
      - This account is separate from the account on the database server.
    - If the database already exists, you have to explicitly recreate it via the flag `--drop-if-exists`.

!!! note
    If you require PostGIS, make sure that the user has the necessary permissions to activate the extension when creating the database.
    (You may have to first manually connect to the database server with an admin account and grant permissions to non-admin users.)

### Import data

Run `sta-datasets --help` from the repository root to list dataset importers.
The repository installation includes this command. Installed deployments can
also use `sta plugins -c <config> datasets <dataset> <data-dir>`.

New object classes receive stable colors derived from their names. All dataset
importers reuse existing classes and preserve their configured colors. Existing
imports are not recolored.

#### SemanticKITTI dataset

Import SemanticKITTI point clouds, segmentation labels, and bounding boxes. Use
`appconfig-postgis.json` when importing segmentation labels.

1. Download the KITTI Odometry Benchmark Velodyne point clouds and the
   SemanticKITTI labels from the
   [official SemanticKITTI dataset page](https://semantic-kitti.org/dataset.html).
   Extract both archives into the same dataset directory.
2. Place the extracted dataset under the configured `FILESYSTEM_ROOT`. With the
   quickstart `.env`, a typical layout is:

    ```text
    data/
    └── SemanticKITTI/
        └── dataset/
            └── sequences/
                ├── 00/
                │   ├── velodyne/
                │   │   ├── 000000.bin
                │   │   └── ...
                │   └── labels/
                │       ├── 000000.label
                │       └── ...
                └── ...
    ```

   The path passed to the importer must be the directory that directly
   contains `sequences/`. It may be a symbolic link, but its resolved location
   must remain accessible through `FILESYSTEM_ROOT`.
3. From the repository root, import the labeled sequences `00` through `10`:

    ```bash
    sta-datasets semantickitti \
        data/SemanticKITTI/dataset \
        -c appconfig-postgis.json
    ```

   Log in at the prompt with the ST Annotator account created during database
   initialization. By default, the command creates a `SemanticKITTI` source
   group and label group, imports both segmentation and bounding-box labels,
   and preserves the original SemanticKITTI classes.
4. For a smaller initial import, select one or more sequences. The option may
   be repeated or receive comma-separated IDs:

    ```bash
    sta-datasets semantickitti \
        data/SemanticKITTI/dataset \
        -c appconfig-postgis.json \
        --sequence 00,01
    ```

Additional useful variants include:

- Import only point clouds, including unlabeled test sequences:

    ```bash
    sta-datasets semantickitti \
        data/SemanticKITTI/dataset \
        -c appconfig-postgis.json \
        --sequence 11 \
        --skip-labels
    ```

- Import only one label representation by passing either
  `--label-type segmentation` or `--label-type bbox`. Repeat `--label-type` to
  explicitly request both.
- Add `--learning-map` to map the raw SemanticKITTI classes to its 20 learning
  classes.
- Use `--source-group-name`, `--label-group-name`, and `--label-branch-name` to
  choose names other than the defaults. This is particularly useful for
  separate imports of different sequence sets.
- Run `sta-datasets semantickitti --help` for the complete option list.

#### 3RScan dataset

The `sta-datasets 3rscan` command imports the [3RScan dataset](https://github.com/WaldJohannaU/3RScan) at `data/3RScan`.
Each annotated scan directory contains `labels.instances.annotated.v2.ply` and
`semseg.v2.json`. Only scans with an annotated PLY file are selected by default.

From the repository root, validate one scan without database writes:

```bash
sta-datasets 3rscan data/3RScan \
    --scan 00d42bed-778d-2ac6-86a7-0e0e5f5f5660 --dry-run
```

Import all annotated scans, logging in with an ST Annotator account at the prompt:

```bash
sta-datasets 3rscan data/3RScan \
    -c appconfig-postgis.json
```

Place the dataset under the configured filesystem root and keep the original
PLY files in place after importing. PLY colors are annotation colors;
textured meshes and RGB-D sequences are not imported.

Segmentation is imported by default. To include estimated bounding boxes,
pass `--label-type segmentation --label-type bbox`.
To import scene graph relationships from [3DSSG](https://github.com/ShunChengWu/3DSSG),
download [relationships.json](https://www.campar.in.tum.de/public_datasets/3DSSG/3DSSG_subset/relationships.json)
to `data/3RScan/relationships.json` and add `--label-type relations`.
This also imports segmentation labels by default. Use
`--label-type relations --label-type bbox` to import relationships with boxes instead.
Relationships whose endpoints have no PLY geometry are skipped with a warning.

`--skip-labels` imports sources without requiring annotation JSON files.
`--scan` accepts repeated or comma-separated scan IDs, and `--name` changes the
group names. `--dry-run` checks all selected point clouds and mappings without
login. Each invocation creates new groups rather than resuming an earlier import.

#### Argoverse 2 Sensor dataset

The `sta-datasets argoverse2` command imports LiDAR sweeps and static vector map
labels from extracted [Argoverse 2 Sensor logs](https://argoverse.github.io/user-guide/datasets/sensor.html).
It accepts log directories directly under the input directory or within split
directories (`train`, `val`, `test`). Start with a single log and a few frames:

```bash
sta-datasets argoverse2 data/argoverse2-sensor \
    --log <log-id> --max-frames 10 --dry-run
sta-datasets argoverse2 data/argoverse2-sensor \
    -c appconfig-postgis.json --log <log-id> --max-frames 10
```

Each log gets separate source and label groups. Use the matching groups to
create a task. Lane boundaries become polylines, while crosswalks and drivable
areas become polygons. Map labels have no timestamp and are available across
frames. LiDAR and map coordinates share city axes, translated to place the
first selected vehicle position at the origin.

Keep the generated `.sta-imports/` directory inside each log while using its
sources. Raw files are preserved. `--stride N` selects every Nth sweep;
`--skip-labels` imports point clouds without requiring map files. Imports commit
each complete log independently, using eight worker processes by default.
Use `--workers N` to change the process count or `--workers 1` to run serially.
Completed logs remain if another log fails. See
`sta-datasets argoverse2 --help` for the full option list.

#### Custom data

For custom data, first use `scripts/generate_st_data_info.py` to generate a
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
    python scripts/generate_st_data_info.py \
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

### Host the platform

1. Run `bash scripts/serve-dev.sh -c <config>` to start the backend and full frontend
   composition. They default to `http://localhost:8000` and
   `http://localhost:5173`, respectively.
2. Open `http://localhost:5173` in your browser.
3. Log in using the default account created [earlier](#create-the-database).

The `-c` option is required. Use `--backend-url` and
`--frontend-url` to choose different origins. See the
[hosting guide](./user/host.md) for production commands and HTTPS.

## Next steps

- [Use the ST Annotator platform](./user/handbook/index.md)
