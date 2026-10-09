from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime
from decimal import Decimal, getcontext as get_decimal_context
from itertools import chain
from typing import Any, Literal, TypeVar
from typing_extensions import TypeAliasType

from pydantic import AwareDatetime, BaseModel, NaiveDatetime, TypeAdapter, ValidationError
from pydantic.fields import FieldInfo

from hypothesis import strategies as st
from hypothesis.strategies._internal import types as st_types

from ..spatial import (
    DecimalCoord3,
    DecimalSize3,
    OptionalDecimalCoord3,
    PartialSTBounds,
    STBounds,
    Transform,
)
from ..utils.json import JSONType, JSONUnit

__all__ = [
    'merge_st_dictionaries',
    'st_decimals',
    'st_from_type_except',
    'st_ints',
    'st_jsontypes',
    'st_numbers',
    'st_pydantic_models',
    'st_schema_dicts',
    'st_with_idx',
    'st_with_idxs',
]


def st_ints(
    *,
    min_value: int | None = None,
    max_value: int | None = None,
    exclude_min: bool = False,
    exclude_max: bool = False,
) -> st.SearchStrategy[int]:
    """Returns a strategy that generates an integer."""
    int_st = st.integers(min_value=min_value, max_value=max_value)

    if min_value is not None:
        if exclude_min:
            int_st = int_st.filter(lambda x: x > min_value)

    if max_value is not None:
        if exclude_max:
            int_st = int_st.filter(lambda x: x < max_value)

    return int_st


def st_numbers(
    *,
    min_value: int | float | None = None,
    max_value: int | float | None = None,
    allow_nan: bool | None = None,
    allow_infinity: bool | None = None,
    float_width: Literal[16, 32, 64] = 64,
    exclude_min: bool = False,
    exclude_max: bool = False,
) -> st.SearchStrategy[int | float]:
    """Returns a strategy that generates an integer or floating-point number."""
    return st.one_of(
        st_ints(
            min_value=min_value,
            max_value=max_value,
            exclude_min=exclude_min,
            exclude_max=exclude_max,
        ),
        st.floats(
            min_value=min_value,
            max_value=max_value,
            allow_nan=allow_nan,
            allow_infinity=allow_infinity,
            width=float_width,
            exclude_min=exclude_min,
            exclude_max=exclude_max,
        ),
    )

def st_schema_dicts(
    *,
    required: dict[str, st.SearchStrategy[Any]],
    required_bad: dict[str, st.SearchStrategy[Any]],
    optional: dict[str, st.SearchStrategy[Any]],
    optional_bad: dict[str, st.SearchStrategy[Any]],
    valid: bool,
) -> st.SearchStrategy[dict[str, Any]]:
    """Returns a strategy that generates dictionaries that always match or not match a schema."""
    if required.keys() != required_bad.keys():
        msg = 'Keys do not match between `required` and `required_bad`'
        raise ValueError(msg)
    if optional.keys() != optional_bad.keys():
        msg = 'Keys do not match between `optional` and `optional_bad`'
        raise ValueError(msg)

    if valid:
        return st.fixed_dictionaries(required, optional=optional)

    bad_st = st.nothing()
    if required:
        # Missing values for required attributes
        bad_st |= st.fixed_dictionaries({}, optional=optional)
    if required_bad:
        # Invalid values for required attributes
        bad_st |= st.fixed_dictionaries(required_bad, optional=optional)
    if optional_bad:
        # Invalid values for optional attributes
        bad_st |= st.fixed_dictionaries({**required, **optional_bad})

    return bad_st

