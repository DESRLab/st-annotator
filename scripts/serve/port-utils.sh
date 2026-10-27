#!/bin/bash

# Shared URL parsing and interactive listener cleanup for scripts that own
# local HTTP ports.
parse_url() {
    PARSED_SCHEME=${1%%://*}
    local host_port=${1#*://}
    host_port=${host_port%%/*}
    PARSED_HOST=${host_port%%:*}
    if [[ $host_port == *:* ]]; then
        PARSED_PORT=${host_port##*:}
    elif [[ $PARSED_SCHEME == https ]]; then
        PARSED_PORT=443
    else
        PARSED_PORT=80
    fi
}

parse_bind() {
    local host_port=$1
    PARSED_BIND_HOST=${host_port%:*}
    PARSED_BIND_HOST=${PARSED_BIND_HOST#[}
    PARSED_BIND_HOST=${PARSED_BIND_HOST%]}
    PARSED_BIND_PORT=${host_port##*:}
}

find_port_listeners() {
    local port=$1
    PORT_LISTENER_PIDS=

    if command -v lsof >/dev/null 2>&1; then
        PORT_LISTENER_PIDS=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
    fi
    if [[ -z $PORT_LISTENER_PIDS ]] && command -v fuser >/dev/null 2>&1; then
        PORT_LISTENER_PIDS=$(fuser "$port"/tcp 2>/dev/null || true)
    fi
    if ! command -v lsof >/dev/null 2>&1 && ! command -v fuser >/dev/null 2>&1; then
        echo "Cannot check port $port: install lsof or fuser." >&2
        exit 1
    fi
}

kill_port_listeners() {
    local port=$1
    local service=$2

    find_port_listeners "$port"
    if [[ -z $PORT_LISTENER_PIDS ]]; then
        return
    fi

    echo "Existing $service process(es) are listening on port $port: $PORT_LISTENER_PIDS"
    local reply=
    if ! read -r -p "Stop them? [y/N] " reply </dev/tty; then
        echo >&2
        echo "Unable to read confirmation from the terminal; aborting." >&2
        exit 1
    fi
    case $reply in
        y | Y | yes | YES | Yes)
            ;;
        *)
            echo "Aborting without stopping the $service process(es)." >&2
            exit 1
            ;;
    esac

    echo "Stopping existing $service process(es) on port $port."
    kill $PORT_LISTENER_PIDS 2>/dev/null || true

    for _ in {1..20}; do
        find_port_listeners "$port"
        if [[ -z $PORT_LISTENER_PIDS ]]; then
            return
        fi
        sleep 0.1
    done

    echo "Force-stopping process(es) still listening on $service port $port: $PORT_LISTENER_PIDS"
    kill -KILL $PORT_LISTENER_PIDS 2>/dev/null || true
}
