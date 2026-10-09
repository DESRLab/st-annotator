# ⭐ CLI Reference

The command-line interface (`sta`) automatically becomes available once you [install the ST Annotator package](../install.md).

Each subcommand requires you to specify a configuration file. This refers to the [JSON configuration file for ST Annotator](../config.md).

## Usage

## Initialize ST Annotator

Create the remote database for the ST Annotator platform:

```
sta init -c <config>
```

### Options

- `--drop-if-exists` is required to explicitly recreate an existing database.

## Serve ST Annotator

Host the ST Annotator platform on a development server:

```
# Serve over HTTP
sta serve -c <config> --http <host>:<port>

# Serve over HTTPS
sta serve -c <config> --https <host>:<port>,<cert>,<key>
```

### Options

- `--debug` enables debug mode in FastAPI.
- `--testing` enables testing mode in FastAPI.

### Examples

Host the platform on `http://localhost:5014`:

```
sta serve -c <config> --http :5014
```

Host the platform on `https://192.0.0.1:5014` with HTTPS certificate `foobar.crt` generated from private key `foobar.key`:

```
sta serve -c <config> --https 192.0.0.1:5014,foobar.crt,foobar.key
```

## Plugin CLIs

List the plugins available through a configuration file:

```
sta plugins -c <config>
```

Access the CLI of a plugin as a subcommand:

```
sta plugins -c <config> <plugin>
```
