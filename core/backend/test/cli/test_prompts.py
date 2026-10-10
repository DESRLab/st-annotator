from __future__ import annotations

from collections.abc import Callable
from typing import Any

from click.testing import CliRunner

import pytest

from sta.cli import prompts
from sta.domain.auth import INVALID_LOGIN
from sta.models.label.group import LabelGroupPublic
from sta.models.label.repo import LabelsetBranchPublic
from sta.models.source.group import SourceGroupPublic
from sta.models.user import UserPublic


def run_prompt(run: Callable[[], Any], *, input_text: str) -> tuple[Any, bytes]:
    """Runs a prompt function inside a CliRunner isolation with the given stdin."""
    with CliRunner().isolation(input=input_text) as (stdout, _stderr, _mixed):
        value = run()

    return value, stdout.getvalue()


def test_prompt_login_success(monkeypatch: pytest.MonkeyPatch, stub_user: UserPublic):
    auth_calls: list[tuple[str, str]] = []

    def fake_auth_user(session, *, username, password):
        auth_calls.append((username, password))
        return stub_user

    login_calls: list[tuple[UserPublic, int]] = []

    def fake_login_user(*, current_user, session, id):
        login_calls.append((current_user, id))
        return stub_user

    monkeypatch.setattr(prompts, "auth_user", fake_auth_user)
    monkeypatch.setattr(prompts, "login_user", fake_login_user)

    session = object()
    user, output = run_prompt(lambda: prompts.prompt_login(session), input_text="admin\nsecret\n")

    assert isinstance(user, UserPublic)
    assert user.id == stub_user.id
    assert auth_calls == [("admin", "secret")]
    assert login_calls == [(stub_user, stub_user.id)]
    assert b"Please log in to your account..." in output
    assert b"Login successful." in output


def test_prompt_login_retries_on_auth_failure(
    monkeypatch: pytest.MonkeyPatch, stub_user: UserPublic
):
    attempts: list[tuple[str, str]] = []

    def fake_auth_user(session, *, username, password):
        attempts.append((username, password))
        if len(attempts) == 1:
            raise INVALID_LOGIN
        return stub_user

    monkeypatch.setattr(prompts, "auth_user", fake_auth_user)
    monkeypatch.setattr(prompts, "login_user", lambda **kwargs: stub_user)

    user, output = run_prompt(
        lambda: prompts.prompt_login(object()),
        input_text="admin\nwrong-password\nadmin\nsecret\n",
    )

    assert user.id == stub_user.id
    assert attempts == [("admin", "wrong-password"), ("admin", "secret")]
    assert b"Incorrect username or password, please try again." in output
    assert b"Login successful." in output


def test_prompt_source_group_raises_when_no_groups_available(
    monkeypatch: pytest.MonkeyPatch,
    stub_user: UserPublic,
):
    monkeypatch.setattr(prompts, "list_source_groups", lambda *, current_user, session: [])

    with pytest.raises(RuntimeError, match="No source groups available to this account"):
        run_prompt(lambda: prompts.prompt_source_group(stub_user, object()), input_text="")


def test_prompt_source_group_selects_group_by_id(
    monkeypatch: pytest.MonkeyPatch,
    stub_user: UserPublic,
):
    groups = [
        SourceGroupPublic(id=1, name="group-a"),
        SourceGroupPublic(id=2, name="group-b"),
    ]
    monkeypatch.setattr(prompts, "list_source_groups", lambda *, current_user, session: groups)

    group, output = run_prompt(
        lambda: prompts.prompt_source_group(stub_user, object()),
        input_text="2\n",
    )

    assert isinstance(group, SourceGroupPublic)
    assert group.id == 2
    assert group.name == "group-b"
    assert b"[Available source groups]" in output
    assert b"group-a" in output
    assert b"group-b" in output


def test_prompt_source_group_retries_invalid_group_id(
    monkeypatch: pytest.MonkeyPatch,
    stub_user: UserPublic,
):
    groups = [SourceGroupPublic(id=1, name="group-a")]
    monkeypatch.setattr(prompts, "list_source_groups", lambda *, current_user, session: groups)

    group, output = run_prompt(
        lambda: prompts.prompt_source_group(stub_user, object()),
        input_text="nope\n999\n1\n",
    )

    assert group.id == 1
    assert b"not a valid integer" in output
    assert b"Invalid source group, please try again." in output


