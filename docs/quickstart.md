# ⭐ Quickstart Guide

Get started with ST Annotator by hosting the example application.

## Prerequisites

- [Install the repository](./install.md)

## Procedure

### Setup the environment

1. Set up a [PostgreSQL](https://www.postgresql.org/) database server.
2. Create a `data` directory under `packages/app` to contain the data for the ST Annotator platform. You may create symbolic links to access data stored elsewhere on the machine.
3. Create an `.env` file at the root of the repository with the following information to access the database and file server:

    ```env
    POSTGRESQL_HOST=<host>
    POSTGRESQL_PORT=<port>
    POSTGRESQL_DBSE=<database>
    POSTGRESQL_USER=<username>
    POSTGRESQL_PASS=<password>
    FILESYSTEM_ROOT=<abspath_to_repo>/packages/app/data
    ```
4. Select a `.json` configuration file for example application. This configuration should be passed to `<config>` in each command.
    - `packages/app/python/appconfig-postgres.json` enables all plugins, except for those that require PostGIS (`vector` and `segmentation`).
    - `packages/app/python/appconfig-postgis.json` enables all plugins, including those that require PostGIS (`vector` and `segmentation`).

### Create the database

1. Run `sta init -c <config>` to create the database.
    - Follow the prompts in the command line to create a default account on the ST Annotator platform to access the website with full privileges.
      - This account is separate from the account on the database server.
    - If the database already exists, you have to explicitly recreate it via the flag `--drop-if-exists`.
    - *Note: If you require PostGIS, make sure that the user has the necessary permissions to activate the extension when creating the database. (You may have to first manually connect to the database server with an admin account and grant permissions to non-admin users.)*

### Import data

1. Run `sta plugins -c <config>` to list the available plugins.
2. Run `sta plugins -c <config> <plugin>` to access the command-line interface of that plugin.
3. Run `sta plugins -c <config> <plugin> <import_cmd>` to access the importer of that plugin.
    - Use the `--help` flag for more details on how to import the data.

### Host the platform

1. Run `sta serve -c <config> --http :<port>` to host the ST Annotator platform.
2. Open your browser and navigate to `http://localhost:<port>` to access the web platform.
3. Log into the platform using the default account created [earlier](#create-the-database).

## Next steps

- [Use the ST Annotator platform](./user/handbook/index.md)
