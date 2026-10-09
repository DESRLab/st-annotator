import time
from concurrent.futures import ThreadPoolExecutor
from enum import Enum
from random import Random

from pydantic import BaseModel
from sqlmodel import Session

from sta.common.utils.json import JSONType
from sta.services.config import AppConfig
from sta.services.domain.label.repo.graph import push_commits, read_graph
from sta.services.domain.label.repo.ops import Operation, OperationRegistry
from sta.services.models.label.repo import (
    LabelsetBranchPublic,
    LabelsetCommit,
    LabelsetCommitInstruction,
)
from sta.services.models.user import UserPublic
from sta.services.session import session_ctx


class TestOperationType(str, Enum):
    __test__ = False    # Not a test suite

    NO_OP = 'test-no-op'


class TestNoOpParams(BaseModel):
    __test__ = False    # Not a test suite


class TestNoOpOperation(Operation[TestNoOpParams]):
    __test__ = False    # Not a test suite

    def apply(
        self,
        current_user: UserPublic,
        session: Session,
        commit: LabelsetCommit,
    ) -> JSONType:
        pass


def test_multi_thread_basic_usage(
    app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
    seed: int = 0,
):
    op_registry.register(TestOperationType.NO_OP, TestNoOpOperation, TestNoOpParams)

    random = Random(seed)
    op_count = 100

    def worker(wait_secs: float):
        time.sleep(wait_secs)

        with session_ctx(app_config) as session:
            result = push_commits(
                current_user=root_user,
                session=session,
                op_registry=op_registry,
                branch_id=labelset_branch.id,
                commit_instrs=[
                    LabelsetCommitInstruction(
                        op_name=TestOperationType.NO_OP,
                        op_params=TestNoOpParams(),
                    ),
                ],
            )
            session.commit()

        return result

    with ThreadPoolExecutor() as pool:
        # Waits for all workers to finish
        for _ in pool.map(worker, [random.random() for _ in range(op_count)]):
            pass

    # Check that the graph is a path graph
    with session_ctx(app_config) as session:
        graph = read_graph(
            current_user=root_user,
            session=session,
            branch_id=labelset_branch.id,
        )

    node_hashes = {node.hash for node in graph.nodes}
    # Remember that the initial commit is also part of the graph
    assert len(node_hashes) == op_count + 1, 'Some operations were not applied'
    assert len(graph.edges) == op_count, 'A linear history must have n - 1 edges'

    in_degree = dict.fromkeys(node_hashes, 0)
    out_degree = dict.fromkeys(node_hashes, 0)
    children = {node_hash: [] for node_hash in node_hashes}

    for edge in graph.edges:
        assert edge.parent_hash in node_hashes, 'Edge parent is not in graph.nodes'
        assert edge.child_hash in node_hashes, 'Edge child is not in graph.nodes'
        assert edge.parent_hash != edge.child_hash, 'Self-loop found'

        out_degree[edge.parent_hash] += 1
        in_degree[edge.child_hash] += 1
        children[edge.parent_hash].append(edge.child_hash)

    assert sorted(in_degree.values()) == [0] + [1] * op_count, (
        'Expected exactly one root and one parent for every other commit'
    )
    assert sorted(out_degree.values()) == [0] + [1] * op_count, (
        'Expected exactly one head and one child for every other commit'
    )

    root_hash = next(node_hash for node_hash, degree in in_degree.items() if degree == 0)

    seen_hashes = set[str]()
    current_hash = root_hash
    while True:
        assert current_hash not in seen_hashes, 'Cycle found in commit graph'
        seen_hashes.add(current_hash)

        next_hashes = children[current_hash]
        assert len(next_hashes) <= 1, 'Branching found in commit graph'
        if not next_hashes:
            break

        current_hash = next_hashes[0]

    assert len(seen_hashes) == op_count + 1, 'Commit graph is disconnected'
