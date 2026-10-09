# Hosting the ST Annotator Platform

Here is the procedure of hosting the ST Annotator platform on a web server.

1. Run `bash ./scripts/install.sh` to build the package for both frontend and backend, in case it is not up to date.
2. Run `sta serve -c <config> <args>` to host the web server of the ST Annotator platform.
    - You must specify via arguments whether to [host over HTTP or HTTPS](#httphttps-support).

## HTTP/HTTPS Support

To host the server over HTTP, use the argument `--http <host>:<port>`.

To host the server over HTTPS, use the argument `--https <host>:<port>,<cert_file>,<pkey_file>`.

- To generate SSL certificates (`foobar` is a placeholder file name):

    ```
    openssl genrsa -out foobar.key 2048
    openssl req -new -key foobar.key -out foobar.csr
    openssl x509 -req -days 365 -in foobar.csr -signkey foobar.key -out foobar.crt
    ```

## Developer Mode

Pass `--debug` and/or `--testing` to help with development.
