from __future__ import annotations

import functools
import operator
from collections.abc import Callable, Collection, Mapping
from dataclasses import dataclass
from typing import Literal, TypeAlias
from typing_extensions import assert_never

import click

import matplotlib.pyplot as plt
import numpy as np
import numpy.typing as npt
import pandas as pd
import seaborn as sns
from matplotlib.axes import Axes
from scipy.optimize import curve_fit

from .perf_label_queries import LabelType

__all__ = [
    "LabelType",
    "ParametersCombination",
    "ParametersGroupByDeleteProb",
    "ParametersGroupByNumInitLabels",
    "QueryType",
    "Residuals",
    "RunCombination",
    "apply_plot_fns",
    "plot_label_count",
    "plot_query_cost_detail",
    "plot_query_cost_detail_partial",
    "plot_query_cost_summary",
    "plot_query_cost_summary_partial",
    "plot_repo_growth",
    "plot_storage_cost",
]


QueryType: TypeAlias = Literal["select", "create", "update", "delete"]
Residuals: TypeAlias = Literal["all", "selected"]


def plot_repo_growth(df: pd.DataFrame, ax: Axes):
    ax_left = (
        df[["step", "num_branches"]]
        .rename(columns={"num_branches": "Branches"})
        .plot.line(x="step", ax=ax)
    )
    ax_left.set_xlabel("Step")
    ax_left.set_ylabel("Number of branches")
    ax_left.set_ylim(bottom=0)

    ax_right = (
        df[["step", "num_commits"]]
        .rename(columns={"num_commits": "Commits"})
        .plot.line(x="step", ax=ax, secondary_y=True, mark_right=False)
    )
    ax_right.set_xlabel("Step")
    ax_right.set_ylabel("Number of commits")
    ax_right.set_ylim(bottom=0)

    ax.set_xlabel("Step")


def plot_label_count(df: pd.DataFrame, ax: Axes):
    x_col = "step"
    x_label = "Step"
    x_bin_size = 50
    y_comp_col_labels = {"num_entities": "Entities", "num_elements": "Elements"}

    df_copy = df.copy()

    x_col_binned = x_col + "_binned"
    df_copy[x_col_binned] = ((df_copy[x_col] / x_bin_size).round() * x_bin_size).astype(int)

    ax = sns.lineplot(
        df_copy.rename(
            columns={
                x_col_binned: x_label,
                **y_comp_col_labels,
            }
        ).melt(
            id_vars=[x_label],
            value_vars=[*y_comp_col_labels.values()],
            var_name="Label type",
            value_name="Number of labels",
        ),
        x=x_label,
        y="Number of labels",
        hue="Label type",
        ax=ax,
    )
    ax.set_ylim(bottom=0)


def _get_fit_plt_fns(
    df: pd.DataFrame,
    ax: Axes,
    x_col: str,
    y_total_col: str,
    ignore_x_col_range: tuple[int, int] | None = None,
):

    def linear_f(data: npt.NDArray[np.float64], a: float, b: float):
        x = data
        return a * x + b

    def loglinear_f(data: npt.NDArray[np.float64], a: float, b: float):
        x = data
        return a * x * np.log2(x) + b

    def quadratic_f(data: npt.NDArray[np.float64], a: float, b: float):
        x = data
        return a * x**2 + b

    x_in_range = df[x_col] > 0
    if ignore_x_col_range:
        ignore_min_x, ignore_max_x = ignore_x_col_range
        x_in_range &= (df[x_col] < ignore_min_x) | (df[x_col] > ignore_max_x)

    x, y = df[x_in_range][[x_col, y_total_col]].to_numpy().T
    plot_fns: list[Callable[[], object]] = []

    for fn, eq, expr in (
        (linear_f, "{y_col} = {a:0.3e} * {x_col} + {b:0.3e}", r"O(n)"),
        (loglinear_f, "{y_col} = {a:0.3e} * {x_col} * log2({x_col}) + {b:0.3e}", r"O(n \log n)"),
        (quadratic_f, "{y_col} = {a:0.3e} * {x_col} ^ 2 + {b:0.3e}", r"O(n^2)"),
    ):
        (a, b), pcov = curve_fit(fn, x, y, bounds=(0, np.inf))

        ss_res = ((y - fn(x, a, b)) ** 2).sum()
        ss_tot = ((y - y.mean()) ** 2).sum()
        r_sq = 1 - ss_res / ss_tot

        std_errs = np.sqrt(np.diag(pcov))

        eq_str = eq.format(a=a, b=b, x_col=x_col, y_col=y_total_col)
        label = f"${expr}$ best-fit curve ($R^2 = {r_sq:.3f}$)"

        std_errs_str = [float(f"{err:.3e}") for err in std_errs]
        click.echo(f"Fitted: {eq_str} | r_sq: {r_sq:.3f} | std_err: {std_errs_str}")

        x_ = np.unique(x)
        plot_fns.append(functools.partial(ax.plot, x_, fn(x_, a, b), "--", label=label))

    return plot_fns


