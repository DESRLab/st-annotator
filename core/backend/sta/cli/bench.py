from __future__ import annotations

from pathlib import Path

import click

from ..benchmarks.perf_ancestor_candidates import perf_ancestor_candidates
from ..benchmarks.perf_label_queries import VALID_PLUGINS, PluginName, perf_label_queries
from .base import get_config_path_option

__all__ = ["attach_bench_cli"]


def bench_command() -> None:
    """Run benchmarks on the ST Annotator platform."""


@get_config_path_option()
@click.option(
    "-p",
    "--plugin",
    type=click.Choice(VALID_PLUGINS),
    default=VALID_PLUGINS[0],
    help="The plugin which the labels belong to.",
)
@click.option(
    "--user-count", type=int, default=1, help="The number of concurrent users to benchmark."
)
@click.option(
    "--commit-count",
    type=int,
    default=2500,
    help="The number of commits to generate for each user.",
)
@click.option(
    "--branching-prob",
    type=float,
    default=0.00,
    help="In each step, the probability of creating a new branch off an existing commit instead of creating a new commit off an existing branch",
)
@click.option(
    "--label-entity-prob",
    type=float,
    default=0.20,
    help="For each new commit, the probability of operating on a label entity instead of a label element",
)
@click.option(
    "--label-create-prob",
    type=float,
    default=0.20,
    help="For each new commit, the probability of creating a new label",
)
@click.option(
    "--label-delete-prob",
    type=float,
    default=0.01,
    help="For each new commit, the probability of deleting an existing label",
)
@click.option(
    "--init-label-count",
    type=int,
    default=0,
    help="Create this number of labels (split between entity and element) in the initial commit",
)
@click.option(
    "-o",
    "--output",
    "output_dir",
    type=click.Path(file_okay=False, dir_okay=True, path_type=Path),
    required=True,
    help="Specifies the CSV file to output.",
)
@click.option(
    "--overwrite/--no-overwrite",
    default=None,
    help="Whether to overwrite the output file, if it already exists.",
)
@click.option(
    "--seed",
    type=int,
    default=None,
    help="Seed the workload's random streams: one for the setup phase, plus one per user.",
)
@click.option(
    "--query-plan/--no-query-plan", default=False, help="Additionally output the query plan."
)
@click.option(
    "--log-storage/--no-log-storage", default=False, help="Additionally output the storage used."
)
def label_queries_command(
    *,
    config_path: str,
    plugin: PluginName,
    user_count: int,
    commit_count: int,
    branching_prob: float,
    label_entity_prob: float,
    label_create_prob: float,
    label_delete_prob: float,
    init_label_count: int,
    output_dir: Path,
    overwrite: bool | None = None,
    seed: int | None = None,
    query_plan: bool = False,
    log_storage: bool = False,
) -> None:
    """
    Tests the performance of database queries on labels.

    In particular, the duration of the following operations are tracked:

    - For the commit graph:

        - Inserting a commit
        - Inserting a branch

    - For the label instances:

        - Selecting labels in a labelset at a commit
        - Inserting a label
        - Updating a label
        - Deleting a label
    """
    perf_label_queries(
        config_path=config_path,
        plugin=plugin,
        user_count=user_count,
        commit_count=commit_count,
        branching_prob=branching_prob,
        label_entity_prob=label_entity_prob,
        label_create_prob=label_create_prob,
        label_delete_prob=label_delete_prob,
        init_label_count=init_label_count,
        output_dir=output_dir,
        overwrite=overwrite,
        seed=seed,
        query_plan=query_plan,
        log_storage=log_storage,
    )


@get_config_path_option()
@click.option(
    "--depth",
    type=int,
    default=800,
    help="The number of commits to generate on the seeded branch.",
)
@click.option(
    "--width",
    type=int,
    default=400,
    help="The number of label elements to create across the seeded history.",
)
@click.option(
    "--entity-count",
    type=int,
    default=1,
    help="The number of label entities to create. With one entity, every element attaches "
    "to that same parent, which is what the label-queries benchmark produces when its "
    "label-entity probability is zero.",
)
@click.option(
    "--work-mem",
    "tight_work_mem",
    default="512kB",
    help="work_mem to re-measure against, exposing spill that the configured value hides.",
)
def ancestor_candidates_command(
    *,
    config_path: str,
    depth: int,
    width: int,
    entity_count: int,
    tight_work_mem: str,
) -> None:
    """
    Compares the filtered closest-state reads with and without candidate narrowing.

    Each affected read runs with `STA_USE_ANCESTOR_CANDIDATES` on and off against a
    seeded deep graph, reporting the statement the driver receives, Postgres' block
    and spill counters at both work_mem settings, and the client-side allocation.
    """
    perf_ancestor_candidates(
        config_path=config_path,
        depth=depth,
        width=width,
        entity_count=entity_count,
        tight_work_mem=tight_work_mem,
    )


def attach_bench_cli(cli: click.Group):
    # Named explicitly, following the `<name>_command` convention; see `sta/cli/__init__.py`.
    bench_cli = cli.group("bench")(bench_command)
    bench_cli.command("label-queries")(label_queries_command)
    bench_cli.command("ancestor-candidates")(ancestor_candidates_command)
