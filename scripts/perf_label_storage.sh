#!/bin/bash
set -eo pipefail

CONFIG_PATH=appconfig-postgis.json
OUTPUT_DIR="data/segmentation_element_500_storage"
mkdir -p "$OUTPUT_DIR"

PLUGIN="segmentation"
COMMIT_COUNT=500
INIT_LABEL_COUNT=0
ENTITY_PERCENT=00
BRANCHING_PERCENT=00
CREATE_PERCENT=35

for delete_percent in 10 20 30; do
    for use_delta in 0 1; do
        echo "[Use delta encoding: $use_delta]"

        for seed in 1 2 3; do
            STA_USE_DELTA_ENCODING=$use_delta sta bench label-queries \
                -c $CONFIG_PATH \
                -o "$OUTPUT_DIR/perf_label_queries_${COMMIT_COUNT}_b_${BRANCHING_PERCENT}_c_${CREATE_PERCENT}_d_${delete_percent}_i_${INIT_LABEL_COUNT}_seed_${seed}_delta_${use_delta}" \
                --plugin "$PLUGIN" \
                --commit-count "$COMMIT_COUNT" \
                --branching-prob "0.$BRANCHING_PERCENT" \
                --label-entity-prob "0.$ENTITY_PERCENT" \
                --label-create-prob "0.$CREATE_PERCENT" \
                --label-delete-prob "0.$delete_percent" \
                --init-label-count "$INIT_LABEL_COUNT" \
                --seed "$seed" \
                --log-storage \
                --no-overwrite
        done
    done
done