def st_decimals(
    min_value: Decimal | None = None,
    max_value: Decimal | None = None,
    *,
    allow_nan: bool | None = None,
    allow_infinity: bool | None = None,
    places: int | None = None,
    exclude_min: bool = False,
    exclude_max: bool = False,
):
    """Returns a strategy that generates :class:`Decimal` objects."""
    if places is None:
        places = get_decimal_context().prec

    if exclude_min:
        if min_value is None or places is None:
            msg = '`exclude_min` must be specified along with `min_value` and `places`'
            raise ValueError(msg)

        eps = Decimal(10) ** -places
        min_value = min_value + eps

    if exclude_max:
        if max_value is None or places is None:
            msg = '`exclude_max` must be specified along with `max_value` and `places`'
            raise ValueError(msg)

        eps = Decimal(10) ** -places
        max_value = max_value - eps

    return st.decimals(
        min_value=min_value,
        max_value=max_value,
        allow_nan=allow_nan,
        allow_infinity=allow_infinity,
        places=places,
    )

def st_jsontypes(st_unit: st.SearchStrategy[JSONUnit] | None = None) -> st.SearchStrategy[JSONType]:
    """
    Returns a strategy that generates :class:`JSONType` objects.

    Note that the Pydantic may serialize tuples as lists.
    As a result, the deserialized data may not be exactly equal to the original data.
    Keeping this in mind, :func:`sta.common.testing.jsontypes_equal` can be used to compare such data.
    """
    if st_unit is None:
        st_unit = st.text() | st.floats(allow_nan=False, allow_infinity=False) | st.integers() | st.booleans() | st.none()

    return st.recursive(
        st_unit,
        lambda children: st.lists(children) | st.tuples(children) | st.dictionaries(st.text(), children),
    )

def st_from_type_except(*excluded_types: type[Any]) -> st.SearchStrategy[Any]:
    """Returns a strategy that generates items of any type except for those in `excluded_types`."""
    return st.from_type(type) \
        .flatmap(st.from_type) \
        .filter(lambda x: not isinstance(x, excluded_types))


T = TypeVar('T')

def st_with_idx(st_sequence: st.SearchStrategy[Sequence[T]]) -> st.SearchStrategy[tuple[Sequence[T], int]]:
    """
    Returns a strategy that generates the same sequence as the input strategy while also
    selecting an index from that sequence.
    """
    @st.composite
    def build_st(draw: st.DrawFn):
        seq = draw(st_sequence, label='seq')
        idx = draw(st.integers(min_value=0, max_value=len(seq) - 1), label='idx')

        return seq, idx

    return build_st()

def st_with_idxs(
    st_sequence: st.SearchStrategy[Sequence[T]],
    *,
    idxs_min_size: int = 0,
    idxs_max_size: int | None = None,
    idxs_unique: bool = False,
) -> st.SearchStrategy[tuple[Sequence[T], Sequence[int]]]:
    """
    Returns a strategy that generates the same sequence as the input strategy while also
    selecting any number of indices from that sequence.
    """
    @st.composite
    def build_st(draw: st.DrawFn):
        seq = draw(st_sequence, label='seq')

        if idxs_unique and idxs_min_size > len(seq):
            msg = f'Unable to generate {idxs_min_size} unique indices for a sequence with length {len(seq)}'
            raise RuntimeError(msg)

        if len(seq) == 0:
            st_idxs = st.builds(list)
        else:
            st_idxs = st.lists(
                st.integers(min_value=0, max_value=len(seq) - 1),
                min_size=idxs_min_size,
                max_size=idxs_max_size,
                unique=idxs_unique,
            )

        idxs = draw(st_idxs, label='idxs')

        return seq, idxs

    return build_st()

def merge_st_dictionaries(*st_dicts: st.SearchStrategy[Mapping[str, T]]) -> st.SearchStrategy[Mapping[str, T]]:
    """Returns a strategy that merges the dictionaries generated from each input strategy."""
    return st.tuples(*st_dicts) \
        .map(lambda dicts: dict(chain.from_iterable(d.items() for d in dicts)))


_M = TypeVar("_M", bound=BaseModel)

