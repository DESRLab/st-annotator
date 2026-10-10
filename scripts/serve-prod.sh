#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "$REPO_ROOT/scripts/port-utils.sh"
cd "$REPO_ROOT"

CONFIG_PATH=
BACKEND_URL=${STA_BACKEND_URL:-http://localhost:8000}
FRONTEND_URL=${STA_FRONTEND_URL:-http://localhost:3000}
BACKEND_BIND=${STA_BACKEND_BIND:-}
FRONTEND_BIND=${STA_FRONTEND_BIND:-}
BACKEND_TRANSPORT=http
BACKEND_HTTPS=
BACKEND_TRANSPORT_EXPLICIT=false
BACKEND_BIND_EXPLICIT=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        -c|--config)
            if [[ $# -lt 2 ]]; then
                echo "Option $1 requires a configuration file." >&2
                exit 1
            fi
            CONFIG_PATH=$2
            shift 2
            ;;
        --backend-url)
            if [[ $# -lt 2 ]]; then
                echo "Option $1 requires a URL." >&2
                exit 1
            fi
            BACKEND_URL=$2
            shift 2
            ;;
        --frontend-url)
            if [[ $# -lt 2 ]]; then
                echo "Option $1 requires a URL." >&2
                exit 1
            fi
            FRONTEND_URL=$2
            shift 2
            ;;
        --frontend-bind)
            if [[ $# -lt 2 ]]; then
                echo "Option $1 requires a bind address." >&2
                exit 1
            fi
            FRONTEND_BIND=$2
            shift 2
            ;;
        --backend-bind)
            if [[ $# -lt 2 ]]; then
                echo "Option $1 requires a bind address." >&2
                exit 1
            fi
            if [[ $BACKEND_TRANSPORT_EXPLICIT == true ]]; then
                echo "--backend-bind cannot be combined with --http or --https." >&2
                exit 1
            fi
            BACKEND_BIND=$2
            BACKEND_BIND_EXPLICIT=true
            shift 2
            ;;
        --http)
            if [[ $# -lt 2 ]]; then
                echo "Option $1 requires a bind address." >&2
                exit 1
            fi
            if [[ $BACKEND_BIND_EXPLICIT == true ]]; then
                echo "--http cannot be combined with --backend-bind." >&2
                exit 1
            fi
            if [[ $BACKEND_TRANSPORT_EXPLICIT == true ]]; then
                echo "Only one of --http or --https may be specified." >&2
                exit 1
            fi
            BACKEND_TRANSPORT=http
            BACKEND_BIND=$2
            BACKEND_TRANSPORT_EXPLICIT=true
            shift 2
            ;;
        --https)
            if [[ $# -lt 2 ]]; then
                echo "Option $1 requires HOST:PORT,CERT,KEY." >&2
                exit 1
            fi
            if [[ $BACKEND_BIND_EXPLICIT == true ]]; then
                echo "--https cannot be combined with --backend-bind." >&2
                exit 1
            fi
            if [[ $BACKEND_TRANSPORT_EXPLICIT == true ]]; then
                echo "Only one of --http or --https may be specified." >&2
                exit 1
            fi
            BACKEND_TRANSPORT=https
            BACKEND_HTTPS=$2
            BACKEND_BIND=${2%%,*}
            if [[ $BACKEND_HTTPS != *,*,* || -z $BACKEND_BIND ]]; then
                echo "Option --https requires HOST:PORT,CERT,KEY." >&2
                exit 1
            fi
            BACKEND_TRANSPORT_EXPLICIT=true
            shift 2
            ;;
        *)
            echo "Usage: $0 -c CONFIG [--backend-url URL] [--frontend-url URL] [--frontend-bind HOST:PORT] [--backend-bind HOST:PORT | --http HOST:PORT | --https HOST:PORT,CERT,KEY]" >&2
            exit 1
            ;;
    esac
done

if [[ -z $CONFIG_PATH ]]; then
    echo "Usage: $0 -c CONFIG [--backend-url URL] [--frontend-url URL] [--frontend-bind HOST:PORT] [--backend-bind HOST:PORT | --http HOST:PORT | --https HOST:PORT,CERT,KEY]" >&2
    echo "The -c option is required." >&2
    exit 1
fi

parse_url "$BACKEND_URL"
backend_host=$PARSED_HOST
backend_port=$PARSED_PORT
BACKEND_BIND=${BACKEND_BIND:-$backend_host:$backend_port}
backend_bind_port=${BACKEND_BIND##*:}

parse_url "$FRONTEND_URL"
frontend_scheme=$PARSED_SCHEME
frontend_host=$PARSED_HOST
frontend_port=$PARSED_PORT
FRONTEND_BIND=${FRONTEND_BIND:-"[::]:$frontend_port"}
parse_bind "$FRONTEND_BIND"
frontend_bind_host=$PARSED_BIND_HOST
frontend_bind_port=$PARSED_BIND_PORT

if [[ $frontend_scheme != http ]]; then
    echo "serve-prod.sh serves plain HTTP only; use a reverse proxy for TLS." >&2
    exit 1
fi

if [[ ! -f core/frontend/build/server/index.js || ! -f core/frontend/build/client/build-hash.txt ]]; then
    echo "Production frontend build not found; run 'bash scripts/build-prod.sh' first." >&2
    exit 1
fi
node "$REPO_ROOT/scripts/frontend-build-freshness.mjs" prod-check

kill_port_listeners "$backend_bind_port" backend
if [[ $frontend_bind_port != "$backend_bind_port" ]]; then
    kill_port_listeners "$frontend_bind_port" frontend
fi

serve_frontend() {
    HOST=$frontend_bind_host \
        PORT=$frontend_bind_port \
        STA_BACKEND_URL=$BACKEND_URL \
        npm start
}

backend_pid=
frontend_pid=

cleanup() {
    if [[ -n $backend_pid ]] && kill -0 "$backend_pid" 2>/dev/null; then
        kill "$backend_pid"
    fi

    if [[ -n $frontend_pid ]] && kill -0 "$frontend_pid" 2>/dev/null; then
        kill "$frontend_pid"
    fi

    if [[ -n $backend_pid ]]; then
        wait "$backend_pid" 2>/dev/null || true
    fi
    if [[ -n $frontend_pid ]]; then
        wait "$frontend_pid" 2>/dev/null || true
    fi
}

stop_services() {
    trap - INT TERM
    exit 130
}

trap cleanup EXIT
trap stop_services INT TERM

backend_args=(--http "$BACKEND_BIND")
if [[ $BACKEND_TRANSPORT == https ]]; then
    backend_args=(--https "$BACKEND_HTTPS")
fi

uv run --package sta sta serve -c "$CONFIG_PATH" "${backend_args[@]}" --frontend-url "$FRONTEND_URL" &
backend_pid=$!

(cd core/frontend && serve_frontend) &
frontend_pid=$!

while kill -0 "$backend_pid" 2>/dev/null && kill -0 "$frontend_pid" 2>/dev/null; do
    sleep 1
done
