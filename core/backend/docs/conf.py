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
    from sphinx.ext.autodoc import INSTANCEATTR
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

    def _is_annotation_only_member(parent: Any, name: str) -> bool:
        # Pydantic fields are not accessible as class attributes, so members
        # that are only declared through an (inherited) annotation cannot be
        # resolved through attribute access alone.
        if not inspect.isclass(parent):
            return False

        return any(name in vars(base).get("__annotations__", {}) for base in parent.__mro__)

    def _import_by_name(name: str, grouped_exception: bool = True):  # noqa: FBT001, FBT002
        errors: list[BaseException] = []

        try:
            name_parts = name.split(".")

            # try first interpret `name` as MODNAME.OBJ
            modname = ".".join(name_parts[:-1])
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
                modname = ".".join(name_parts[:j])
                try:
                    import_module(modname)
                except ImportError as exc:
                    errors.append(exc.__cause__ or exc)

                if modname in sys.modules:
                    break

            assert isinstance(modname, str), "`name_parts` is empty"

            if last_j < len(name_parts):
                parent = None
                obj = sys.modules[modname]
                obj_names = name_parts[last_j:]
                for i, obj_name in enumerate(obj_names):
                    parent = obj
                    try:
                        obj = safe_getattr(obj, obj_name)
                    except AttributeError:
                        if i < len(obj_names) - 1 or not _is_annotation_only_member(
                            parent, obj_name
                        ):
                            raise
                        return INSTANCEATTR, parent, modname
                return obj, parent, modname
            else:
                return sys.modules[modname], None, modname
        except (ValueError, ImportError, AttributeError, KeyError) as exc:
            errors.append(exc)
            if grouped_exception:
                msg = ""
                raise ImportExceptionGroup(msg, errors) from exc
            else:
                raise ImportError(*exc.args) from exc

    sphinx.ext.autosummary._import_by_name = _import_by_name


def patch_type_hints():
    """
    Patches autodoc's type hint introspection to also resolve annotations
    declared on base classes. Pydantic models do not expose (inherited) fields
    as class attributes, so annotation-only members would otherwise fail to
    resolve on subclasses.
    """
    from typing import Any

    import sphinx.ext.autodoc

    _orig_get_type_hints = sphinx.ext.autodoc.get_type_hints
    _merged_type_hints: dict[tuple[Any, Any], dict[str, Any]] = {}

    def _get_merged_type_hints(
        obj: Any, globalns: Any = None, localns: Any = None
    ) -> dict[str, Any]:
        if not isinstance(obj, type) or globalns is not None:
            return _orig_get_type_hints(obj, globalns, localns)

        cache_key = (obj, id(localns))
        cached = _merged_type_hints.get(cache_key)
        if cached is not None:
            return cached

        try:
            hints = dict(_orig_get_type_hints(obj, None, localns))
        except Exception:
            hints = {}

        for cls in reversed(obj.__mro__[1:]):
            annotations = vars(cls).get("__annotations__")
            if not annotations:
                continue

            try:
                resolved = _orig_get_type_hints(cls, None, localns)
            except Exception:
                resolved = {}

            for attr_name in annotations:
                if attr_name not in hints:
                    hints[attr_name] = resolved.get(attr_name, annotations[attr_name])

        _merged_type_hints[cache_key] = hints
        return hints

    sphinx.ext.autodoc.get_type_hints = _get_merged_type_hints


def patch_object_description():
    """
    Patches object descriptions to render class objects by name rather than
    as `<class 'X'>`; the latter is not parseable Python and breaks signature
    introspection of parameters with a class as default value.
    """
    import sphinx.ext.autodoc
    import sphinx.util.inspect

    _orig_object_description = sphinx.util.inspect.object_description

    def _object_description(obj: object) -> str:
        if isinstance(obj, type):
            name = getattr(obj, "__qualname__", None) or getattr(obj, "__name__", None)
            if name and "<" not in name:
                module = getattr(obj, "__module__", None)
                if module and module != "builtins":
                    return f"{module}.{name}"
                return name

        return _orig_object_description(obj)

    sphinx.util.inspect.object_description = _object_description
    sphinx.ext.autodoc.object_description = _object_description