def _init_strategy(field_info: FieldInfo):
    field_type = field_info.annotation
    constraints = {
        k: getattr(mt, k)
        for mt in field_info.metadata
        for k in dir(mt)
        if k in FieldInfo.metadata_lookup
    }

    if isinstance(field_type, type):
        if issubclass(field_type, bool):
            return st.booleans()
        if issubclass(field_type, int):
            return st_ints(
                min_value=constraints.get("gt", constraints.get("ge")),
                max_value=constraints.get("lt", constraints.get("le")),
                exclude_min=constraints.get("gt") is not None,
                exclude_max=constraints.get("lt") is not None,
            )
        if issubclass(field_type, Decimal):
            return st_decimals(
                min_value=constraints.get("gt", constraints.get("ge")),
                max_value=constraints.get("lt", constraints.get("le")),
                allow_nan=constraints.get("allow_inf_nan"),
                allow_infinity=constraints.get("allow_inf_nan"),
                places=constraints.get("decimal_places"),
                exclude_min=constraints.get("gt") is not None,
                exclude_max=constraints.get("lt") is not None,
            )
        if issubclass(field_type, float):
            return st.floats(
                min_value=constraints.get("gt", constraints.get("ge")),
                max_value=constraints.get("lt", constraints.get("le")),
                allow_nan=constraints.get("allow_inf_nan"),
                allow_infinity=constraints.get("allow_inf_nan"),
                exclude_min=constraints.get("gt") is not None,
                exclude_max=constraints.get("lt") is not None,
            )
        if issubclass(field_type, (str, bytes)):
            if (pattern := constraints.get("pattern")):
                return st.from_regex(pattern)

    return st.from_type(field_type)

def _validation_filter(typ: TypeAdapter):
    def validate(value: Any):
        try:
            typ.validate_python(value)
        except ValidationError:
            return False
        else:
            return True

    return validate

def _st_pydantic_field(field_info: FieldInfo):
    field_type = field_info.annotation
    if issubclass(field_type, BaseModel):
        return st_pydantic_models(field_type)

    # Optimize by bringing some preconditions into the initial strategy
    strategy = _init_strategy(field_info)

    constraints_map = st_types.get_constraints_filter_map()
    for constraint in st_types._get_constraints(field_info.metadata):
        if convert := constraints_map.get(type(constraint)):
            strategy = strategy.filter(convert(constraint))

    typ = TypeAdapter(field_info.rebuild_annotation())
    return strategy.filter(_validation_filter(typ))

def st_pydantic_models(typ: type[_M], **kwargs: st.SearchStrategy[Any]) -> st.SearchStrategy[_M]:
    st_fields = {k: _st_pydantic_field(v) for k, v in typ.model_fields.items()}
    st_fields.update(kwargs)

    return st.builds(typ, **st_fields)


# Allow JSONType to be used to generate strategies
orig_is_a_type = st_types.is_a_type

def _is_a_type(thing: object):
    return orig_is_a_type(thing) or isinstance(thing, TypeAliasType)

st_types.is_a_type = _is_a_type


B = TypeVar("B", bound=Decimal | datetime | None)

def _normalize_bounds(lower: B, upper: B) -> tuple[B , B]:
    if lower is not None and upper is not None and lower > upper:
        return upper, lower

    return lower, upper


def _st_decimal_coord_component() -> st.SearchStrategy[Decimal]:
    return st_decimals(
        min_value=Decimal('-999999'),
        max_value=Decimal('999999'),
        allow_nan=False,
        allow_infinity=False,
        places=6,
    )


def _st_decimal_size_component() -> st.SearchStrategy[Decimal]:
    return st_decimals(
        min_value=Decimal('0.000001'),
        max_value=Decimal('999999'),
        allow_nan=False,
        allow_infinity=False,
        places=6,
    )


def _st_aware_datetimes() -> st.SearchStrategy[AwareDatetime]:
    return st.datetimes(timezones=st.timezones())


@st.composite
def _st_decimal_coord3(draw: st.DrawFn) -> DecimalCoord3:
    component = _st_decimal_coord_component()

    return DecimalCoord3(
        x=draw(component, label='x'),
        y=draw(component, label='y'),
        z=draw(component, label='z'),
    )


