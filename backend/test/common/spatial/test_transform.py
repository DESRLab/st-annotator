from __future__ import annotations

import pytest
from hypothesis import given, note, strategies as st

from sta.common.spatial import DecimalCoord3, OptionalDecimalCoord3, Vector3
from sta.common.spatial.transform import Transform
from sta.common.testing import build_equal_hash_tests, build_equivalence_relation_tests


def st_transform_orig_vector():
    return st.from_type(Vector3).filter(lambda v: all(0 <= a <= 1 for a in v.to_tuple()))

def st_transform_component():
    comp = st.from_type(DecimalCoord3) | st.from_type(OptionalDecimalCoord3)
    return comp.filter(lambda v: all(a is None or 0 <= a <= 1 for a in v.to_tuple()))


TestTransform_EquivalenceRelation = build_equivalence_relation_tests(
    lambda a, b: a == b,
    st_value=st.from_type(Transform),
)

TestTrasform_EqualHash = build_equal_hash_tests(st.from_type(Transform))


@given(st_transform_orig_vector())
def test_identity(vector: Vector3):
    assert Transform.from_optional().apply_to_vector(vector).equals(vector, nan_ok=True)

    assert Transform.from_optional(
        translation=OptionalDecimalCoord3.empty(),
        rotation=OptionalDecimalCoord3.empty(),
        scale=OptionalDecimalCoord3.empty(),
    ).apply_to_vector(vector).equals(vector, nan_ok=True)

@given(
    st_transform_orig_vector(),
    st_transform_component(),
)
def test_translation_axis_compose(vector: Vector3, translation: DecimalCoord3 | OptionalDecimalCoord3):
    transform = Transform.from_optional(translation=translation)
    transform_matrix = transform.matrix

    note(f'transform_matrix={transform_matrix}')

    transform_x = Transform.from_optional(translation=OptionalDecimalCoord3.empty().copy_with(x=translation.x))
    transform_y = Transform.from_optional(translation=OptionalDecimalCoord3.empty().copy_with(y=translation.y))
    transform_z = Transform.from_optional(translation=OptionalDecimalCoord3.empty().copy_with(z=translation.z))

    note(f'transform={transform}')
    note(f'transform_x={transform_x}')
    note(f'transform_y={transform_y}')
    note(f'transform_z={transform_z}')

    result = transform.apply_to_vector(vector)

    note(f'result={result}')

    result_x = transform_x.apply_to_vector(vector)
    result_xy = transform_y.apply_to_vector(result_x)
    result_xyz = transform_z.apply_to_vector(result_xy)

    note(f'result_x={result_x}')
    note(f'result_xy={result_xy}')
    note(f'result_xyz={result_xyz}')

    assert result.to_dict() == pytest.approx(result_xyz.to_dict())

@given(
    st_transform_orig_vector(),
    st_transform_component(),
)
def test_rotation_axis_compose(vector: Vector3, rotate: DecimalCoord3 | OptionalDecimalCoord3):
    transform = Transform.from_optional(rotation=rotate)
    transform_matrix = transform.matrix

    note(f'transform_matrix={transform_matrix}')

    transform_x = Transform.from_optional(rotation=OptionalDecimalCoord3.empty().copy_with(x=rotate.x))
    transform_y = Transform.from_optional(rotation=OptionalDecimalCoord3.empty().copy_with(y=rotate.y))
    transform_z = Transform.from_optional(rotation=OptionalDecimalCoord3.empty().copy_with(z=rotate.z))

    note(f'transform={transform}')
    note(f'transform_x={transform_x}')
    note(f'transform_y={transform_y}')
    note(f'transform_z={transform_z}')

    result = transform.apply_to_vector(vector)

    note(f'result={result}')

    result_x = transform_x.apply_to_vector(vector)
    result_xy = transform_y.apply_to_vector(result_x)
    result_xyz = transform_z.apply_to_vector(result_xy)

    note(f'result_x={result_x}')
    note(f'result_xy={result_xy}')
    note(f'result_xyz={result_xyz}')

    assert result.to_dict() == pytest.approx(result_xyz.to_dict())

@given(
    st_transform_orig_vector(),
    st_transform_component(),
)
def test_scale_axis_compose(vector: Vector3, scale: DecimalCoord3 | OptionalDecimalCoord3):
    transform = Transform.from_optional(scale=scale)
    transform_matrix = transform.matrix

    note(f'transform_matrix={transform_matrix}')

    transform_x = Transform.from_optional(scale=OptionalDecimalCoord3.empty().copy_with(x=scale.x))
    transform_y = Transform.from_optional(scale=OptionalDecimalCoord3.empty().copy_with(y=scale.y))
    transform_z = Transform.from_optional(scale=OptionalDecimalCoord3.empty().copy_with(z=scale.z))

    note(f'transform={transform}')
    note(f'transform_x={transform_x}')
    note(f'transform_y={transform_y}')
    note(f'transform_z={transform_z}')

    result = transform.apply_to_vector(vector)

    note(f'result={result}')

    result_x = transform_x.apply_to_vector(vector)
    result_xy = transform_y.apply_to_vector(result_x)
    result_xyz = transform_z.apply_to_vector(result_xy)

    note(f'result_x={result_x}')
    note(f'result_xy={result_xy}')
    note(f'result_xyz={result_xyz}')

    assert result.to_dict() == pytest.approx(result_xyz.to_dict())

@given(
    st_transform_orig_vector(),
    st_transform_component(),
    st_transform_component(),
    st_transform_component(),
)
def test_transform_types_compose(
    vector: Vector3,
    translation: DecimalCoord3 | OptionalDecimalCoord3,
    rotation: DecimalCoord3 | OptionalDecimalCoord3,
    scale: DecimalCoord3 | OptionalDecimalCoord3,
):
    transform = Transform.from_optional(translation=translation, rotation=rotation, scale=scale)
    transform_matrix = transform.matrix

    note(f'transform_matrix={transform_matrix}')

    transform_tr = Transform.from_optional(translation=translation)
    transform_rt = Transform.from_optional(rotation=rotation)
    transform_sc = Transform.from_optional(scale=scale)

    note(f'transform={transform}')
    note(f'transform_tr={transform_tr}')
    note(f'transform_rt={transform_rt}')
    note(f'transform_sc={transform_sc}')

    result = transform.apply_to_vector(vector)

    note(f'result={result}')

    result_tr = transform_tr.apply_to_vector(vector)
    result_tr_sc = transform_sc.apply_to_vector(result_tr)
    result_tr_sc_rt = transform_rt.apply_to_vector(result_tr_sc)

    note(f'result_tr={result_tr}')
    note(f'result_tr_sc={result_tr_sc}')
    note(f'result_tr_sc_rt={result_tr_sc_rt}')

    assert result.to_dict() == pytest.approx(result_tr_sc_rt.to_dict())


@given(st_transform_orig_vector(), st.from_type(Transform))
def test_array_vector_consistent(vector: Vector3, transform: Transform):
    transform_matrix = transform.matrix
    note(f'transform_matrix={transform_matrix}')

    arr = vector.to_array()
    transformed_arr = transform.apply_to_array(arr)

    assert Vector3.from_array(transformed_arr) == transform.apply_to_vector(vector)

@given(st.lists(st_transform_orig_vector()), st.from_type(Transform))
def test_vertices_vector_consistent(vectors: list[Vector3], transform: Transform):
    transform_matrix = transform.matrix
    note(f'transform_matrix={transform_matrix}')

    transformed_vs = transform.apply_to_vertices(vectors)

    assert transformed_vs == [transform.apply_to_vector(v) for v in vectors]