def plot_query_cost_summary(
    df: pd.DataFrame,
    ax: Axes,
    *,
    x_col: str,
    x_label: str,
    x_bin_size: float,
    y_total_col: str,
    y_total_label: str,
    z_legend_col: str,
    fit: bool = False,
    fit_ignore_x_col_range: tuple[int, int] | None = None,
):
    df_copy = df.copy()

    x_col_binned = x_col + "_binned"
    df_copy[x_col_binned] = ((df_copy[x_col] / x_bin_size).round() * x_bin_size).astype(int)

    ax = sns.lineplot(
        df_copy.rename(
            columns={
                x_col_binned: x_label,
                y_total_col: y_total_label,
            }
        ),
        x=x_label,
        y=y_total_label,
        hue=z_legend_col,
        ax=ax,
    )
    ax.set_ylim(bottom=0)

    if fit:
        for fn in _get_fit_plt_fns(df_copy, ax, x_col, y_total_col, fit_ignore_x_col_range):
            fn()


def plot_query_cost_detail(
    df: pd.DataFrame,
    ax: Axes,
    *,
    x_col: str,
    x_label: str,
    x_bin_size: float,
    y_comp_col_labels: Mapping[str, str],
    y_total_col: str,
    y_total_label: str,
    fit: bool = False,
    fit_ignore_x_col_range: tuple[int, int] | None = None,
):
    df_copy = df.copy()

    x_col_binned = x_col + "_binned"
    df_copy[x_col_binned] = ((df_copy[x_col] / x_bin_size).round() * x_bin_size).astype(int)

    ax = sns.lineplot(
        df_copy.rename(
            columns={
                x_col_binned: x_label,
                **y_comp_col_labels,
                y_total_col: y_total_label,
            }
        ).melt(
            id_vars=[x_label],
            value_vars=[*y_comp_col_labels.values(), y_total_label],
            var_name="Component",
            value_name="Execution time (secs)",
        ),
        x=x_label,
        y="Execution time (secs)",
        hue="Component",
        ax=ax,
    )
    ax.set_ylim(bottom=0)

    if fit:
        for fn in _get_fit_plt_fns(df_copy, ax, x_col, y_total_col, fit_ignore_x_col_range):
            fn()


@dataclass(frozen=True)
class ParametersCombination:
    num_commits: int
    num_init_labels: int
    num_points: int
    branch_prob: float
    create_prob: float
    delete_prob: float
    entity_prob: float


@dataclass(frozen=True)
class ParametersGroupByDeleteProb:
    num_commits: int
    num_points: int
    num_init_labels: int
    branch_prob: float
    create_prob: float
    entity_prob: float


@dataclass(frozen=True)
class ParametersGroupByNumInitLabels:
    num_commits: int
    num_points: int
    branch_prob: float
    create_prob: float
    delete_prob: float
    entity_prob: float


@dataclass(frozen=True)
class RunCombination:
    num_commits: int
    num_init_labels: int
    num_points: int
    branch_prob: float
    create_prob: float
    delete_prob: float
    entity_prob: float

    seed: int
    iteration: int = 1
    num_users: int = 1
    use_delta: bool = True

    def get_params(self):
        return ParametersCombination(
            num_commits=self.num_commits,
            num_init_labels=self.num_init_labels,
            num_points=self.num_points,
            branch_prob=self.branch_prob,
            create_prob=self.create_prob,
            delete_prob=self.delete_prob,
            entity_prob=self.entity_prob,
        )

    def get_params_group_by_delete_prob(self):
        return ParametersGroupByDeleteProb(
            num_commits=self.num_commits,
            num_init_labels=self.num_init_labels,
            num_points=self.num_points,
            branch_prob=self.branch_prob,
            create_prob=self.create_prob,
            entity_prob=self.entity_prob,
        )

    def get_params_group_by_num_init_labels(self):
        return ParametersGroupByNumInitLabels(
            num_commits=self.num_commits,
            num_points=self.num_points,
            branch_prob=self.branch_prob,
            create_prob=self.create_prob,
            delete_prob=self.delete_prob,
            entity_prob=self.entity_prob,
        )


