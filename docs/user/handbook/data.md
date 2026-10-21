# Data Management

Prepare source data and label data before assigning annotation work:

- **Source data** are the scans and other inputs that annotators inspect.
- **Label data** are the annotations they create, such as boxes, vectors,
  segmentations, and relations.

[Register source data](#source-data) so it can appear in the editor, then
[configure label data](#label-data) to choose the available classes and where
annotations are saved.

## Permissions

The `data-manager` role is required to manage source and label data.

Users with the `project-manager` role can access source and label data pages in read-only mode, but cannot use the file explorer; nor can they create, modify or delete data.

## Workflows

### Source Data

To set up source data for a project, follow these steps:

1. Use [Manage Data Groups](#source-data-groups) to create a group.
2. Use [Manage Data Specifications](#source-data-specifications) to describe how to read that data type and select the group under `Source Groups`.
3. Use [File Explorer](#source-file-explorer) to register files in the group. Each registered file becomes a data item.
4. Use [Manage Data Items](#source-data-items) to review or edit registered items and move them between groups.

More details are provided below.

<a id="source-data-groups"></a>
##### Manage Data Groups

Navigate to the Source Groups page (`Source Data > Groups`) to view groups via a [data table](./index.md#data-table).

Users with the `data-manager` role can also add, modify and delete groups.

<a id="source-file-explorer"></a>
##### File Explorer (`data-manager` only)

Open the File Explorer to browse available files and register them in source groups using a [data table](./index.md#data-table).

The file explorer only creates new assignments. A file may be registered to several groups, and registering a file that another group already uses leaves that group untouched, but the explorer never changes or removes an item that is already registered. To reallocate an existing item, use [Manage Data Items](#source-data-items).

When importing source metadata:

- The `Timestamp Range` fieldset lets you detect timestamps from filenames or enter a range by hand. `Detect timestamps from filenames` assigns each detected timestamp as both the minimum and maximum for that file. With the pattern input blank, detection recognizes `YYYY_MM_DD=HH_mm_ss_fff` (or six fractional digits) and a 13-digit Unix epoch timestamp in milliseconds. For other filename conventions, enter a pattern such as `scan_%Y%m%d_%H%M%S`. Use `%Y` for year, `%m` for month, `%d` for day, `%H` for hour, `%M` for minute, `%S` for second, and `%f` for fractional seconds. The pattern matches the whole filename stem, excluding directories and the extension. The dialog shows the number of matches; unmatched files have no timestamp. Turn off detection to enter timestamps by hand.
- In the `Spatial Bounds` fieldset, `Derive spatial bounds` calculates bounds from each scan; turn it off to enter bounds by hand.
- The `Transform` fieldset holds translation, rotation and scale.

!!! tip
    Double-click a directory to open it. Right-click a file to see its actions. An `Opening <directory>` indicator appears while a directory loads; wait for it to finish before opening another.

<a id="source-data-items"></a>
##### Manage Data Items

Navigate to the Source Data Storage page (`Source Data > Data Storage`), which lists one tab for each data type available on your deployment. Select the tab of the data type you are working with to view its data items via a [data table](./index.md#data-table). The items of a group are loaded once you select that group under `Source Group`.

Users with the `data-manager` role can also add, modify and delete data items.

Edit an item's `Timestamp Range`, `Spatial Bounds`, and `Transform` using the same controls as the [File Explorer](#source-file-explorer). In a batch edit, enabled fields replace the current values on every selected item. Timestamp detection and bounds derivation calculate values separately for each item.

Source group allocations of existing items are changed here rather than in the [File Explorer](#source-file-explorer): select the items and choose `Batch Edit Details`, then set the new group under `Update Source Group`. An item belongs to exactly one group, so a batch moves items between groups rather than taking them out of one: you must choose a group before applying `Update Source Group`. The `Edit Details` form of a single item shows its group but keeps it fixed.

Changes that affect spatial bounds may take time to appear in the editor.
Until recalculation finishes, an item keeps its previous bounds, which determine
which frames include it. If its file is unavailable or its group has no suitable
specification, the previous bounds remain. Use
[Background Jobs](#source-background-jobs) to check progress.

The `Update Source Group` list of the point cloud tab greys out a group that no point cloud specification lists yet, labelling it `(missing point cloud source)`. Add a point cloud specification for the group before moving items into it. See [Batch Editing](./index.md#batch-editing) for how the dialog works.

<a id="source-data-specifications"></a>
##### Manage Data Specifications

Navigate to the Source Specifications page (`Source Data > Specifications`), which lists one tab for each data type available on your deployment. Select the tab of the data type you are working with to view its data specifications via a [data table](./index.md#data-table).

Users with the `data-manager` role can also add, modify and delete data specifications.

Choose the groups that use a specification under `Source Groups`. One
specification can serve several groups, but a group can use only one
specification for each data type. Remove a group from its previous specification
before assigning it to another. A specification with no groups is unused.

For point clouds, use the `Preprocessors` tab to choose operations and adjust
their settings. Operations run in the order shown. Changing an operation also
changes the settings available on its card. Use `Preprocessors (Raw JSON)` to
edit the list directly. Invalid JSON is marked `invalid`; correct it to use the
cards again.

To edit several specifications, select them and choose `Batch Edit Details`.
Enabled fields replace the values on every selected specification. You can
assign nonempty `Source Groups` only when one specification is selected. With
several selected, leave `Update Source Groups` unticked to keep their groups, or
tick it with an empty picker to remove all their group assignments.
See [Batch Editing](./index.md#batch-editing) for the shared dialog controls.

Create a specification and assign its groups before registering files. Changes
to specifications or their group assignments can trigger spatial-bounds
recalculation for affected items. Items in a group left without a specification
keep their previous bounds until a specification is assigned again.

<a id="source-background-jobs"></a>
##### Background Jobs (`data-manager` only)

Open `Source Data > Background Jobs` to check imports and data updates that
continue after you save.

The table shows each job's description, progress, timing, and state:
`pending`, `running`, `succeeded`, `failed`, or `cancelled`. Failed or cancelled
jobs also show an `Error`. Use the `State` filter to focus on particular states.
The page refreshes automatically while jobs are pending or running.

To cancel a running job, right-click its row and choose the cancellation command.
Cancellation keeps work already completed and may take time to stop an operation
in progress. There is no retry button; a later change to the affected data can
start new work.

When saving starts background work, a message links to the jobs it created.
A save that needs no new background work shows no job message.

### Label Data

To set up label data for a project, follow these steps:

1. Use [Manage Data Groups](#label-data-groups) to create a new group.
2. Use [Manage Data Specifications](#label-data-specifications) to define the object classes that may be labelled, and to select the object classes to include for that group; each selection lists the groups it applies to under its `Label Groups` field.
3. Use [Manage Labelset Branches](#labelset-branches) to create the branch for each annotator and reviewer, granting annotators `Write` access and reviewers `Write Elevated` access to the branches they will save to.
    - To avoid conflicts between users, each annotator should have their own branch, while each supervisor should have access to the branch of each annotator they plan to review. Supervisors should also avoid editing the dataset while reviewing an annotator's work.

To view the annotated labels from a project, follow these steps:

1. Use [View Data Items](#label-data-items) to view the latest saved labels on each branch.
2. Use [View Labelset Commits](#labelset-commits) for a more detailed view of the annotation operations involved.

More details are provided below.

<a id="label-data-groups"></a>
##### Manage Data Groups

Navigate to the Label Groups page (`Label Data > Groups`) to view groups via a [data table](./index.md#data-table).

Users with the `data-manager` role can also add, modify and delete groups.

<a id="label-data-items"></a>
##### View Data Items

Navigate to the Label Data Storage page (`Label Data > Data Storage`), which lists one tab for each data type available on your deployment. Choose a data type and a `Label Group`, then choose a saved version under `Commit` to view its labels in a [data table](./index.md#data-table). The version names identify the branch or checkpoint they belong to.

Label data loads one page at a time. Use `Previous` and `Next` below the table to browse the selected saved version, and `Rows per page` to change the page size. For performance reasons, only the current page number is shown but not the exact page total.

Column filters search all records in the selected saved version before pagination. Changing a filter returns to the first page; `Previous` and `Next` retain the filters. Use the class selector to filter by class name. The Relations table also lets you filter source and target types and IDs. Switching between elements and entities clears column filters.

Right-click a label row and choose `View Details` to inspect its saved values. Relation details include the class name, source and target types and IDs, and revision information. The details dialog is read-only.

<a id="label-data-specifications"></a>
##### Manage Data Specifications

Navigate to the Label Specifications page (`Label Data > Specifications`), which lists one tab for each data type available on your deployment. Select the tab of the data type you are working with to view its data specifications via a [data table](./index.md#data-table). Users with the `data-manager` role can also add, modify and delete data specifications.

Use `Label Data > Specifications > Object Classes` to configure the classes annotators can assign to objects. The page has two tabs:

- `Definitions` sets the details of each object class.
- `Selections` sets the object classes to include for each label group.

Choose the groups that use a selection under `Label Groups`. One selection can serve several groups, but a group can use only one selection. A selection with no groups is unused. A group with no selection offers no object classes in the editor.

If the Relations layer is available, use its label specifications to configure relation classes separately from object classes.

!!! tip
    Create the object class definitions under `Definitions` first, so that they can be included in a selection under `Selections`.

#### Open Repository

Navigate to the Repositories page (`Label Data > Repositories`), then right-click a row in the [data table](./index.md#data-table) and choose `Open Repository` to access the site of the repository corresponding to the label group.

!!! tip
    You can double-click on a repository to open it without having to use the context menu.

<a id="labelset-branches"></a>
##### Manage Labelset Branches

Navigate to the `Branches` page of a repository to view its branches via a [data table](./index.md#data-table). The `Your Access` column shows the level you hold on each branch.

Only users with the `data-manager` role see the `Create Branch` button. A `data-manager` can modify and delete an existing branch. A user with `Admin` on that branch can do the same; other users open it read-only as `View Branch`. Branch names must be unique within a repository, although another repository may use the same name.

###### Branch Access Levels

Access is granted per user, on one branch at a time. Pick a level for each account in the `Permissions` section of the create or edit form; your own row stays `Admin` while you edit.

- `None`: the branch is invisible to that user, unless one of the role overrides below grants them a level on every branch.
- `Read`: the branch and its commits can be viewed, and its labels can be opened in the annotation editor, but nothing can be saved to it.
- `Write`: create, edit, delete, and save labels on the branch. This is the level an annotator needs.
- `Write Elevated`: edit and save labels with the access required for review assignments.
- `Admin`: everything above, plus renaming and deleting the branch and editing its `Permissions`.

A role adds to whatever level is assigned to a user. A `data-manager` holds every level on every branch without a grant of their own, which is what the `Your Access` column shows for them. A `project-manager` holds `Read` on every branch without a grant of their own, so every branch of a repository appears in their `Branches` page, and the ones carrying no grant for them show `None` in `Your Access` and open as `View Branch`.

!!! tip
    If an account is missing from the `Permissions` picker, ask an administrator to grant its first access to the repository. Administrators can choose any account. Data managers can choose themselves and accounts that already have access to a branch in that repository.

###### Granting Branch Access

1. Navigate to `Label Data > Repositories`, then choose `Open Repository` on the repository that holds the branch.
2. On the `Branches` page, choose `Create Branch` to make one, or `Open Details` on an existing branch to change its access.
3. In the `Permissions` section, set each account's level: `Write` for the annotators who will save to the branch, `Write Elevated` for the reviewers, and `Admin` for whoever should manage it.
4. Save the form.

Assigning frames then requires those same grants: see [Edit Frames](./project.md#edit-frames).

<a id="labelset-commits"></a>
##### View Labelset Commits

Navigate to the `Commits` page to view the commit graph of that repository.

Hover over a tag or commit in the graph to view more details.
