# ⭐ Installation Guide

Thank you for your interest in this project! Please follow these instructions to install ST Annotator.

## Build from source

### Requirements

- Linux environment
- [Node.js](https://nodejs.org/) 20+
- [Python](https://www.python.org/) 3.10+
- [uv](https://docs.astral.sh/uv/) 0.8+

### Procedure

1. Clone this repository to your machine.
2. Create `.env` using the variables in the [configuration guide](./user/config.md),
   generate a token-signing key with
   `openssl ecparam -name prime256v1 -genkey -noout -out <jwt_path>`, and point
   `STA_JWT_PRIVATE_KEY_PATH` in `.env` at it (a `.key` file is already git-ignored).
   The repository's default configuration expects a running PostgreSQL server with
   PostGIS; create the configured database/user and enable the PostGIS extension before
   continuing.
3. Run `bash ./scripts/install.sh` to install the frontend and backend
   workspaces and regenerate the frontend API client. Frontend builds also
   regenerate the client. Each command briefly starts a testing server, so the
   configured database must already be reachable.
4. Verify the backend setup with `uv run --package sta sta --help`, then run
   `bash ./scripts/build-prod.sh` to clean and rebuild the frontend packages
   and full application distribution. For a clean package-only development
   build, use `bash ./scripts/build-dev.sh`.

`uv` manages one shared backend environment at the repository root (`.venv`) for the core package, all plugins, and integration tests.

## Next steps

- [Quickstart with example application](./quickstart.md)