def _get_data_col_info(label_type: LabelType, bin_params: ParametersCombination):
    num_commits = bin_params.num_commits
    create_prob = bin_params.create_prob
    delete_prob = bin_params.delete_prob
    entity_prob = bin_params.entity_prob

    if label_type == "entity":
        key = "num_entities"
        label = "Number of entities"
        bin_size = max(num_commits / 100 * (create_prob - delete_prob) * entity_prob, 5)
    elif label_type == "element":
        key = "num_elements"
        label = "Number of elements"
        bin_size = max(num_commits / 100 * (create_prob - delete_prob) * (1 - entity_prob), 5)
    else:
        assert_never(label_type)

    return key, label, bin_size


def _get_commit_col_info(bin_params: ParametersCombination):
    num_commits = bin_params.num_commits

    key = "num_commits"
    label = "Number of commits"
    bin_size = max(num_commits / 100, 5)

    return key, label, bin_size


def plot_query_cost_summary_partial(
    df: pd.DataFrame,
    ax: Axes,
    *,
    query_type: QueryType,
    label_type: LabelType,
    by: str,
    vary: str,
    bin_params: ParametersCombination,
    fit: bool = False,
    fit_ignore_x_col_range: tuple[int, int] | None = None,
):
    if by == "num_labels":
        x_col, x_label, x_bin_size = _get_data_col_info(label_type, bin_params)
    elif by == "num_commits":
        x_col, x_label, x_bin_size = _get_commit_col_info(bin_params)
    else:
        raise NotImplementedError(by)

    if vary == "num_init_labels":
        df = df.copy()
        df["num_init_labels_str"] = "N_i = " + df["num_init_labels"].astype(str)
        z_legend_col = "num_init_labels_str"
    elif vary == "delete_prob":
        df = df.copy()
        df["delete_prob_str"] = "P_d = " + df["delete_prob"].astype(str)
        z_legend_col = "delete_prob_str"
    elif vary == "num_users":
        df = df.copy()
        df["num_users_str"] = "N_u = " + df["num_users"].astype(str)
        z_legend_col = "num_users_str"
    else:
        raise NotImplementedError(vary)

    return plot_query_cost_summary(
        df=df[df[f"{query_type}_target"] == label_type],
        ax=ax,
        x_col=x_col,
        x_label=x_label,
        x_bin_size=x_bin_size,
        y_total_col="total_seconds",
        y_total_label="Execution time (secs)",
        z_legend_col=z_legend_col,
        fit=fit,
        fit_ignore_x_col_range=fit_ignore_x_col_range,
    )


def plot_query_cost_detail_partial(
    df: pd.DataFrame,
    ax: Axes,
    *,
    query_type: QueryType,
    label_type: LabelType,
    by: str,
    bin_params: ParametersCombination,
    fit: bool = False,
    fit_ignore_x_col_range: tuple[int, int] | None = None,
):
    if query_type == "select":
        y_comp_col_labels = {
            "query_closest_states_seconds": "Querying closest states",
        }
    elif query_type == "create":
        y_comp_col_labels = {
            "insert_hash_to_distance_seconds": "Updating distance matrix",
            "add_seconds": "Inserting new label state",
            # 'val_seconds': 'Validating new label state',
        }
    elif query_type == "update":
        y_comp_col_labels = {
            "insert_hash_to_distance_seconds": "Updating distance matrix",
            "query_closest_states_seconds": "Reading current label state",
            "add_seconds": "Inserting new label state",
            # 'val_seconds': 'Validating new label state',
        }
    elif query_type == "delete":
        y_comp_col_labels = {
            "insert_hash_to_distance_seconds": "Updating distance matrix",
            "query_closest_states_seconds": "Reading current label state",
            "add_seconds": "Inserting new label state",
        }
    else:
        assert_never(query_type)

    if by == "num_labels":
        x_col, x_label, x_bin_size = _get_data_col_info(label_type, bin_params)
    elif by == "num_commits":
        x_col, x_label, x_bin_size = _get_commit_col_info(bin_params)
    else:
        raise NotImplementedError(by)

    return plot_query_cost_detail(
        df=df[df[f"{query_type}_target"] == label_type],
        ax=ax,
        x_col=x_col,
        x_label=x_label,
        x_bin_size=x_bin_size,
        y_comp_col_labels=y_comp_col_labels,
        y_total_col="total_seconds",
        y_total_label="Total",
        fit=fit,
        fit_ignore_x_col_range=fit_ignore_x_col_range,
    )


