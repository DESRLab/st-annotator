# Coding Conventions

Here is a list of coding conventions that are adopted in this repository.

## Source Code

### Python code

We largely follow the code style recommended by [PEP 8](https://peps.python.org/pep-0008/) and use [Ruff](https://docs.astral.sh/ruff/) to enforce style preferences. `scripts/lint.sh` runs `ruff format --check` alongside `ruff check` over the core backend, every backend plugin, and the standalone Python scripts; `scripts/format.sh` is the rewriting counterpart. Line width is the formatter's concern, so `E501` is not linted, and Ruff's two formatter-conflicting rules, `COM812` and `ISC001`, are excluded from the lint selection.

Your code should be fully type annotated as per [PEP 484](https://peps.python.org/pep-0484/), following the principles described in [this article](https://typing.readthedocs.io/en/latest/source/best_practices.html). We enforce semi-strict, warning-free type checking with [Pyright](https://microsoft.github.io/pyright/) through `scripts/lint.sh`. Each package's source tree is checked with the profile in `config/python/pyproject.toml` under `--warnings`, so a reported warning fails the build. Test trees and the standalone Python under `scripts/` and `tests/frontend` are checked with `config/python/pyright-tests.json`, which keeps `basic` mode and relaxes the legacy pytest-fixture and SQLModel diagnostics the source profile would otherwise reject; warnings fail those passes too. New modules are covered automatically because every target is a directory.

### Frontend code

We use [ESLint](https://eslint.org/) to enforce style preferences. For the TypeScript sources we apply [typescript-eslint](https://typescript-eslint.io/)'s `recommendedTypeChecked` and `stylisticTypeChecked` rulesets, which lint with type information from the project's `tsconfig`. A handful of high-volume type-aware rules are pinned to `off` in the shared ESLint configuration (`config/js/eslint.config.mjs`), each with a comment stating why it is deferred.

The frontend and plugin packages are written in [TypeScript](https://www.typescriptlang.org/), and we enforce strict type checking with the TypeScript compiler. The shared configuration package (`config/js`) is written in JavaScript with [JSDoc](https://jsdoc.app/) type annotations, which the same compiler checks as part of `scripts/lint.sh`.

Frontend development uses the private npm workspace at the repository root and
its single `package-lock.json`; run `npm ci` there. Runtime dependencies remain
declared by the workspace that imports them. Core and plugin workspaces are
publishable packages whose `exports` target built `dist/` artifacts, while
uniform repository tooling is owned at the root. Keep thin local ESLint, Vite,
and TypeScript entry points because their file scopes and project boundaries
are package-specific. `scripts/lint.sh` is the single entry point for
non-mutating validation of both languages, and `scripts/format.sh` is its
rewriting counterpart, covering both Prettier formatting and ESLint autofixes.
Both take `all`, `backend`, or `frontend`. The root workspace defines no npm
scripts: every repository-wide command is invoked through `scripts/`.

The editor's React/imperative boundary and state-store rules are documented in
[Editor State Management](./design/editor-state-management.md).

## Documentation

This documentation site is written in Markdown and built with [Material for MkDocs](https://squidfunk.github.io/mkdocs-material/).

### Python documentation

Docstrings are written in reStructuredText (reST) syntax according to [NumPy documentation style](https://numpydoc.readthedocs.io/en/latest/format.html) and validated using [Ruff](https://docs.astral.sh/ruff/): the `D` ruleset checks the style of a docstring that exists, while the missing-docstring codes (`D1`) are deliberately not enforced.

Based on this, we use [Sphinx](https://www.sphinx-doc.org/) to generate the API documentation, which is linked to the MkDocs site.

### Frontend documentation

Docstrings are written in [JSDoc](https://jsdoc.app/) syntax and validated using [ESLint](https://eslint.org/) for the JavaScript sources of the shared configuration package; TypeScript docblocks are not linted.

Based on this, we use [TypeDoc](https://typedoc.org/) to generate the API documentation, which is linked to the MkDocs site.
