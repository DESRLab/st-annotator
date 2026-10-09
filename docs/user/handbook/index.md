# ST Annotator Platform Handbook

This handbook provides detailed information on how to operate the web platform.

## Workflows

- [Account Management](./account.md)
- [Data Management](./data.md)
- [Project Management](./project.md)
- [Annotation Editor](./editor.md)

## Common Widgets

### Data Table

This table is used to list data entries and allow the user to edit them.

#### Row Selection

There are a few ways to select rows in the table:

- Click on a row to select it.
    - Hold <kbd>Ctrl</kbd> while clicking to select/deselect a row while keeping other rows.
    - Hold <kbd>Shift</kbd> while clicking to select a range of rows at once.
- Use the `Select` button in the [menu bar](#menu-bar) to select multiple rows at once.

#### Menu Bar

A menu bar is placed above the table to provide access to functions that do not require any selected rows.

Usually, you can use it to perform the following operations:

- The `New` button opens a form to create a new item (row).
    - If an item is currently selected, the button changes to `Clone` which additionally copies the data from the corresponding item into the form.
- The `Select` button selects/deselects multiple rows in the table at once.

The available operations may vary depending on your permissions as well as the current selection. Some cannot be performed in batch mode and thus only appear in the context menu when a single row is being selected.

#### Context Menu

The context menu can be accessed by right-clicking a selected row in the table.

Usually, you can use it to perform the following operations:

- The `Edit` button opens a form to view and modify the details of each item in the current selection.
    - If you do not have permissions to modify them, the button changes to `View` which provides read-only access.
- The `Delete` button opens a form to delete the items in the current selection.

The available operations may vary depending on your permissions as well as the current selection. Some cannot be performed in batch mode and thus only appear in the context menu when a single row is being selected.
