import type { Column, GridOption, MenuCommandItem } from "@slickgrid-universal/common";

export type SelectableOptions = {
    commandItems: (MenuCommandItem | 'divider')[];
    multiSelect: boolean;
}

export type TreeOptions<T> = {
    treeColumnId: string;
    treeParentPropName: string;
    canHaveChildren: (record: T) => boolean;
    onUpdate?: (dataset: T[]) => void;
}


export function basicConfig(): GridOption {
    return {
        gridWidth: '100%',
        topPanelHeight: 32,
        preHeaderPanelHeight: 32,
        headerRowHeight: 32,
        rowHeight: 32,
        footerRowHeight: 32,
        enableCellNavigation: true,
        enableContextMenu: false,
        enableColumnPicker: false,
        enableColumnReorder: false,
        enableColumnResizeOnDoubleClick: false,
        enableFiltering: true,
        enableSelection: false,
        headerMenu: { hideColumnHideCommand: true },
        showCustomFooter: false,
    };
}

export function selectableConfig<T>(options: SelectableOptions): GridOption<Column<T>> {
    return {
        ...basicConfig(),
        enableSelection: true,
        multiSelect: options.multiSelect,
        showCustomFooter: true,
        enableContextMenu: true,
        contextMenu: {
            hideCloseButton: true,
            commandListBuilder: () => options.commandItems,
            onBeforeMenuShow: (e, args) => {
                if (!args.grid.getSelectedRows().includes(args.row)) {
                    args.grid.setSelectedRows([args.row]);
                }
            },
        },
    };
}

export function treeSelectableConfig<T>(options: SelectableOptions & TreeOptions<T>): GridOption<Column<T>> {
    return {
        ...selectableConfig(options),
        enableRowMoveManager: true,
        enableTreeData: true,
        multiColumnSort: false,
        rowMoveManager: {
            disableRowSelection: true,
            onMoveRows: (e, args) => {
                const dataView = args.grid.getData();
                const rowItems = args.rows.map((i) => dataView.getItemByIdx(i));
                const parentPropName = options.treeParentPropName;

                if (args.insertBefore === 0) {
                    for (const rowItem of rowItems) {
                        rowItem[parentPropName] = null;
                    }
                } else {
                    const refItem = dataView.getItemByIdx(args.insertBefore - 1);

                    // Prevent cyclic relationship:
                    // We are setting refItem as the parent of each rowItem,
                    // so we check whether any rowItem is a parent of refItem
                    const idsToRoot = [refItem.id];
                    {
                        let item = refItem;
                        while (item[parentPropName] != null) {
                            idsToRoot.push(item[parentPropName]);
                            item = dataView.getItemById(item[parentPropName]);
                        }
                    }

                    if (rowItems.some((rowItem) => idsToRoot.includes(rowItem.id))) return;

                    if (options.canHaveChildren(refItem)) {
                        const parentId = refItem.id;
                        for (const rowItem of rowItems) {
                            rowItem[parentPropName] = parentId;
                        }
                    } else {
                        const parentId = refItem[parentPropName] ?? null;
                        for (const rowItem of rowItems) {
                            rowItem[parentPropName] = parentId;
                        }
                    }
                }

                options.onUpdate?.(rowItems);
            },
        },
        treeDataOptions: {
            columnId: options.treeColumnId,
            parentPropName: options.treeParentPropName,
        },
    };
}