def plot_storage_cost(df: pd.DataFrame, ax: Axes, *, label_type: LabelType, vary: str):
    x_col = "step"
    x_label = "Step"
    x_bin_size = 50

    if label_type == "element":
        y_col = "label_element_records_size_bytes"
    elif label_type == "entity":
        y_col = "label_entity_records_size_bytes"
    else:
        raise NotImplementedError(y_col)

    y_label = "Storage used (bytes)"

    if vary == "num_init_labels":
        df = df.copy()
        df["num_init_labels_str"] = "N_i = " + df["num_init_labels"].astype(str)
        z_legend_col = "num_init_labels_str"
    elif vary == "delete_prob":
        df = df.copy()
        df["delete_prob_str"] = "P_d = " + df["delete_prob"].astype(str)
        z_legend_col = "delete_prob_str"
    elif vary == "num_users":
        df = df.copy()
        df["num_users_str"] = "N_u = " + df["num_users"].astype(str)
        z_legend_col = "num_users_str"
    else:
        raise NotImplementedError(vary)

    df_copy = df.copy()

    x_col_binned = x_col + "_binned"
    df_copy[x_col_binned] = ((df_copy[x_col] / x_bin_size).round() * x_bin_size).astype(int)

    ax = sns.lineplot(
        df_copy.rename(
            columns={
                x_col_binned: x_label,
                y_col: y_label,
            }
        ),
        x=x_label,
        y=y_label,
        hue=z_legend_col,
        ax=ax,
    )
    ax.set_ylim(bottom=0)

    legend = ax.get_legend()
    if legend:
        legend.set_title("")


def apply_plot_fns(
    plot_fns: Collection[tuple[str, Mapping[str, Callable[[Axes], None]]]],
    *,
    colwidth: float = 3.0,
    rowheight: float = 2.0,
    extra_w: float = 1.0,
    extra_h: float = 1.0,
    share_legend: bool,
):
    (_, first_row), *_ = plot_fns

    figwidth = colwidth * len(first_row) + extra_w
    figheight = rowheight * len(plot_fns) + extra_h

    fig = plt.figure(constrained_layout=True, figsize=(figwidth, figheight))
    subfigs = fig.subfigures(nrows=len(plot_fns), ncols=1, squeeze=False)[:, 0]

    for subfig, (row_title, row) in zip(subfigs, plot_fns, strict=True):
        subfig.suptitle(row_title, fontweight="bold")

        axes = subfig.subplots(nrows=1, ncols=len(row), squeeze=False)[0, :]
        for ax, (col_title, plot_fn) in zip(axes, row.items(), strict=True):
            plot_fn(ax)

            ax.set_title(col_title)

            if share_legend and (legend := ax.get_legend()):
                legend.remove()

        if share_legend:
            unique_axes = {ax.get_ylabel(): ax for ax in subfig.axes}.values()
            unique_legend_handles_labels = [ax.get_legend_handles_labels() for ax in unique_axes]
            unique_handles = functools.reduce(
                operator.iadd, (hl[0] for hl in unique_legend_handles_labels), []
            )
            unique_labels = functools.reduce(
                operator.iadd, (hl[1] for hl in unique_legend_handles_labels), []
            )
            subfig.legend(
                unique_handles,
                unique_labels,
                loc="right",
                bbox_to_anchor=(1 + extra_w * 2 / figwidth, 0.5),
            )

    return fig
