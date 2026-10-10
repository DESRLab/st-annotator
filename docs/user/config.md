# ⭐ Configuration Guide

ST Annotator uses an [environment file](#environment-file-env), a [JSON file](#json-file-json), and optional [labeling-assistant](#labeling-assistant) settings.

## Environment file (`.env`)

The backend discovers `.env` by searching upward from the current working
directory, so it should normally be located at the repository root. Frontend
and serve-script settings are read from the environment of the process that
starts them. This table lists the supported runtime environment variables;
the subsections below explain them in detail.

| Variable | Required | Default when unset |
| --- | --- | --- |
| `FILESYSTEM_ROOT` | Yes | N/A |
| `POSTGRESQL_HOST` | Yes | N/A |
| `POSTGRESQL_PORT` | Yes | N/A |
| `POSTGRESQL_DBSE` | Yes | N/A |
| `POSTGRESQL_USER` | Yes | N/A |
| `POSTGRESQL_PASS` | Yes | N/A |
| `STA_FRONTEND_URL` | No | `http://localhost:5173` for `sta serve` |
| `STA_JWT_PRIVATE_KEY_PATH` | Yes outside `--testing` | Ephemeral key in `--testing` |
| `STA_JWT_ACCESS_EXPIRY_SECONDS` | No | 36,000 seconds |
| `STA_JOB_POLL_INTERVAL_SECONDS` | No | 5 seconds |
| `STA_LOGIN_RATE_LIMIT_ATTEMPTS` | No | 10 attempts |
| `STA_LOGIN_RATE_LIMIT_WINDOW_SECONDS` | No | 60 seconds |
| `STA_MAX_REQUEST_BYTES` | No | 256 MiB |
| `STA_TRUSTED_PROXY_IPS` | No | Empty |
| `STA_USE_DELTA_ENCODING` | No | Enabled |
| `STA_ASSISTANT_URL` | No | Assistant disabled |
| `STA_ASSISTANT_MAX_REQUEST_BYTES` | No | 256 MiB |
| `STA_BACKEND_URL` | In production frontend | `http://localhost:8000` in development |
| `STA_BACKEND_BIND` | No | Host and port from `STA_BACKEND_URL` |
| `STA_FRONTEND_BIND` | No | `[::]` and the port from `STA_FRONTEND_URL` |
| `STA_SESSION_SECRET` | In production frontend | Development-only local fallback |
| `STA_CONFIG_PATH` | No | Nearest `sta.config.*` file |
| `NODE_ENV` | No | Development behavior |
| `HOST` | No | Server default |
| `PORT` | No | Server default |
| `VITE_STA_API_BASE_URL` | No | Server-injected API base URL |
| `VITE_STA_E2E_PROBE` | No | Probe disabled |

Variables that contain file paths may be absolute or relative. Relative paths
resolve from the `.env` file that supplied them.

### Filesystem access

`FILESYSTEM_ROOT` is required. All files accessed by ST Annotator must be under
this directory; symbolic links can expose data stored elsewhere on the machine.

### PostgreSQL access

`POSTGRESQL_HOST`, `POSTGRESQL_PORT`, `POSTGRESQL_DBSE`, `POSTGRESQL_USER`, and
`POSTGRESQL_PASS` are required and define the PostgreSQL connection.

### Backend and frontend URLs

The platform takes a backend API URL and a browser-visible frontend URL. Set
them through the variables listed above, or pass the corresponding serve-script
options.

Environment variables provide reusable defaults for a deployment or service
manager. Command-line options customize one launch without changing those
defaults, so they take precedence when both are present. For example,
`serve-dev.sh` and `serve-prod.sh` read `STA_BACKEND_URL`,
`STA_BACKEND_BIND`, `STA_FRONTEND_URL`, and `STA_FRONTEND_BIND`, then let
`--backend-url`, `--backend-bind`, `--http`, `--https`, `--frontend-url`, and
`--frontend-bind` override them. The scripts pass the resulting values to the
backend and frontend processes.

Browser API traffic stays same-origin. The frontend renders
`window.STA_API_BASE_URL = "/api/backend"`, and its `/api/backend/*` route
forwards requests to `STA_BACKEND_URL`, replacing `Authorization` with the
bearer token from the signed session. `STA_BACKEND_URL` configures the frontend
server; it is not the backend origin seen by the browser.

`STA_FRONTEND_URL` and `--frontend-url` accept one origin. When neither is
set, the backend allows `http://localhost:5173`.

### Bind addresses

`--backend-url` and the listener options serve different purposes. The URL tells
the frontend how to reach the backend; `--backend-bind`, `--http`, or `--https`
tells the backend which socket to listen on. They are often identical on one
host but differ behind a reverse proxy or in a container network:

```bash
bash scripts/serve-prod.sh \
    -c appconfig-postgis.json \
    --backend-url https://annotator.example.com/api \
    --https 127.0.0.1:8000,server.crt,server.key
```

The command-line options override `STA_BACKEND_URL` and `STA_BACKEND_BIND`.
When no listener option is supplied, the scripts derive an HTTP bind address
from the backend URL. `--backend-bind` is an HTTP-only shorthand; use `--http`
or `--https <host>:<port>,<cert_file>,<pkey_file>` to select the transport.
`STA_FRONTEND_BIND` and `--frontend-bind` independently select the frontend
socket. The default `[::]` host accepts IPv6 and IPv4 connections on platforms
with dual-stack IPv6 sockets, while the port comes from `STA_FRONTEND_URL`.
The CORS allowlist continues to use the configured frontend origin.

The production frontend requires an absolute HTTP(S) `STA_BACKEND_URL`; it
does not fall back to a browser-local address. Its server reads `HOST` and
`PORT` for its own bind address. When starting it independently, run `npm start`
from `core/frontend`, where the `sta` workspace resolves `./build/server/index.js`.

### Frontend composition and diagnostics

`NODE_ENV=production` enables the production requirements for
`STA_BACKEND_URL` and `STA_SESSION_SECRET`. `STA_CONFIG_PATH` selects the
frontend `sta.config.ts` composition. `VITE_STA_API_BASE_URL` is a build-time
fallback for the browser API base URL when the server-injected value is absent.
`VITE_STA_E2E_PROBE` enables an editor test probe and must only be set by the
Playwright suites.

### Request size limits

`STA_MAX_REQUEST_BYTES` limits all backend HTTP request bodies. It defaults to
256 MiB and must be at least `STA_ASSISTANT_MAX_REQUEST_BYTES` when assistant
payloads pass through the backend.

### Signing keys and token lifetime

The frontend signs its `__session` cookie with `STA_SESSION_SECRET`. The backend
signs access and refresh tokens with `STA_JWT_PRIVATE_KEY_PATH` and verifies
them with its derived public key. The frontend never receives the backend key.
A leaked session secret can forge sessions but cannot mint backend access tokens;
that requires the backend signing key.

Each process verifies tokens with one key. Replacing the key file takes effect
on restart and invalidates existing access and refresh tokens.

`STA_JWT_ACCESS_EXPIRY_SECONDS` sets a positive access-token lifetime in
seconds. It defaults to 36,000 seconds (10 hours).

Generate a backend signing key with:

```bash
openssl ecparam -name prime256v1 -genkey -noout -out <jwt_path>
```

!!! tip
    Prefer a `.key` suffix so Git ignores the file automatically, and restrict it to the serving user with `chmod 600`. A relative `STA_JWT_PRIVATE_KEY_PATH` resolves from the directory holding the discovered `.env` file, just as `FILESYSTEM_ROOT` does. Without a `.env` file, it resolves from the current working directory.

### Background work

Some data work, such as re-deriving spatial bounds for all scans in a source
group, runs as a backend job. Each `sta serve` process runs one worker; several
processes may share a database because each job is claimed by one worker.

Jobs report progress rather than recording outstanding work. Data rows awaiting
derivation remain visible if a job is lost to a restart and are queued again by
the next relevant change. Data managers can inspect jobs at `/jobs/`.

`STA_JOB_POLL_INTERVAL_SECONDS` controls how long a worker waits after a pass
that found no work. It defaults to 5 seconds and affects only how soon queued
work begins.

### Login rate limiting and trusted proxies

Login password checks are limited per client address and username. The default
allows 10 attempts per 60 seconds. Set
`STA_LOGIN_RATE_LIMIT_ATTEMPTS` and `STA_LOGIN_RATE_LIMIT_WINDOW_SECONDS` to
positive integers to change those limits. An internet-facing reverse proxy
should still apply a broader request limit.

Set `STA_TRUSTED_PROXY_IPS` when the frontend or another reverse proxy forwards
login requests to the backend. Give it the IP address or CIDR network of every
direct proxy peer, separated by commas. The backend then accepts
`X-Forwarded-For` from those peers and applies address limits to the browser's
address instead of the shared proxy address.

Without this setting, forwarding headers are ignored. A proxied deployment then
puts every browser in the frontend server's address bucket, so failed attempts
from one client can rate-limit all users. The backend skips an address limit
when the resolved peer cannot distinguish clients, including loopback,
link-local, private, non-IP, and trusted-proxy addresses without a usable
`X-Forwarded-For`. Per-username limits still apply.

A publicly addressed frontend that sends no forwarding header cannot be
distinguished from a browser connecting directly, so it is not skipped. Add
that address to `STA_TRUSTED_PROXY_IPS` and forward client addresses to make
the address limit per-client rather than shared by the platform.

Do not set `STA_BACKEND_URL` for this purpose: it names the frontend's backend
destination, whereas `STA_TRUSTED_PROXY_IPS` names sources that may safely
supply forwarding headers. Trusting those headers from another source would
allow address spoofing.

### Storage encoding

`STA_USE_DELTA_ENCODING` controls label-snapshot storage. It is enabled unless
the value is empty or one of `0`, `false`, `no`, or `off`. When disabled, each
commit stores a full copy instead of deltas against the nearest stored snapshot.

## JSON file (`.json`)

The JSON file contains two Python factory import paths:

- `db`: A no-argument factory that returns the database configuration.
- `fs`: A no-argument factory that returns the filesystem configuration.

For example, `appconfig-postgis.json` uses the environment-backed PostGIS and
filesystem factories:

```json
{
  "db": "sta.common.database:PostGISDatabaseConfig.from_env",
  "fs": "sta.common.filesystem:FilesystemConfig.from_env"
}
```

Backend plugins are discovered from installed Python entry points; frontend
plugins are selected separately by the active `sta.config.ts` application
composition. No other keys are accepted: a file that still carries an unused key
fails to parse at startup instead of being ignored.

## Labeling assistant

The optional [DynamicSAM](https://github.com/DESRLab/dynamic-sam) assistant
predicts segmentation masks from point prompts. Set `STA_ASSISTANT_URL` on the
annotator backend to its base URL:

```bash
# Run the assistant service
dynamic-sam serve --hf-repo-id Marali/dynamic-sam --port 9000

# Start the annotator backend pointing to the assistant service
STA_ASSISTANT_URL=http://localhost:9000 sta serve ...
```

Assistant requests and responses stream between the backend and assistant. The
frontend proxy buffers a browser request so it can replay it after refreshing
an expired access token, then streams the response. Browser assistant requests
therefore also occupy frontend-process memory.

Incoming assistant requests are limited to 256 MiB by default. Set the positive
integer `STA_ASSISTANT_MAX_REQUEST_BYTES` to change that limit. All backend HTTP
request bodies have a 256 MiB default limit controlled by `STA_MAX_REQUEST_BYTES`.
Keep the global limit at least as high as the assistant-specific limit when
large assistant payloads pass through the backend.
