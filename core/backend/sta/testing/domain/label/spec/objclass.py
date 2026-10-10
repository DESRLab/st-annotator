import pytest

from sta.config import AppConfig
from sta.domain.label.spec.objclass import (
    definitions as objclass_definitions,
    selections as objclass_selections,
)
from sta.models.label.group import LabelGroupPublic
from sta.models.label.spec.objclass import (
    ObjectClassCreate,
    ObjectClassPublic,
    ObjectClassSelectionCreate,
    ObjectClassSelectionPublic,
)
from sta.models.user import UserPublic
from sta.session import session_ctx


@pytest.fixture
def object_class_selection(
    test_app_config: AppConfig,
    root_user: UserPublic,
    label_group: LabelGroupPublic,
):
    with session_ctx(test_app_config) as session:
        definition_record = objclass_definitions.create_objclass(
            current_user=root_user,
            session=session,
            data=ObjectClassCreate(name="test"),
        )
        definition = ObjectClassPublic.model_validate(definition_record)

        selection_record = objclass_selections.create_spec(
            current_user=root_user,
            session=session,
            data=ObjectClassSelectionCreate(
                name="test",
                group_ids=[label_group.id],
                objclass_ids=[definition.id],
            ),
        )
        selection = ObjectClassSelectionPublic.model_validate(selection_record)

        session.commit()

    yield selection
