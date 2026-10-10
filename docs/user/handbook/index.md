# ST Annotator Platform Handbook

This handbook provides detailed information on how to operate the web platform.

## Workflows

- [Account Management](./account.md)
- [Data Management](./data.md)
- [Project Management](./project.md)
- [Annotation Editor](./editor.md)

### Signing In

Signing in lands on the Welcome page, which greets you by name and shows when
you last signed in. It reports any account or session message from the previous
action, and offers nothing else: reach the work through the navigation bar
described in the workflows above.

An account with no roles can sign in but sees no pages. Give an account the
roles it needs as described in [Account Management](./account.md).

## Common Widgets

### Data Table

This table is used to list data entries and allow the user to edit them. The same table is used wherever entries are listed — projects, users, groups, tasks, frames and so on — and works the same way throughout the platform.

#### Toolbar

A toolbar is placed above the table to provide access to functions that do not require any selected rows.

Each kind of entry is created with its own button whose label names the entry, such as `Create Project` on the Projects page or `Create User` on the Accounts page. Clicking such a button opens an empty form to fill in.

!!! tip
    The toolbar holds entry creation and row selection only. Anything that changes several entries at once is a command in the [context menu](#context-menu), so a bulk change has exactly one way to reach it and the toolbar cannot offer a narrower version of it by accident.

#### Row Selection

There are a few ways to select rows in the table:

- Click on a row to select it.
- On tables where several rows can be selected at once:
    - Hold <kbd>Ctrl</kbd> while clicking to add a row to the selection, or to remove it again, without changing the rows already selected.
    - Hold <kbd>Shift</kbd> while clicking to select a range of rows at once.
    - Use `Select Current Page` to select every row shown on the current page.
    - Use `Select All (N)` to select every entry of the list, including those shown on other pages; `N` is how many entries the list holds under the current filters. A table that is long enough to page offers both buttons; one that always shows its whole list — the task list of a project, or the contents of a directory in the File Explorer — offers only `Select All (N)`, because there is no other page to choose between.
    - While rows are selected, these buttons are replaced by `Deselect All (N selected)`, which clears the whole selection; the number shown is how many rows are currently selected.

Tables whose entries are only ever changed one at a time — Groups, repositories, branches and label specifications, for example — keep one row selected at a time: clicking a row replaces the previous selection, and no bulk selection buttons are offered.

#### Context Menu

The context menu can be accessed by right-clicking a row in the table. The row is selected first if it is not already part of the selection, so the commands apply to the current selection.

Usually, you can use it to perform the following operations:

- The `Edit Details` command opens a form to view and modify the details of each item in the current selection.
    - If you do not have permissions to modify them, the command changes to `View Details` which provides read-only access.
- The `Delete` command opens a form to delete the item in the current selection. Where a table allows several items to be deleted at once, selecting two or more rows replaces it with `Batch Delete`.

The command names depend on the table you are looking at. The same place in the menu may be occupied by `Batch Edit Details`, `Open Details` or `Edit Completion`, and commands such as `Open` lead to another page rather than to a form.

Where a table supports bulk changes, this menu is the only way to start one: it offers `Batch Edit Details` once two or more rows are selected, and `Batch Delete` on the tables that can delete a selection. Both open the dialog described in [Batch Edit](#batch-edit). A command that changes a single entry disappears while several rows are selected, so a multi-row selection can never quietly narrow itself to the row you happened to right-click; `Open` and `View Details` stay, because reading one entry changes nothing, and a table with no bulk command for you at all keeps its single-entry commands whatever you have selected.

!!! tip
    On tables whose rows lead to another page, such as the Projects page, you can double-click a row instead of choosing `Open` in the context menu.

The available operations may vary depending on your permissions as well as the current selection. Some cannot be performed in batch mode and thus only appear in the context menu when a single row is being selected.

#### Batch Edit

A batch dialog changes every selected entry at once. Each attribute it can change has its own checkbox, and only the attributes you tick are written; the footer of the dialog names how many entries the write covers, such as `Apply to 4 Projects`. That footer stays disabled until you tick at least one attribute, since a batch with nothing ticked would change nothing.

Each selected entry receives the same value, so an attribute you enable **replaces** what the entry already holds rather than adding to it. The empty case is a value like any other: ticking an assignment section and leaving its picker empty removes everyone from every selected entry, and ticking a text field and leaving it empty clears that field everywhere -- unless an entry cannot exist without that value, in which case nothing is cleared: the reason appears in the dialog and no entry changes.

What a dialog offers depends on the entries it acts on. An attribute that has to stay unique, such as a project's name, is not offered, and an attribute that only makes sense for one entry is left to the single-row form. Every table drops its single-row commands while several rows are selected, leaving `Batch Edit Details` in their place.

The write goes out as a single request, and the whole batch is checked before any of it is stored, so a rejection changes nothing and reports the reason in the dialog for you to correct and retry. On success the dialog closes and the table reloads with the new values.

#### Filtering, Sorting and Paging

A row of filters is placed directly below the column headers:

- Type into the filter box of a column to keep only the rows that match it.
- Other columns provide a drop-down list to pick one or more values from, or two date boxes defining a range.

Rows which do not match every filter are hidden, and applying a filter returns the table to the first page.

Click on the header of a sortable column to sort the table by that column. An arrow in the header shows which column is sorted and in which direction, and clicking the header again reverses it. Applying a sort also returns the table to the first page.

Long lists are divided into pages, with the page controls shown just below the table: buttons that jump to the first or the last page and step to the previous or the next page, the current page position, and a selector that sets how many rows are shown per page (25, 50, 100, 250 or 500).

The filters, the sorting and the page you are on all form part of the address of the page, so reloading it, bookmarking it or sharing its address brings the table back to the same view.
