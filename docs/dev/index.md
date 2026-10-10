# ⭐ Developer Guide

Here is a list of resources for developers, such as contributors to the core framework and plugin authors.

- [Build, Distribution, and Release](./build.md)
- [Writing a Plugin](./plugin.md)
- [Coding Conventions](./conventions.md)
- [Design Docs](./design/index.md)

## VSCode Settings

[VSCode](https://code.visualstudio.com/) users get a shared settings file at `.vscode/settings.json`. It enables ESLint and YAML schema support for `mkdocs.yml`, sets Pyright diagnostic severities to match the type checking described in the [coding conventions](./conventions.md), passes `--no-cov` to pytest, and points the default Python interpreter at a `st-annotator` conda environment. The root file contains no launch configurations, so debugging setups are not shared through the repository.