@st.composite
def _st_decimal_size3(draw: st.DrawFn) -> DecimalSize3:
    component = _st_decimal_size_component()

    return DecimalSize3(
        x=draw(component, label='x'),
        y=draw(component, label='y'),
        z=draw(component, label='z'),
    )


@st.composite
def _st_optional_decimal_coord3(draw: st.DrawFn) -> OptionalDecimalCoord3:
    component = _st_decimal_coord_component() | st.none()

    return OptionalDecimalCoord3(
        x=draw(component, label='x'),
        y=draw(component, label='y'),
        z=draw(component, label='z'),
    )


@st.composite
def _st_partial_stbounds(draw: st.DrawFn) -> PartialSTBounds:
    component = _st_decimal_coord_component()
    maybe_component = component | st.none()
    maybe_timestamp = _st_aware_datetimes() | st.none()

    min_x, max_x = _normalize_bounds(
        draw(maybe_component, label='x1'),
        draw(maybe_component, label='x2'),
    )
    min_y, max_y = _normalize_bounds(
        draw(maybe_component, label='y1'),
        draw(maybe_component, label='y2'),
    )
    min_z, max_z = _normalize_bounds(
        draw(maybe_component, label='z1'),
        draw(maybe_component, label='z2'),
    )
    min_timestamp, max_timestamp = _normalize_bounds(
        draw(maybe_timestamp, label='t1'),
        draw(maybe_timestamp, label='t2'),
    )

    return PartialSTBounds(
        min_coords=OptionalDecimalCoord3(x=min_x, y=min_y, z=min_z),
        max_coords=OptionalDecimalCoord3(x=max_x, y=max_y, z=max_z),
        min_timestamp=min_timestamp,
        max_timestamp=max_timestamp,
    )


@st.composite
def _st_stbounds(draw: st.DrawFn) -> STBounds:
    component = _st_decimal_coord_component()
    timestamp = _st_aware_datetimes()

    min_x, max_x = _normalize_bounds(
        draw(component, label='x1'),
        draw(component, label='x2'),
    )
    min_y, max_y = _normalize_bounds(
        draw(component, label='y1'),
        draw(component, label='y2'),
    )
    min_z, max_z = _normalize_bounds(
        draw(component, label='z1'),
        draw(component, label='z2'),
    )
    min_timestamp, max_timestamp = _normalize_bounds(
        draw(timestamp, label='t1'),
        draw(timestamp, label='t2'),
    )

    return STBounds(
        min_coords=DecimalCoord3(x=min_x, y=min_y, z=min_z),
        max_coords=DecimalCoord3(x=max_x, y=max_y, z=max_z),
        min_timestamp=min_timestamp,
        max_timestamp=max_timestamp,
    )


@st.composite
def _st_transform(draw: st.DrawFn) -> Transform:
    component = _st_optional_decimal_coord3() | _st_decimal_coord3() | st.none()

    return Transform.from_optional(
        translation=draw(component, label='translation'),
        rotation=draw(component, label='rotation'),
        scale=draw(component, label='scale'),
    )


def register_type_strategies():
    st.register_type_strategy(AwareDatetime, _st_aware_datetimes())
    st.register_type_strategy(NaiveDatetime, st.datetimes(timezones=st.none()))
    st.register_type_strategy(JSONType, st_jsontypes())
    st.register_type_strategy(DecimalCoord3, _st_decimal_coord3())
    st.register_type_strategy(DecimalSize3, _st_decimal_size3())
    st.register_type_strategy(OptionalDecimalCoord3, _st_optional_decimal_coord3())
    st.register_type_strategy(PartialSTBounds, _st_partial_stbounds())
    st.register_type_strategy(STBounds, _st_stbounds())
    st.register_type_strategy(Transform, _st_transform())


register_type_strategies()
