# ⭐ Configuration Guide

The ST Annotator requires both an [environment file](#environment-file-env) and [JSON file](#json-file-json) to configure its runtime environment.

## Environment file (`.env`)

The environment file should be located at the root of the repository with the following information to access the database and file server:

```env
POSTGRESQL_HOST=<host>
POSTGRESQL_PORT=<port>
POSTGRESQL_DBSE=<database>
POSTGRESQL_USER=<username>
POSTGRESQL_PASS=<password>
FILESYSTEM_ROOT=<path>
```

All files accessed by the ST Annotator platform should be under the absolute path given by `FILESYSTEM_ROOT`. You may create symbolic links to access data stored elsewhere on the machine.

## JSON file (`.json`)

The JSON file should contain the following keys:

- `db`: The database to connect to.
- `fs`: The filesystem to connect to.
- `source_plugins`: The source plugins to enable.
- `label_plugins`: The label plugins to enable.
- `editor_bundle`: The path to the JavaScript bundle for the annotation editor.

You can run `sta init` for more details on the schema of the JSON file.