def defined_in_project(qualname: str, name: str) -> bool:
    """
    Tests whether the (possibly inherited) member of the given class is
    defined within this project, used by the autosummary templates to exclude
    third-party members inherited from e.g. pydantic or SQLModel.
    """
    import importlib

    module_name, _, class_name = qualname.rpartition(".")
    try:
        obj = importlib.import_module(module_name)
        for part in class_name.split("."):
            obj = getattr(obj, part)

        for base in getattr(obj, "__mro__", [obj]):
            if name in vars(base):
                return getattr(base, "__module__", "").startswith("sta.")
    except Exception:
        pass

    return True


def select_members(qualname: str, members: list[str], inherited_members: set[str]) -> list[str]:
    """
    Filters out members inherited from third-party packages, which tend to
    have docstrings that do not render cleanly (e.g. pydantic's `BaseModel`
    methods), while keeping members defined within this project.
    """
    return [
        name
        for name in members
        if name not in inherited_members or defined_in_project(qualname, name)
    ]


patch_introspection()
patch_type_hints()
patch_object_description()

# -- Project information -----------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#project-information

project = "ST Annotator Platform"
copyright = "2026, DESRLab"
author = "Cyrus Leung <tlleungac@connect.ust.hk>, Maral Bahari <mbahari@connect.ust.hk>"

version = "5.0.0"
release = "5.0.0"

# -- General configuration ---------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#general-configuration

extensions = [
    "sphinx.ext.autodoc",
    "sphinx.ext.autosummary",
    "sphinx.ext.intersphinx",
    "sphinx.ext.napoleon",
    "sphinx.ext.todo",
    "sphinx.ext.viewcode",
    "sphinx_immaterial",
]

templates_path = ["_templates"]
exclude_patterns = ["_build", "Thumbs.db", ".DS_Store"]

# -- Options for HTML output -------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#options-for-html-output

html_theme = "sphinx_immaterial"

# Material theme options (see theme.conf for more information)
html_theme_options = {
    "features": [
        "navigation.tabs.sticky",
        "navigation.indexes",
        "navigation.sections",
        "navigation.footer",
        "navigation.top",
        "toc.follow",
    ],
    "palette": [
        {
            "media": "(prefers-color-scheme: light)",
            "scheme": "default",
            "primary": "blue",
            "accent": "blue",
            "toggle": {
                "icon": "material/brightness-7",
                "name": "Switch to dark mode",
            },
        },
        {
            "media": "(prefers-color-scheme: dark)",
            "scheme": "slate",
            "primary": "indigo",
            "accent": "indigo",
            "toggle": {
                "icon": "material/brightness-4",
                "name": "Switch to light mode",
            },
        },
    ],
    "globaltoc_collapse": False,
}

html_title = "Base Platform (Python API)"
html_static_path = ["_static"]

html_logo = "_static/logo.png"
html_favicon = "_static/favicon.ico"

# -- Options for autodoc extension -------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/extensions/autodoc.html#configuration

autodoc_default_options = {
    "show-inheritance": True,
}

# -- Options for autosummary extension ---------------------------------------
# https://www.sphinx-doc.org/en/master/usage/extensions/autosummary.html#generating-stub-pages-automatically

autosummary_generate = True
# autosummary_ignore_module_all = False
# autosummary_imported_members = True
autosummary_context = {
    "select_members": select_members,
}

# -- Options for napoleon extension ------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/extensions/napoleon.html#configuration

napoleon_type_aliases = {
    "JSONType": "sta.common.utils.json.JSONType",
    "JSONUnit": "sta.common.utils.json.JSONUnit",
    "collection": ":class:`collection <collections.abc.Collection>`",
    "mapping": ":class:`sequence <collections.abc.Mapping>`",
    "sequence": ":class:`sequence <collections.abc.Sequence>`",
    "ordered set": ":class:`ordered set <ordered_set.OrderedSet>`",
}

# -- Options for intersphinx extension ---------------------------------------
# https://www.sphinx-doc.org/en/master/usage/extensions/intersphinx.html#configuration

intersphinx_mapping = {
    "python": ("https://docs.python.org/3", None),
    "typing_extensions": ("https://typing-extensions.readthedocs.io/en/latest", None),
    "argon2": ("https://argon2-cffi.readthedocs.io/en/stable", None),
    "numpy": ("https://numpy.org/doc/stable", None),
    "pandas": ("https://pandas.pydata.org/docs", None),
    "sqlalchemy": ("https://docs.sqlalchemy.org/en/14", None),
    "hypothesis": ("https://hypothesis.readthedocs.io/en/latest", None),
}

# -- Options for todo extension ----------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/extensions/todo.html#configuration

todo_include_todos = True