def test_prompt_label_group_raises_when_no_groups_available(
    monkeypatch: pytest.MonkeyPatch,
    stub_user: UserPublic,
):
    monkeypatch.setattr(prompts, "list_label_groups", lambda *, current_user, session: [])

    with pytest.raises(RuntimeError, match="No label groups available to this account"):
        run_prompt(lambda: prompts.prompt_label_group(stub_user, object()), input_text="")


def test_prompt_label_group_retries_invalid_group_id_then_selects(
    monkeypatch: pytest.MonkeyPatch,
    stub_user: UserPublic,
):
    groups = [
        LabelGroupPublic(id=1, name="group-a"),
        LabelGroupPublic(id=2, name="group-b"),
    ]
    monkeypatch.setattr(prompts, "list_label_groups", lambda *, current_user, session: groups)

    group, output = run_prompt(
        lambda: prompts.prompt_label_group(stub_user, object()),
        input_text="nope\n999\n2\n",
    )

    assert isinstance(group, LabelGroupPublic)
    assert group.id == 2
    assert b"[Available label groups]" in output
    assert b"not a valid integer" in output
    assert b"Invalid label group, please try again." in output


def test_prompt_label_branch_from_group_raises_when_no_branches_available(
    monkeypatch: pytest.MonkeyPatch,
    stub_user: UserPublic,
):
    monkeypatch.setattr(
        prompts,
        "list_label_branches",
        lambda *, current_user, session, group_id: [],
    )

    with pytest.raises(RuntimeError, match=r"No label branches available in label group #7\."):
        run_prompt(
            lambda: prompts.prompt_label_branch_from_group(stub_user, object(), label_branch_id=7),
            input_text="",
        )


def test_prompt_label_branch_from_group_selects_branch_by_id(
    monkeypatch: pytest.MonkeyPatch,
    stub_user: UserPublic,
    stub_label_branch: LabelsetBranchPublic,
):
    seen_group_ids: list[int] = []

    def fake_list_branches(*, current_user, session, group_id):
        seen_group_ids.append(group_id)
        return [stub_label_branch]

    monkeypatch.setattr(prompts, "list_label_branches", fake_list_branches)

    branch, output = run_prompt(
        lambda: prompts.prompt_label_branch_from_group(stub_user, object(), label_branch_id=7),
        input_text=f"{stub_label_branch.id}\n",
    )

    assert isinstance(branch, LabelsetBranchPublic)
    assert branch.id == stub_label_branch.id
    assert seen_group_ids == [7]
    assert b"[Available label branches]" in output
    assert stub_label_branch.name.encode() in output


def test_prompt_label_branch_from_group_retries_invalid_branch_id(
    monkeypatch: pytest.MonkeyPatch,
    stub_user: UserPublic,
    stub_label_branch: LabelsetBranchPublic,
):
    monkeypatch.setattr(prompts, "list_label_branches", lambda **kwargs: [stub_label_branch])

    branch, output = run_prompt(
        lambda: prompts.prompt_label_branch_from_group(stub_user, object(), label_branch_id=7),
        input_text=f"nope\n999\n{stub_label_branch.id}\n",
    )

    assert branch.id == stub_label_branch.id
    assert b"not a valid integer" in output
    assert b"Invalid label branch, please try again." in output


def test_prompt_label_branch_prompts_for_group_then_branch(
    monkeypatch: pytest.MonkeyPatch,
    stub_user: UserPublic,
    stub_label_group: LabelGroupPublic,
    stub_label_branch: LabelsetBranchPublic,
):
    monkeypatch.setattr(
        prompts,
        "list_label_groups",
        lambda *, current_user, session: [stub_label_group],
    )

    seen_group_ids: list[int] = []

    def fake_list_branches(*, current_user, session, group_id):
        seen_group_ids.append(group_id)
        return [stub_label_branch]

    monkeypatch.setattr(prompts, "list_label_branches", fake_list_branches)

    branch, _ = run_prompt(
        lambda: prompts.prompt_label_branch(stub_user, object()),
        input_text=f"{stub_label_group.id}\n{stub_label_branch.id}\n",
    )

    assert branch.id == stub_label_branch.id
    assert seen_group_ids == [stub_label_group.id]
