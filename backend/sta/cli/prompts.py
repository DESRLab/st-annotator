import click

import pandas as pd

from fastapi import HTTPException
from sqlmodel import Session

from ..services.domain.auth import auth_user
from ..services.domain.label.groups import list_groups as list_label_groups
from ..services.domain.label.repo.branches import list_branches as list_label_branches
from ..services.domain.source.groups import list_groups as list_source_groups
from ..services.domain.users import login_user
from ..services.models.label.group import LabelGroupPublic
from ..services.models.label.repo import LabelsetBranchPublic
from ..services.models.source.group import SourceGroupPublic
from ..services.models.user import UserPublic


def prompt_login(session: Session) -> UserPublic:
    while True:
        click.echo('Please log in to your account...')
        username = click.prompt('Username')
        password = click.prompt('Password', hide_input=True)
        click.echo()

        try:
            record = auth_user(session, username=username, password=password)
            break
        except HTTPException as e:
            click.echo(f"{e.detail}, please try again.")

    user = login_user(current_user=record, session=session, id=record.id)
    click.echo("Login successful.")
    return UserPublic.model_validate(user)


def prompt_source_group(
    current_user: UserPublic,
    session: Session,
) -> SourceGroupPublic:
    source_groups = list_source_groups(
        current_user=current_user,
        session=session,
    )
    if len(source_groups) == 0:
        msg = 'No source groups available to this account'
        raise RuntimeError(msg)

    click.echo('[Available source groups]')
    click.echo(
        pd.DataFrame([dict(id=group.id, name=group.name) for group in source_groups])
        .to_string(index=False),
    )
    click.echo()

    source_groups_by_id = {group.id: group for group in source_groups}

    while True:
        click.echo('Please select the source group:')
        source_group_id = click.prompt('Source Group ID', value_proc=int)
        click.echo()

        try:
            source_group = source_groups_by_id[source_group_id]
            break
        except KeyError:
            click.echo("Invalid source group, please try again.")

    return SourceGroupPublic.model_validate(source_group)


def prompt_label_group(
    current_user: UserPublic,
    session: Session,
) -> LabelGroupPublic:
    label_groups = list_label_groups(
        current_user=current_user,
        session=session,
    )
    if len(label_groups) == 0:
        msg = 'No label groups available to this account'
        raise RuntimeError(msg)

    click.echo('[Available label groups]')
    click.echo(
        pd.DataFrame([dict(id=group.id, name=group.name) for group in label_groups])
        .to_string(index=False),
    )
    click.echo()

    label_groups_by_id = {group.id: group for group in label_groups}

    while True:
        click.echo('Please select the label group:')
        label_group_id = click.prompt('Label Group ID', value_proc=int)
        click.echo()

        try:
            label_group = label_groups_by_id[label_group_id]
            break
        except KeyError:
            click.echo("Invalid label group, please try again.")

    return LabelGroupPublic.model_validate(label_group)


def prompt_label_branch_from_group(
    current_user: UserPublic,
    session: Session,
    label_branch_id: int,
) -> LabelsetBranchPublic:
    label_branches = list_label_branches(
        current_user=current_user,
        session=session,
        group_id=label_branch_id,
    )
    if len(label_branches) == 0:
        msg = f'No label branches available in label group #{label_branch_id}.'
        raise RuntimeError(msg)

    click.echo('[Available label branches]')
    click.echo(
        pd.DataFrame([dict(id=group.id, name=group.name) for group in label_branches])
        .to_string(index=False),
    )
    click.echo()

    label_branches_by_id = {group.id: group for group in label_branches}

    while True:
        click.echo('Please select the label branch:')
        label_branch_id = click.prompt('Label Branch ID', value_proc=int)
        click.echo()

        try:
            label_branch = label_branches_by_id[label_branch_id]
            break
        except KeyError:
            click.echo("Invalid label branch, please try again.")

    return LabelsetBranchPublic.model_validate(label_branch)


def prompt_label_branch(
    current_user: UserPublic,
    session: Session,
) -> LabelsetBranchPublic:
    label_group = prompt_label_group(current_user, session)
    return prompt_label_branch_from_group(current_user, session, label_group.id)
