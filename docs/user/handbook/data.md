# Data Management

Datasets on the ST Annotator Platform are divided into source data and label data:

- Source data are inputted to the ML model.
- Label data are the expected outputs of the ML model.

In the context of annotation, humans refer to source data to create label data. Before annotation can begin, source data must first be [registered](#source-data) and label data [configured](#label-data) on the platform.

Below is a comprehensive list of workflows that relate to data management.

## Permissions

The `data-manager` role is required to manage source and label data.

Users with the `project-manager` role can access source and label data pages in read-only mode, but cannot use the file explorer; nor can they create, modify or delete data.

## Workflows

### Source Data

To set up source data for a project, follow these steps:

1. Use [Manage Data Groups](#source-data-groups) to create a new group.
2. Use [File Explorer](#source-file-explorer) to select the files to include in the group; each file you register becomes a new data item.
3. Use [Manage Data Items](#source-data-items) to review those items and to change the group of any that are already registered.
4. Use [Manage Data Specifications](#source-data-specifications) to create the specifications of the relevant data type; each specification lists the groups it applies to under its `Source Groups` field.

More details are provided below.

<a id="source-data-groups"></a>
##### Manage Data Groups

Navigate to the Source Groups page (`Source Data > Groups`) to view groups via a [data table](./index.md#data-table).

Users with the `data-manager` role can also add, modify and delete groups.

<a id="source-file-explorer"></a>
##### File Explorer (`data-manager` only)

Navigate the filesystem and register source data files to source groups via a [data table](./index.md#data-table).

The file explorer only creates new assignments. A file may be registered to several groups, and registering a file that another group already uses leaves that group untouched, but the explorer never changes or removes an item that is already registered. To reallocate an existing item, use [Manage Data Items](#source-data-items).

When importing source metadata:

- The `Timestamp Range` fieldset lets you detect timestamps from filenames or enter a range by hand. `Detect timestamps from filenames` assigns each detected timestamp as both the minimum and maximum for that file. With the pattern input blank, detection recognizes `YYYY_MM_DD=HH_mm_ss_fff` (or six fractional digits) and a 13-digit Unix epoch timestamp in milliseconds. Enter a Python strftime style pattern such as `scan_%Y%m%d_%H%M%S` for another filename convention; numeric `%Y`, `%m`, `%d`, `%H`, `%M`, `%S`, and `%f` directives are supported. The pattern matches the whole filename stem, excluding directories and the extension. The dialog shows the number of matches; unmatched names get null timestamps. Turn off detection to enter timestamps by hand.
- In the `Spatial Bounds` fieldset, `Derive spatial bounds` calculates bounds from each scan; turn it off to enter bounds by hand.
- The `Transform` fieldset holds translation, rotation and scale.

!!! tip
    You can double-click on a directory to open it without having to use the context menu. Double-clicking a file does nothing; its actions live in the context menu. While the next directory loads, the current listing stays on screen under an `Opening <directory>` indicator and ignores further activations, so a slow directory load is visible rather than silent.

<a id="source-data-items"></a>
##### Manage Data Items

Navigate to the Source Data Storage page (`Source Data > Data Storage`), which lists one tab for each data type available on your deployment. Select the tab of the data type you are working with to view its data items via a [data table](./index.md#data-table). The items of a group are loaded once you select that group under `Source Group`.

Users with the `data-manager` role can also add, modify and delete data items.

You may edit the `Timestamp Range`, `Spatial Bounds`, and `Transform` of existing items, similar to the [File Explorer](#source-file-explorer). Each attribute you enable **replaces** what the selected items already hold, except for `Update Timestamp Range` and `Update Bounds Derivation` which automatically calculates `Timestamp Range` and `Spatial Bounds` for each item independently.

Source group allocations of existing items are changed here rather than in the [File Explorer](#source-file-explorer): select the items and choose `Batch Edit Details`, then set the new group under `Update Source Group`. An item belongs to exactly one group, so a batch moves items between groups rather than taking them out of one: applying `Update Source Group` while its list is still unset reports that in the dialog and sends no request. The `Edit Details` form of a single item shows its group but keeps it fixed.

Re-deriving spatial bounds means reading the item's stored data again, which is too much to ask of a save that touches a whole group, so those recomputations happen in the background instead: an item whose bounds a change has invalidated is marked as awaiting derivation and refreshed a moment later. A bounds is therefore allowed to lag the change that invalidated it -- which matters because a bounds decides which frames an item appears in -- and an item that cannot be refreshed at all (its group has no point cloud specification, or its stored file has gone) keeps the bounds it had rather than losing it. See [Background Jobs](#source-background-jobs) for where that delay becomes visible.

The `Update Source Group` list of the point cloud tab greys out a group that no point cloud specification lists yet, labelling it `(missing point cloud source)`, since an item there cannot be parsed without one. See [Batch Edit](./index.md#batch-edit) for how the dialog works.

<a id="source-data-specifications"></a>
##### Manage Data Specifications

Navigate to the Source Specifications page (`Source Data > Specifications`), which lists one tab for each data type available on your deployment. Select the tab of the data type you are working with to view its data specifications via a [data table](./index.md#data-table).

Users with the `data-manager` role can also add, modify and delete data specifications.

A specification lists every group it parses under its `Source Groups` field, so one specification can serve several groups. The relationship is single-valued in the other direction: a group is listed by at most one specification of its data type, so adding a group that another specification already lists is rejected, and `Batch Edit Details` assigns groups to one selected specification at a time. Unlisting every group leaves the specification unassigned, parsing nothing until a group is added.

A point cloud specification's `Preprocessors` open as two tabs: one card per operation, in the order they are applied, under `Preprocessors`, and the JSON that is actually saved under `Preprocessors (Raw JSON)`. Each card names its operation and shows only that operation's parameters, so switching the operation replaces them, and an empty list says so instead of showing nothing. The raw text is authoritative: while it holds something that does not parse as a preprocessor list, that tab is marked `invalid` and the cards keep showing the last list that did until it is fixed.

You may select several specifications and choose `Batch Edit Details` to set `Name`, `Description`, `Source Groups`, and so on. The single-specification rule still holds under a batch: naming any group while more than one specification is selected keeps the dialog from applying the write, since the same list would be handed to each of them, and unassigning a group from its current owner is required first. Untick `Update Source Groups` to batch the other attributes over several specifications, or leave its picker empty to unassign every selected one. See [Batch Edit](./index.md#batch-edit) for how the dialog works.

Because registering a data item needs a group that already has a specification of that type, create the specification before the group holds any items.

Saving a specification adds, drops or replaces the groups it lists, and every group it touched -- the ones it left as well as the ones it joined -- has its data items re-derived against whatever specification owns them now. Removing a group therefore refreshes nothing in the group that stayed, and a group left without a specification keeps the boxes its items already hold until a specification lists it again.

<a id="source-background-jobs"></a>
##### Background Jobs (`data-manager` only)

Navigate to the Background Jobs page (`Source Data > Background Jobs`) to see the work the platform has queued rather than performed inside a save.

The page lists every job by default, with its description, its state (`pending`, `running`, `succeeded`, `failed` or `cancelled`), how far it has got, when it was created, started and finished, and -- for a job that failed or was cancelled -- the `Error` that ended it. Use the `State` filter to narrow the inventory; clearing it returns to all states. The page refreshes itself while anything is still queued or running, and stops refreshing once the queue is idle. A data manager can cancel a running job from its row menu; the command is absent for every other state. Cancellation does not undo work the job already checkpointed, and blocking work already executing may continue until it returns, but it cannot change the row back from `cancelled`. The page offers no retry: work is queued again the next time you change the data it covers.

Below the list, the page counts the data items still awaiting a spatial-bounds derivation, one row per data type, each linking to that type's Data Storage tab. That count is the durable measure of what is owed: a job row only reports progress, so a job lost to a restart leaves its items counted here all the same. A count that falls between refreshes is a sweep working through the group; a count that stays put means those items cannot be derived as things stand -- their group has no specification of that data type, or their stored file cannot be read -- and each keeps the bounds it already had until that changes.

A save that starts work says so on the page you made it: it reports how many jobs the queue took on and links to exactly those, in whatever state they have since reached. A save that queued nothing says nothing, which is an answer rather than an omission -- a change that cannot move a derived box, or one whose work is already waiting, starts no job to look at.

### Label Data

To set up label data for a project, follow these steps:

1. Use [Manage Data Groups](#label-data-groups) to create a new group.
2. Use [Manage Data Specifications](#label-data-specifications) to define the object classes that may be labelled, and to select the object classes to include for that group; each selection lists the groups it applies to under its `Label Groups` field.
3. Use [Manage Labelset Branches](#labelset-branches) to create the branch for each annotator and reviewer, granting each of them `Write` access to the branches they will save to.
    - To avoid conflicts between users, each annotator should have their own branch, while each supervisor should have access to the branch of each annotator they plan to review. Supervisors should also avoid editing the dataset while reviewing an annotator's work.

To view the annotated labels from a project, follow these steps:

1. Use [View Data Items](#label-data-items) to view the data at the head commit of each labelset branch.
2. Use [View Labelset Commits](#labelset-commits) for a more detailed view of the annotation operations involved.

More details are provided below.

<a id="label-data-groups"></a>
##### Manage Data Groups

Navigate to the Label Groups page (`Label Data > Groups`) to view groups via a [data table](./index.md#data-table).

Users with the `data-manager` role can also add, modify and delete groups.

<a id="label-data-items"></a>
##### View Data Items

Navigate to the Label Data Storage page (`Label Data > Data Storage`), which lists one tab for each data type available on your deployment. Select the tab of the data type you are working with, then select the group under `Label Group` and the commit under `Commit` (each commit is named after the branch whose head or checkpoint it is) to view its data items via a [data table](./index.md#data-table).

<a id="label-data-specifications"></a>
##### Manage Data Specifications

Navigate to the Label Specifications page (`Label Data > Specifications`), which lists one tab for each data type available on your deployment. Select the tab of the data type you are working with to view its data specifications via a [data table](./index.md#data-table). Users with the `data-manager` role can also add, modify and delete data specifications.

Object classes are the only label specifications that the platform provides out of the box, and are managed on the `Object Classes` page (`Label Data > Specifications > Object Classes`), which provides two tabs:

- `Definitions` sets the details of each object class.
- `Selections` sets the object classes to include for each label group.

A selection applies to every group it lists under `Label Groups`, so one selection can serve several groups, and a group is listed by at most one selection. Leaving `Label Groups` empty keeps the selection unassigned; a group with no selection offers no object classes to label.

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
- `Write`: commits can be saved to the branch, and label data can be created, updated and deleted at its commits. This is the level an annotator needs.
- `Write Elevated`: offered between the two levels above. Behaves like `Write` with access to additional operations such as merging datasets (to be implemented in the future). This is the level a reviewer needs.
- `Admin`: everything above, plus renaming and deleting the branch and editing its `Permissions`.

A role adds to whatever level is assigned to a user. A `data-manager` holds every level on every branch without a grant of their own, which is what the `Your Access` column shows for them. A `project-manager` holds `Read` on every branch without a grant of their own, so every branch of a repository appears in their `Branches` page, and the ones carrying no grant for them show `None` in `Your Access` and open as `View Branch`.

!!! tip
    Granting someone their first access to a repository can require an `admin` or `data-manager`. Accounts listed in the `Permissions` picker are the ones the editor may see: `admin` users get every account, while `data-manager`s only get their own account plus accounts that already hold a grant on some branch of that repository.

###### Granting Branch Access

1. Navigate to `Label Data > Repositories`, then choose `Open Repository` on the repository that holds the branch.
2. On the `Branches` page, choose `Create Branch` to make one, or `Open Details` on an existing branch to change its access.
3. In the `Permissions` section, set each account's level: `Write` for the annotators who will save to the branch, `Write Elevated` for the reviewers, and `Admin` for whoever should manage it.
4. Save the form.

Assigning frames then requires those same grants: see [Edit Frames](./project.md#edit-frames).

<a id="labelset-commits"></a>
##### View Labelset Commits

Navigate to the `Commits` page to view the commit graph of that repository.

Hover over an tag or commit in the graph to view more details.
