#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/port-utils.sh"

CONFIG_PATH=
BACKEND_URL=${STA_BACKEND_URL:-http://localhost:8000}
FRONTEND_URL=${STA_FRONTEND_URL:-http://localhost:5173}
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
frontend_host=$PARSED_HOST
frontend_port=$PARSED_PORT
FRONTEND_BIND=${FRONTEND_BIND:-"[::]:$frontend_port"}
parse_bind "$FRONTEND_BIND"
frontend_bind_host=$PARSED_BIND_HOST
frontend_bind_port=$PARSED_BIND_PORT

REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
node "$SCRIPT_DIR/frontend-build-freshness.mjs" dev-once

kill_port_listeners "$backend_bind_port" backend
if [[ $frontend_bind_port != "$backend_bind_port" ]]; then
    kill_port_listeners "$frontend_bind_port" frontend
fi

serve_frontend() {
    # STA_BACKEND_URL configures the SSR loaders and the target of the
    # /api/backend proxy; the browser receives the same-origin /api/backend
    # path instead of this URL.
    STA_CONFIG_PATH=../../distributions/full/frontend/sta.config.ts \
        STA_BACKEND_URL=$BACKEND_URL npm run dev -- --host "$frontend_bind_host" --port "$frontend_bind_port"
}

backend_pid=
frontend_pid=
watch_pid=

cleanup() {
    if [[ -n $watch_pid ]] && kill -0 "$watch_pid" 2>/dev/null; then
        kill "$watch_pid"
    fi
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
    if [[ -n $watch_pid ]]; then
        wait "$watch_pid" 2>/dev/null || true
    fi
}

stop_services() {
    trap - INT TERM
    exit 130
}

trap cleanup EXIT
trap stop_services INT TERM

node "$SCRIPT_DIR/frontend-build-freshness.mjs" dev-watch &
watch_pid=$!

backend_args=(--http "$BACKEND_BIND")
if [[ $BACKEND_TRANSPORT == https ]]; then
    backend_args=(--https "$BACKEND_HTTPS")
fi

uv run --package sta sta serve -c "$CONFIG_PATH" "${backend_args[@]}" --frontend-url "$FRONTEND_URL" --debug &
backend_pid=$!

(cd core/frontend && serve_frontend) &
frontend_pid=$!

while kill -0 "$backend_pid" 2>/dev/null && kill -0 "$frontend_pid" 2>/dev/null && kill -0 "$watch_pid" 2>/dev/null; do
    sleep 1
done
