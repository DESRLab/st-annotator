"""Names of environment variables consumed by the backend.

Keep environment-variable names here so configuration readers and extensions
share one public contract.
"""

from typing import Final

__all__ = [
    "FILESYSTEM_ROOT",
    "POSTGRESQL_DBSE",
    "POSTGRESQL_HOST",
    "POSTGRESQL_PASS",
    "POSTGRESQL_PORT",
    "POSTGRESQL_USER",
    "STA_ASSISTANT_MAX_REQUEST_BYTES",
    "STA_ASSISTANT_URL",
    "STA_FRONTEND_URL",
    "STA_JOB_POLL_INTERVAL_SECONDS",
    "STA_JWT_ACCESS_EXPIRY_SECONDS",
    "STA_JWT_PRIVATE_KEY_PATH",
    "STA_LOGIN_RATE_LIMIT_ATTEMPTS",
    "STA_LOGIN_RATE_LIMIT_WINDOW_SECONDS",
    "STA_MAX_REQUEST_BYTES",
    "STA_TRUSTED_PROXY_IPS",
    "STA_USE_ANCESTOR_CANDIDATES",
    "STA_USE_DELTA_ENCODING",
]

# Storage configuration
FILESYSTEM_ROOT: Final = "FILESYSTEM_ROOT"
"""Absolute or relative path to the directory that all platform files live under.

Required; no default. A relative value is resolved against the directory holding
the discovered `.env` file, so it is independent of the command's working
directory.
"""
POSTGRESQL_HOST: Final = "POSTGRESQL_HOST"
"""Database server hostname. Required; no default."""
POSTGRESQL_PORT: Final = "POSTGRESQL_PORT"
"""Database server port. Required; no default."""
POSTGRESQL_DBSE: Final = "POSTGRESQL_DBSE"
"""Database name. Required; no default. `--testing` uses the `<name>_test` sibling."""
POSTGRESQL_USER: Final = "POSTGRESQL_USER"
"""Database user name. Required; no default."""
POSTGRESQL_PASS: Final = "POSTGRESQL_PASS"
"""Database user password. Required; no default."""

# Authentication and API configuration
STA_FRONTEND_URL: Final = "STA_FRONTEND_URL"
"""Browser origin allowed by CORS.

Defaults to `http://localhost:5173` (`DEFAULT_FRONTEND_URL`); the `--frontend-url`
flag of `sta serve` takes precedence. A single origin only — a comma-separated
list is rejected.
"""
STA_JWT_PRIVATE_KEY_PATH: Final = "STA_JWT_PRIVATE_KEY_PATH"
"""Path to the PEM private key that signs backend access and refresh tokens.

The key must be an EC key on curve P-256 (algorithm `ES256`). The `--jwt-private-key`
flag of `sta serve` takes precedence. A relative value is resolved against the directory
holding the discovered `.env` file, as `FILESYSTEM_ROOT` is, so it is independent of the
command's working directory; with no `.env` to anchor it, the working directory applies.
Verification uses the public half derived from this key, so the signing capability never
leaves the backend process: the frontend signs its session cookie with its own,
independent `STA_SESSION_SECRET` (declared in `core/frontend/app/envs.ts`), which cannot
mint API tokens.

Without a configured key, tokens are signed with an ephemeral in-memory keypair and
`sta serve` refuses to start outside `--testing` (`require_configured_signing_key`).
"""
STA_JWT_ACCESS_EXPIRY_SECONDS: Final = "STA_JWT_ACCESS_EXPIRY_SECONDS"
"""Access-token lifetime in seconds.

Positive integer; defaults to `JWT_ACCESS_EXPIRY_MINS * 60` (36000 s, 10 h).
"""
STA_JOB_POLL_INTERVAL_SECONDS: Final = "STA_JOB_POLL_INTERVAL_SECONDS"
"""How long the background job worker waits after a pass that found nothing to do.

Positive number of seconds; defaults to 5. It only lengthens the delay before queued
work starts -- a pass that claims a job immediately runs another -- so raising it trades
latency for database round trips on an idle queue.
"""
STA_LOGIN_RATE_LIMIT_ATTEMPTS: Final = "STA_LOGIN_RATE_LIMIT_ATTEMPTS"
"""Failed login attempts allowed per client address and username per window.

Positive integer; defaults to 10.
"""
STA_LOGIN_RATE_LIMIT_WINDOW_SECONDS: Final = "STA_LOGIN_RATE_LIMIT_WINDOW_SECONDS"
"""Length of the login rate-limit window in seconds.

Positive integer; defaults to 60.
"""
STA_MAX_REQUEST_BYTES: Final = "STA_MAX_REQUEST_BYTES"
"""Body size limit for every backend HTTP request.

Positive integer; defaults to `DEFAULT_MAX_REQUEST_BYTES` (256 MiB). Keep it at
least as large as `STA_ASSISTANT_MAX_REQUEST_BYTES` when assistant payloads pass
through the backend.
"""
STA_TRUSTED_PROXY_IPS: Final = "STA_TRUSTED_PROXY_IPS"
"""Comma-separated IP addresses or CIDR networks allowed to supply forwarding headers.

Empty by default, in which case `X-Forwarded-For` is ignored and the direct peer
address is used for login rate limiting; that makes every proxied login share one
bucket. Non-IP entries are rejected.
"""
STA_USE_ANCESTOR_CANDIDATES: Final = "STA_USE_ANCESTOR_CANDIDATES"
"""Whether a filtered closest-state read first narrows candidate ids by ancestor state.

Enabled unless the value is empty or one of `0`, `false`, `no`, `off`
(case-insensitive). When disabled, a spatial-temporal or element-window read resolves every
ancestor state and applies its filter only to the resolved state, which is how the query
behaved before the candidate set existed. Setting `STA_USE_DELTA_ENCODING` false subsumes this
switch, since the non-delta read path has no closest-state CTE to narrow.
"""
STA_USE_DELTA_ENCODING: Final = "STA_USE_DELTA_ENCODING"
"""Whether label snapshots are stored as deltas against the nearest stored snapshot.

Enabled unless the value is empty or one of `0`, `false`, `no`, `off`
(case-insensitive). When disabled, each commit materializes a full copy of the
closest stored states instead of relying on the parent chain.
"""

# Assisted-labeling configuration
#
# Declared here for a single naming contract, but read by the segmentation
# plugin (sta_segmentation.api.editor): setting them has no effect unless that
# plugin is installed.
STA_ASSISTANT_URL: Final = "STA_ASSISTANT_URL"
"""Base URL of the external assistant service that predicts segmentation masks.

Unset by default, which leaves the assistant unavailable and hides the
`Use Assistant` editor setting.
"""
STA_ASSISTANT_MAX_REQUEST_BYTES: Final = "STA_ASSISTANT_MAX_REQUEST_BYTES"
"""Body size limit for requests forwarded to the assistant service.

Positive integer; defaults to 256 MiB.
"""
