# Hosting the ST Annotator Platform

Here is the procedure of hosting the ST Annotator platform on a web server.

## Production Serving

1. Perform the necessary configurations according to [this guide](./config.md).
2. Run `bash ./scripts/install.sh` to install dependencies and generate the API
   client. This requires the configured PostgreSQL server.
3. Run `bash ./scripts/build-prod.sh` to build the frontend packages and full
   distribution.
4. Run `bash scripts/serve-prod.sh -c <config>` to start the backend and serve
   the built frontend. Pass `--http` or `--https` to select the backend
   listener.

`serve-prod.sh` requires artifacts from `build-prod.sh` and defaults to backend
port 8000 and frontend port 3000:

```bash
STA_JWT_PRIVATE_KEY_PATH=/path/to/jwt-signing.key \
STA_SESSION_SECRET=<private-secret> \
bash scripts/serve-prod.sh -c appconfig-postgis.json
```

To serve the backend with TLS, pass its `sta serve` listener option through the
script:

```bash
bash scripts/serve-prod.sh -c appconfig-postgis.json \
    --backend-url https://annotator.example.com/api \
    --https 127.0.0.1:8000,server.crt,server.key
```

`serve-prod.sh` still serves the frontend over HTTP. Put a reverse proxy in
front of it when browsers must connect over HTTPS. Set `--backend-url` to the
backend URL reachable from the frontend server; it can be the public proxy URL.

## Local Development

1. Perform the necessary configurations according to [this guide](./config.md).
2. Run `bash ./scripts/install.sh` to install dependencies and generate the API
   client. This requires the configured PostgreSQL server.
3. Run `bash scripts/serve-dev.sh -c <config>` to start the backend and the
   source-watching frontend over HTTP. It rebuilds outdated package exports as
   needed. Use `bash scripts/build-dev.sh` for a clean package rebuild.

Both serve scripts require `-c <config>` for the backend application
configuration. Development defaults to `http://localhost:8000` for the backend
and `http://localhost:5173` for the frontend. The frontend binds to `[::]:5173`
so both IPv6 and IPv4 localhost connections work. To change the backend URL
that the frontend server uses for API requests:

```bash
bash scripts/serve-dev.sh -c appconfig-postgis.json \
    --backend-url http://localhost:9000
```

The frontend URL is the browser-visible origin used for redirects, cookies,
and the backend CORS allowlist. The frontend bind is the host and port on which
the frontend process listens. Configure them independently when changing the
frontend port or placing the service behind a proxy:

```bash
bash scripts/serve-dev.sh -c appconfig-postgis.json \
    --frontend-url http://localhost:5174 \
    --frontend-bind '[::]:5174'
```

## Backend HTTP/HTTPS Support

Both serve scripts pass `--http` and `--https` directly to `sta serve`:

```bash
bash scripts/serve-prod.sh -c appconfig-postgis.json --http 127.0.0.1:8000
bash scripts/serve-prod.sh -c appconfig-postgis.json \
    --https 127.0.0.1:8443,server.crt,server.key
```

`--backend-bind` remains an HTTP-only shorthand. It cannot be combined with
`--http` or `--https`, and the latter two options are mutually exclusive.

- To generate SSL certificates (`foobar` is a placeholder file name):

    ```
    openssl genrsa -out foobar.key 2048
    openssl req -new -key foobar.key -out foobar.csr
    openssl x509 -req -days 365 -in foobar.csr -signkey foobar.key -out foobar.crt
    ```
