"""Unit tests for the placeholder machinery used by ``push_commits``."""

import uuid

from pydantic import BaseModel

import pytest

from sta.domain.label.repo.placeholder import Placeholders, _Placeholder


def test_key_tracking_properties():
    placeholders = Placeholders(["a", "b"])

    assert set(placeholders.keys) == {"a", "b"}
    assert placeholders.resolved_keys == set()
    assert placeholders.unresolved_keys == {"a", "b"}

    placeholders.resolve_item("a", 1)

    assert placeholders.resolved_keys == {"a"}
    assert placeholders.unresolved_keys == {"b"}


def test_get_unknown_placeholder_key_raises_key_error():
    placeholders = Placeholders(["a"])

    with pytest.raises(KeyError, match="There is no placeholder with the following key"):
        placeholders._get_placeholder("missing")

    with pytest.raises(KeyError, match="There is no placeholder with the following key"):
        placeholders.resolve_item("missing", 1)


def test_get_before_put_raises_not_resolved():
    placeholders = Placeholders(["a"])

    with pytest.raises(_Placeholder.NotResolved, match="a"):
        placeholders._get_placeholder("a").get()


def test_put_twice_raises_already_resolved():
    placeholder = _Placeholder("a")
    placeholder.put(1)

    with pytest.raises(_Placeholder.AlreadyResolved, match="a"):
        placeholder.put(2)


def test_resolve_item_then_get():
    placeholders = Placeholders(["a"])
    value = uuid.uuid4()

    placeholders.resolve_item("a", value)

    placeholder = placeholders._get_placeholder("a")
    assert placeholder.is_resolved
    assert placeholder.get() is value


def test_get_resolved_params_substitutes_exact_key_strings_only():
    placeholders = Placeholders(["a", "b"])
    resolved_id = uuid.uuid4()
    placeholders.resolve_item("a", resolved_id)
    placeholders.resolve_item("b", {"nested": True})

    params = {
        "id": "a",
        "payload": "b",
        "untouched": "not-a-key",
        "nested": {"id": "a", "flag": False},
        "items": ["a", 1, None, ["b"], ("a",)],
    }

    resolved = placeholders.get_resolved_params(params)

    assert resolved == {
        "id": resolved_id,
        "payload": {"nested": True},
        "untouched": "not-a-key",
        "nested": {"id": resolved_id, "flag": False},
        "items": [resolved_id, 1, None, [{"nested": True}], (resolved_id,)],
    }


def test_get_resolved_params_unresolved_raises_value_error():
    placeholders = Placeholders(["a"])

    with pytest.raises(ValueError, match="not fully resolved"):
        placeholders.get_resolved_params({"id": "a"})


class _UuidParams(BaseModel):
    """Mimics an operation-params model with an id field, e.g. ``box-delete``."""

    id: uuid.UUID


def test_get_resolved_params_resolves_braced_key_coerced_into_uuid_field():
    """
    Placeholder keys travel on the wire as braced UUID strings. Validating them
    against a ``uuid.UUID``-typed params field coerces the value and silently
    drops the braces, so the raw key never reaches :class:`Placeholders`. The
    braced form must still be recognized, otherwise the placeholder resolves to
    itself and the subsequent lookup fails.
    """
    key = f"{{{uuid.uuid4()}}}"
    resolved_id = uuid.uuid4()

    placeholders = Placeholders([key])
    placeholders.resolve_item(key, resolved_id)

    # ``model_validate`` reproduces what request-body validation does to the key.
    params = _UuidParams.model_validate({"id": key})
    assert isinstance(params.id, uuid.UUID)

    resolved = placeholders.get_resolved_params(params)

    assert isinstance(resolved, _UuidParams)
    assert resolved.id == resolved_id


def test_get_resolved_params_leaves_unreferenced_uuid_values_untouched():
    placeholders = Placeholders([f"{{{uuid.uuid4()}}}"])
    params = _UuidParams(id=uuid.uuid4())

    assert placeholders.get_resolved_params(params) is params
