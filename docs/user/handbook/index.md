# ST Annotator Platform Handbook

This handbook provides detailed information on how to operate the web platform.

## Workflows

- [Account Management](./account.md)
- [Data Management](./data.md)
- [Project Management](./project.md)
- [Annotation Editor](./editor.md)

### Signing In

After signing in, the Welcome page shows your name, your last sign-in time, and
any account or session messages. Use the navigation bar to open your work.

If no work pages are available, ask an administrator to check your
[account roles](./account.md).

## Common Widgets

### Data Table

Data tables list projects, accounts, groups, tasks, frames, and other entries. Use them to find entries, view details, and make changes where your permissions allow.

#### Toolbar

Use the toolbar above a table to create entries and select rows.

Each kind of entry is created with its own button whose label names the entry, such as `Create Project` on the Projects page or `Create User` on the Accounts page. Clicking such a button opens an empty form to fill in.

!!! tip
    To change several entries together, select their rows and right-click to open the [context menu](#context-menu).

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
- The `Delete` command opens a form to delete the item in the current selection. Where a table allows several items to be deleted at once, selecting two or more rows replaces it with `Batch Delete`. The confirmation dialog explains which related records will be deleted, which links will be cleared, and which records will be kept.

The command names depend on the table you are looking at. The same place in the menu may be occupied by `Batch Edit Details`, `Open Details` or `Edit Completion`, and commands such as `Open` lead to another page rather than to a form.

For tables that support bulk changes, select two or more rows to use
`Batch Edit Details` or `Batch Delete`. These open a dialog for the selected
entries. Single-entry editing commands are unavailable during a bulk selection.
Commands for opening or viewing one entry may still be available.

!!! tip
    On tables whose rows lead to another page, such as the Projects page, you can double-click a row instead of choosing `Open` in the context menu.

The available operations may vary depending on your permissions as well as the current selection. Some cannot be performed in batch mode and thus only appear in the context menu when a single row is being selected.

#### Batch Editing

Use a batch dialog to apply the same changes to all selected entries:

1. Tick the checkbox for each field you want to change.
2. Enter the new values. Unticked fields keep their existing values.
3. Check the number of affected entries in the apply button, such as `Apply to 4 Projects`, then apply the changes.

An enabled field **replaces** its existing value on every selected entry. For
example, an assignment picker replaces everyone's current assignments with the
list you choose. Leaving it empty removes all assignments. An enabled empty text
field clears that field, unless a value is required.

The available fields depend on the table. Unique names and other fields that
must be edited individually are available in the single-entry form instead.

If any change is invalid, no selected entries change. The dialog explains what
to correct before trying again. After a successful change, it closes and the
table shows the updated values.

#### Filtering, Sorting and Paging

A row of filters is placed directly below the column headers:

- Type into the filter box of a column to keep only the rows that match it.
- Other columns provide a drop-down list to pick one or more values from, or two date boxes defining a range.

Rows which do not match every filter are hidden, and applying a filter returns the table to the first page. Filters search the full list within the selected project, group, or saved version, including rows on other pages.

In text filters, use `start*` to match a prefix and `*end` to match a suffix. Numeric filters accept comparisons such as `>5`, `<10`, and `!=7`, or an inclusive range such as `2..8`.

Click on the header of a sortable column to sort the table by that column. An arrow in the header shows which column is sorted and in which direction, and clicking the header again reverses it. Applying a sort also returns the table to the first page.

Long lists are divided into pages, with the page controls shown just below the table: buttons that jump to the first or the last page and step to the previous or the next page, the current page position, and a selector that sets how many rows are shown per page (25, 50, 100, 250 or 500).

The filters, the sorting and the page you are on all form part of the address of the page, so reloading it, bookmarking it or sharing its address brings the table back to the same view.
