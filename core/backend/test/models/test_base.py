"""Tests for the SQL-mixin factories of :mod:`sta.models.base`.

Covers the :class:`PartialSTBounds` and :class:`Transform` storage mixins:
their coordinate/component properties, the ``unpack_*`` dict builders, the
``update_from_*`` mutation helpers, the generated update classes, and the
column-type factories.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Optional

from pydantic import AwareDatetime, ValidationError
from sqlalchemy.sql.sqltypes import Float

import pytest

from sta.common.database.types import DecimalString
from sta.common.spatial import (
    DecimalCoord3,
    OptionalDecimalCoord3,
    PartialSTBounds,
    Transform,
)
from sta.models.base import (
    BaseSQLModel,
    PartialSTBoundsSQLMixin,
    TransformSQLMixin,
    _accepts_none,
    non_nullable_field_names,
    st_bounds_coord_type,
    transform_component_type,
)

MIN_TIMESTAMP: AwareDatetime = datetime(2024, 1, 1, tzinfo=timezone.utc)
MAX_TIMESTAMP: AwareDatetime = datetime(2024, 6, 1, tzinfo=timezone.utc)

BoundsMixin = PartialSTBoundsSQLMixin()
TransformMixin = TransformSQLMixin()


class TestSTBoundsCoordType:
    def test_defaults_to_decimal_string(self):
        coord_type = st_bounds_coord_type()

        assert isinstance(coord_type, DecimalString)
        assert coord_type.precision == 12
        assert coord_type.scale == 6

    def test_queryable_uses_indexable_float(self):
        coord_type = st_bounds_coord_type(precision=10, scale=3, queryable=True)

        assert isinstance(coord_type, Float)
        assert coord_type.precision == 10
        assert coord_type.asdecimal
        assert coord_type.decimal_return_scale == 3


class TestPartialSTBoundsSQLMixin:
    def test_coord_type_classvar_follows_factory_args(self):
        assert isinstance(BoundsMixin.COORD_TYPE, DecimalString)
        assert BoundsMixin.COORD_TYPE.precision == 12
        assert BoundsMixin.COORD_TYPE.scale == 6

        custom = PartialSTBoundsSQLMixin(precision=10, scale=3)
        assert isinstance(custom.COORD_TYPE, DecimalString)
        assert custom.COORD_TYPE.precision == 10
        assert custom.COORD_TYPE.scale == 3

        queryable = PartialSTBoundsSQLMixin(queryable=True)
        assert isinstance(queryable.COORD_TYPE, Float)

    def test_default_instance_is_unbounded(self):
        instance = BoundsMixin()

        assert instance.st_bounds == PartialSTBounds(
            min_coords=OptionalDecimalCoord3(x=None, y=None, z=None),
            max_coords=OptionalDecimalCoord3(x=None, y=None, z=None),
            min_timestamp=None,
            max_timestamp=None,
        )

    def test_st_bounds_round_trip(self):
        bounds = PartialSTBounds(
            min_coords=OptionalDecimalCoord3(x=Decimal("0"), y=Decimal("1.5"), z=None),
            max_coords=OptionalDecimalCoord3(x=Decimal("10"), y=None, z=Decimal("-2.25")),
            min_timestamp=MIN_TIMESTAMP,
            max_timestamp=MAX_TIMESTAMP,
        )

        instance = BoundsMixin(**BoundsMixin.unpack_st_bounds(bounds))

        assert instance.min_coords == bounds.min_coords
        assert instance.max_coords == bounds.max_coords
        assert instance.st_bounds == bounds

    def test_unpack_min_coords(self):
        assert BoundsMixin.unpack_min_coords(
            DecimalCoord3(x=Decimal("1"), y=Decimal("2"), z=Decimal("3"))
        ) == {
            "min_x": Decimal("1"),
            "min_y": Decimal("2"),
            "min_z": Decimal("3"),
        }

    def test_unpack_max_coords(self):
        coords = OptionalDecimalCoord3(x=Decimal("4"), y=None, z=Decimal("6"))

        assert BoundsMixin.unpack_max_coords(coords) == {
            "max_x": Decimal("4"),
            "max_y": None,
            "max_z": Decimal("6"),
        }

    def _seeded_instance(self):
        return BoundsMixin(
            **BoundsMixin.unpack_st_bounds(
                PartialSTBounds(
                    min_coords=OptionalDecimalCoord3(
                        x=Decimal("0"), y=Decimal("0"), z=Decimal("0")
                    ),
                    max_coords=OptionalDecimalCoord3(
                        x=Decimal("1"), y=Decimal("1"), z=Decimal("1")
                    ),
                    min_timestamp=MIN_TIMESTAMP,
                    max_timestamp=MAX_TIMESTAMP,
                )
            )
        )

    def test_update_from_st_bounds_writes_none_components_when_not_excluded(self):
        instance = self._seeded_instance()
        partial_bounds = PartialSTBounds(
            min_coords=OptionalDecimalCoord3(x=Decimal("5"), y=None, z=None),
            max_coords=OptionalDecimalCoord3(x=None, y=None, z=None),
            min_timestamp=None,
            max_timestamp=MAX_TIMESTAMP,
        )

        result = instance.update_from_st_bounds(partial_bounds, exclude_none=False)

        assert result is instance
        assert instance.st_bounds == partial_bounds

    def test_update_from_st_bounds_skips_none_components_when_excluded(self):
        instance = self._seeded_instance()
        partial_bounds = PartialSTBounds(
            min_coords=OptionalDecimalCoord3(x=Decimal("5"), y=None, z=None),
            max_coords=OptionalDecimalCoord3(x=None, y=None, z=None),
            min_timestamp=None,
            max_timestamp=None,
        )

        instance.update_from_st_bounds(partial_bounds, exclude_none=True)

        assert instance.min_x == Decimal("5")
        assert instance.min_y == Decimal("0")
        assert instance.min_z == Decimal("0")
        assert instance.max_x == Decimal("1")
        assert instance.min_timestamp == MIN_TIMESTAMP
        assert instance.max_timestamp == MAX_TIMESTAMP

    def test_get_update_cls_has_all_optional_fields(self):
        update_cls = BoundsMixin.get_update_cls()

        update = update_cls()
        for field_name in (
            "min_x",
            "min_y",
            "min_z",
            "max_x",
            "max_y",
            "max_z",
            "min_timestamp",
            "max_timestamp",
        ):
            assert getattr(update, field_name) is None

        assert update_cls(min_x=Decimal("1"), max_timestamp=MAX_TIMESTAMP) is not None


class TestTransformComponentType:
    def test_defaults_to_decimal_string(self):
        component_type = transform_component_type()

        assert isinstance(component_type, DecimalString)
        assert component_type.precision == 16
        assert component_type.scale == 8

    def test_custom_precision_and_scale(self):
        component_type = transform_component_type(precision=20, scale=10)

        assert component_type.precision == 20
        assert component_type.scale == 10


class TestTransformSQLMixin:
    def _seeded_instance(self):
        return TransformMixin(
            **TransformMixin.unpack_transform(
                Transform(
                    translation=DecimalCoord3(x=Decimal("1"), y=Decimal("2"), z=Decimal("3")),
                    rotation=DecimalCoord3(x=Decimal("0.1"), y=Decimal("0.2"), z=Decimal("0.3")),
                    scale=DecimalCoord3(x=Decimal("2"), y=Decimal("2"), z=Decimal("2")),
                )
            )
        )

    def test_component_properties(self):
        instance = self._seeded_instance()

        assert instance.translation == DecimalCoord3(x=Decimal("1"), y=Decimal("2"), z=Decimal("3"))
        assert instance.rotation == DecimalCoord3(
            x=Decimal("0.1"), y=Decimal("0.2"), z=Decimal("0.3")
        )
        assert instance.scale == DecimalCoord3(x=Decimal("2"), y=Decimal("2"), z=Decimal("2"))

    def test_transform_property(self):
        instance = self._seeded_instance()

        assert instance.transform == Transform(
            translation=instance.translation,
            rotation=instance.rotation,
            scale=instance.scale,
        )

    def test_unpack_transform(self):
        transform = Transform(
            translation=DecimalCoord3(x=Decimal("1"), y=Decimal("2"), z=Decimal("3")),
            rotation=DecimalCoord3(x=Decimal("4"), y=Decimal("5"), z=Decimal("6")),
            scale=DecimalCoord3(x=Decimal("7"), y=Decimal("8"), z=Decimal("9")),
        )

        assert TransformMixin.unpack_transform(transform) == {
            "translate_x": Decimal("1"),
            "translate_y": Decimal("2"),
            "translate_z": Decimal("3"),
            "rotate_x": Decimal("4"),
            "rotate_y": Decimal("5"),
            "rotate_z": Decimal("6"),
            "scale_x": Decimal("7"),
            "scale_y": Decimal("8"),
            "scale_z": Decimal("9"),
        }

    def test_unpack_translation_rotation_scale(self):
        vector = DecimalCoord3(x=Decimal("1"), y=Decimal("2"), z=Decimal("3"))

        assert TransformMixin.unpack_translation(vector) == {
            "translate_x": Decimal("1"),
            "translate_y": Decimal("2"),
            "translate_z": Decimal("3"),
        }
        assert TransformMixin.unpack_rotation(vector) == {
            "rotate_x": Decimal("1"),
            "rotate_y": Decimal("2"),
            "rotate_z": Decimal("3"),
        }
        assert TransformMixin.unpack_scale(vector) == {
            "scale_x": Decimal("1"),
            "scale_y": Decimal("2"),
            "scale_z": Decimal("3"),
        }

    def test_update_from_translation_leaves_other_components(self):
        instance = self._seeded_instance()
        translation = DecimalCoord3(x=Decimal("10"), y=Decimal("20"), z=Decimal("30"))

        result = instance.update_from_translation(translation)

        assert result is instance
        assert instance.translation == translation
        assert instance.rotation == DecimalCoord3(
            x=Decimal("0.1"), y=Decimal("0.2"), z=Decimal("0.3")
        )
        assert instance.scale == DecimalCoord3(x=Decimal("2"), y=Decimal("2"), z=Decimal("2"))

    def test_update_from_rotation(self):
        instance = self._seeded_instance()
        rotation = DecimalCoord3(x=Decimal("0.5"), y=Decimal("0.5"), z=Decimal("0.5"))

        instance.update_from_rotation(rotation)

        assert instance.rotation == rotation
        assert instance.translation == DecimalCoord3(x=Decimal("1"), y=Decimal("2"), z=Decimal("3"))

    def test_update_from_scale(self):
        instance = self._seeded_instance()
        scale = DecimalCoord3(x=Decimal("3"), y=Decimal("3"), z=Decimal("3"))

        instance.update_from_scale(scale)

        assert instance.scale == scale
        assert instance.translation == DecimalCoord3(x=Decimal("1"), y=Decimal("2"), z=Decimal("3"))

    def test_update_from_transform_updates_all_components(self):
        instance = self._seeded_instance()
        transform = Transform(
            translation=DecimalCoord3(x=Decimal("-1"), y=Decimal("-2"), z=Decimal("-3")),
            rotation=DecimalCoord3(x=Decimal("0"), y=Decimal("0"), z=Decimal("0")),
            scale=DecimalCoord3(x=Decimal("1"), y=Decimal("1"), z=Decimal("1")),
        )

        instance.update_from_transform(transform)

        assert instance.transform == transform

    def test_get_update_cls_has_all_optional_fields(self):
        update_cls = TransformMixin.get_update_cls()

        update = update_cls()
        for field_name in (
            "translate_x",
            "translate_y",
            "translate_z",
            "rotate_x",
            "rotate_y",
            "rotate_z",
            "scale_x",
            "scale_y",
            "scale_z",
        ):
            assert getattr(update, field_name) is None

        assert update_cls(translate_x=Decimal("1"), scale_z=Decimal("2")) is not None


class TestRequiredFieldNullGuard:
    """The PATCH payload models widen every field to ``X | None``; the guard refuses the
    explicit-null reading wherever the column cannot hold it, while an omitted field keeps
    meaning "leave the stored value alone".
    """

    def test_derives_required_names_from_the_non_optional_annotations(self):
        class _Source(BaseSQLModel):
            must_carry: str
            may_be_null: str | None = None

        assert non_nullable_field_names(_Source) == frozenset({"must_carry"})

    def test_both_optional_spellings_admit_none(self):
        # ``X | None`` and ``Optional[X]`` arrive as different typing objects, and the
        # model chain uses both, so neither may read as a required column.
        assert _accepts_none(str | None)
        assert _accepts_none(Optional[str])  # noqa: UP045 -- the legacy spelling is the point
        assert not _accepts_none(str)

    def test_any_annotation_is_not_treated_as_required(self):
        class _Source(BaseSQLModel):
            loose: Any = None

        assert non_nullable_field_names(_Source) == frozenset()

    def test_rejects_an_explicit_null_for_a_not_null_column(self):
        from sta.models.project import ProjectUpdate

        with pytest.raises(ValidationError) as exc_info:
            ProjectUpdate.model_validate({"name": None})

        assert exc_info.value.errors()[0]["loc"] == ("name",)

    def test_the_message_names_the_field_itself(self):
        # The client renders a validation detail array by joining each entry's `msg` and
        # never reads `loc`, so a field named only in `loc` would reach the actor as an
        # anonymous complaint -- repeated identically once per offending field.
        from sta.models.project import ProjectUpdate

        with pytest.raises(ValidationError) as exc_info:
            ProjectUpdate.model_validate({"name": None, "config": None})

        assert [error["msg"] for error in exc_info.value.errors()] == [
            "Value error, name cannot be null; omit it to leave the stored value unchanged",
            "Value error, config cannot be null; omit it to leave the stored value unchanged",
        ]

    def test_omitting_a_field_stays_a_no_op(self):
        from sta.models.project import ProjectUpdate

        assert ProjectUpdate.model_validate({}).model_dump(exclude_unset=True) == {}

    def test_a_nullable_column_may_still_be_cleared(self):
        from sta.models.task import TaskUpdate

        update = TaskUpdate.model_validate({"deadline": None})

        assert update.model_dump(exclude_unset=True) == {"deadline": None}

    def test_a_field_that_is_not_a_column_is_left_to_its_own_layer(self):
        # member_ids addresses the link table, so the project table says nothing about its
        # nullability; domain/projects.py is what refuses a null there.
        from sta.models.project import ProjectUpdate

        assert ProjectUpdate.model_validate({"member_ids": None}) is not None

    def test_a_normalizing_payload_opts_its_field_out(self):
        # ObjectClassSelection's write path maps an explicit null to "", which is how the
        # form clears a description; the guard must not veto that documented behaviour.
        from sta.models.label.spec.objclass import ObjectClassSelectionUpdate

        assert ObjectClassSelectionUpdate.model_validate({"description": None}) is not None

        with pytest.raises(ValidationError):
            ObjectClassSelectionUpdate.model_validate({"name": None})

    def test_generated_update_classes_inherit_the_derived_requirements(self):
        from sta.models.frame import FrameUpdate

        assert "is_complete" in FrameUpdate._null_forbidden_fields

        with pytest.raises(ValidationError):
            FrameUpdate.model_validate({"is_complete": None})

    def test_plain_bounds_payloads_forbid_nothing(self):
        # Every ST-bounds component is individually nullable, so clearing one stays legal.
        update_cls = BoundsMixin.get_update_cls()

        assert update_cls._null_forbidden_fields == frozenset()
        assert update_cls.model_validate({"min_x": None}) is not None
