# Coding Conventions

Here is a list of coding conventions that are adopted in this repository.

## Source Code

### Python code

We largely follow the code style recommended by [PEP 8](https://peps.python.org/pep-0008/) and use [Ruff](https://docs.astral.sh/ruff/) to enforce style preferences.

Your code should be fully type annotated as per [PEP 484](https://peps.python.org/pep-0484/), following the principles described in [this article](https://typing.readthedocs.io/en/latest/source/best_practices.html). We enforce semi-strict type checking with [pyright](https://microsoft.github.io/pyright/).

### JavaScript code

We largely follow the code style recommended by [Airbnb](https://github.com/airbnb/javascript) and use [ESLint](https://eslint.org/) to enforce style preferences.

Your code should be fully type annotated with [TypeScript](https://www.typescriptlang.org/)-compatible types in [JSDoc](https://jsdoc.app/) documentation. (For more information, refer to [this page](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types)). We enforce semi-strict type checking by running TypeScript's compiler against the JSDoc-documented code.

## Documentation

This documentation site is written in Markdown and built with [Material for MkDocs](https://squidfunk.github.io/mkdocs-material/).

### Python documentation

Docstrings are written in reStructuredText (reST) syntax according to [NumPy documentation style](https://numpydoc.readthedocs.io/en/latest/format.html) and validated using [Ruff](https://docs.astral.sh/ruff/).

Based on this, we use [Sphinx](https://www.sphinx-doc.org/) to generate the API documentation, which is linked to the MkDocs site.

### JavaScript documentation

Docstrings are written in [JSDoc](https://jsdoc.app/) syntax and validated using [ESLint](https://eslint.org/).

Based on this, we use [TypeDoc](https://typedoc.org/) to generate the API documentation, which is linked to the MkDocs site.
