# ruff: noqa: INP001
# Configuration file for the Sphinx documentation builder.
#
# For the full list of built-in configuration values, see the documentation:
# https://www.sphinx-doc.org/en/master/usage/configuration.html
from __future__ import annotations


def patch_introspection():
    """
    Patches some introspection methods to gracefully handle attributes
    that raise errors upon being accessed.
    """
    import inspect
    import sys
    from typing import Any

    import sphinx.ext.autosummary
    from sphinx.ext.autodoc.importer import import_module
    from sphinx.ext.autosummary import ImportExceptionGroup
    from sphinx.util.inspect import safe_getattr

    _orig_getdoc = inspect.getdoc

    def _getdoc(*args: Any, **kwargs: Any):
        try:
            return _orig_getdoc(*args, **kwargs)
        except Exception:
            return None

    inspect.getdoc = _getdoc

    def _import_by_name(name: str, grouped_exception: bool = True):  # noqa: FBT001, FBT002
        errors: list[BaseException] = []

        try:
            name_parts = name.split('.')

            # try first interpret `name` as MODNAME.OBJ
            modname = '.'.join(name_parts[:-1])
            if modname:
                try:
                    mod = import_module(modname)
                    return safe_getattr(mod, name_parts[-1]), mod, modname
                except (ImportError, IndexError, AttributeError) as exc:
                    errors.append(exc.__cause__ or exc)

            # ... then as MODNAME, MODNAME.OBJ1, MODNAME.OBJ1.OBJ2, ...
            last_j = 0
            modname = None
            for j in reversed(range(1, len(name_parts) + 1)):
                last_j = j
                modname = '.'.join(name_parts[:j])
                try:
                    import_module(modname)
                except ImportError as exc:
                    errors.append(exc.__cause__ or exc)

                if modname in sys.modules:
                    break

            assert isinstance(modname, str), '`name_parts` is empty'

            if last_j < len(name_parts):
                parent = None
                obj = sys.modules[modname]
                for obj_name in name_parts[last_j:]:
                    parent = obj
                    obj = safe_getattr(obj, obj_name)
                return obj, parent, modname
            else:
                return sys.modules[modname], None, modname
        except (ValueError, ImportError, AttributeError, KeyError) as exc:
            errors.append(exc)
            if grouped_exception:
                msg = ''
                raise ImportExceptionGroup(msg, errors) from exc
            else:
                raise ImportError(*exc.args) from exc

    sphinx.ext.autosummary._import_by_name = _import_by_name

patch_introspection()

# -- Project information -----------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#project-information

project = 'ST Annotator Platform'
copyright = '2023, DESRLab'
author = 'Cyrus Leung <tlleungac@connect.ust.hk>, Maral Bahari <mbahari@connect.ust.hk>'

version = '5.0.0'
release = '5.0.0'

# -- General configuration ---------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#general-configuration

extensions = [
    'sphinx.ext.autodoc',
    'sphinx.ext.autosummary',
    'sphinx.ext.intersphinx',
    'sphinx.ext.napoleon',
    'sphinx.ext.todo',
    'sphinx.ext.viewcode',
    'sphinx_immaterial',
]

templates_path = ['_templates']
exclude_patterns = ['_build', 'Thumbs.db', '.DS_Store']

# -- Options for HTML output -------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#options-for-html-output

html_theme = 'sphinx_immaterial'

# Material theme options (see theme.conf for more information)
html_theme_options = {
    'features': [
        'navigation.tabs.sticky',
        'navigation.indexes',
        'navigation.sections',
        'navigation.footer',
        'navigation.top',
        'toc.follow',
    ],
    'palette': [
        {
            'media': '(prefers-color-scheme: light)',
            'scheme': 'default',
            'primary': 'blue',
            'accent': 'blue',
            'toggle': {
                'icon': 'material/brightness-7',
                'name': 'Switch to dark mode',
            },
        },
        {
            'media': '(prefers-color-scheme: dark)',
            'scheme': 'slate',
            'primary': 'indigo',
            'accent': 'indigo',
            'toggle': {
                'icon': 'material/brightness-4',
                'name': 'Switch to light mode',
            },
        },
    ],
    'globaltoc_collapse': False,
}

html_title = 'Base Platform (Python API)'
html_static_path = ['_static']

html_logo = '_static/logo.png'
html_favicon = '_static/favicon.ico'

# -- Options for autodoc extension -------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/extensions/autodoc.html#configuration

autodoc_default_options = {
    'show-inheritance': True,
}

# -- Options for autosummary extension ---------------------------------------
# https://www.sphinx-doc.org/en/master/usage/extensions/autosummary.html#generating-stub-pages-automatically

autosummary_generate = True
# autosummary_ignore_module_all = False
# autosummary_imported_members = True

# -- Options for napoleon extension ------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/extensions/napoleon.html#configuration

napoleon_type_aliases = {
    'JSONType': 'sta.common.utils.json.JSONType',
    'JSONUnit': 'sta.common.utils.json.JSONUnit',
    'collection': ':class:`collection <collections.abc.Collection>`',
    'mapping': ':class:`sequence <collections.abc.Mapping>`',
    'sequence': ':class:`sequence <collections.abc.Sequence>`',
    'ordered set': ':class:`ordered set <ordered_set.OrderedSet>`',
}

# -- Options for intersphinx extension ---------------------------------------
# https://www.sphinx-doc.org/en/master/usage/extensions/intersphinx.html#configuration

intersphinx_mapping = {
    'python': ('https://docs.python.org/3', None),
    'typing_extensions': ('https://typing-extensions.readthedocs.io/en/latest', None),
    'argon2': ('https://argon2-cffi.readthedocs.io/en/stable', None),
    'numpy': ('https://numpy.org/doc/stable', None),
    'pandas': ('https://pandas.pydata.org/docs', None),
    'sqlalchemy': ('https://docs.sqlalchemy.org/en/14', None),
    'hypothesis': ('https://hypothesis.readthedocs.io/en/latest', None),
}

# -- Options for todo extension ----------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/extensions/todo.html#configuration

todo_include_todos = True
