"""Object-class color assignment shared by the dataset importers."""

from unittest.mock import Mock

from sqlmodel import Session

import pytest

from sta.models.label.spec.objclass import ObjectClass, ObjectClassCreate
from sta.models.user import UserPublic

from sta_datasets import common


def test_new_object_class_colors_are_stable_across_import_orders(monkeypatch: pytest.MonkeyPatch):
    session = Mock(spec=Session)
    session.exec.return_value.one_or_none.return_value = None
    user = UserPublic.model_construct(id=1)
    monkeypatch.setattr(common.objclass_definitions, "list_objclasses", lambda **_: [])
    created = []

    def create_class(*, current_user: UserPublic, session: Session, data: ObjectClassCreate):
        record = ObjectClass(id=len(created) + 1, **data.model_dump())
        created.append(record)
        return record

    monkeypatch.setattr(common.objclass_definitions, "create_objclass", create_class)
    names = ["car", "person", "chair", "table", "vegetation", "moving-car"]

    def import_colors(order: list[str]) -> dict[str, int]:
        return {
            name: common.get_or_create_object_class(
                current_user=user, session=session, name=name
            ).color_rgb
            for name in order
        }

    colors = import_colors(names)
    assert colors == import_colors(list(reversed(names)))
    assert len(set(colors.values())) == len(names)
    for color in colors.values():
        assert 0 <= color <= 0xFFFFFF
        channels = [(color >> shift) & 0xFF for shift in (16, 8, 0)]
        assert max(channels) - min(channels) > 100
        assert min(channels) >= 90


@pytest.mark.parametrize("color", [0xFFFFFF, 0x123456])
def test_existing_object_class_retains_its_color(monkeypatch: pytest.MonkeyPatch, color: int):
    session = Mock(spec=Session)
    record = ObjectClass(id=1, name="car", color_rgb=color)
    monkeypatch.setattr(common.objclass_definitions, "list_objclasses", lambda **_: [record])
    create_class = Mock()
    monkeypatch.setattr(common.objclass_definitions, "create_objclass", create_class)
    imported = common.get_or_create_object_class(
        current_user=UserPublic.model_construct(id=1), session=session, name="car"
    )
    assert imported is record
    assert imported.color_rgb == color
    create_class.assert_not_called()
    session.exec.assert_not_called()


def test_reactivated_object_class_retains_its_color(monkeypatch: pytest.MonkeyPatch):
    session = Mock(spec=Session)
    record = ObjectClass(id=1, name="chair", color_rgb=0x654321, is_deleted=True)
    session.exec.return_value.one_or_none.return_value = record
    monkeypatch.setattr(common.objclass_definitions, "list_objclasses", lambda **_: [])
    monkeypatch.setattr(common, "object_class_has_external_references", lambda *_: False)
    update_classes = Mock()
    monkeypatch.setattr(common.objclass_definitions, "bulk_update_objclasses", update_classes)
    imported = common.get_or_create_object_class(
        current_user=UserPublic.model_construct(id=1), session=session, name="chair"
    )
    assert imported is record
    assert imported.color_rgb == 0x654321
    assert update_classes.call_args.kwargs["data"].model_fields_set == {"is_deleted"}
