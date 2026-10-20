# Project Management

Use projects to organize annotation work into tasks and assign frames to annotators and reviewers.

To set up a project, follow these steps:

1. Use [Edit Projects](#edit-projects) to create a new project.
    - Assign other users to the project so that they can access it without elevated permissions.
2. Use [Edit Tasks](#edit-tasks) to create the tasks to be completed under that project.
    - Assign annotators and supervisors to each task.
3. Use [Edit Frames](#edit-frames) to create the frames to be completed under each task.
    - Each frame defines the time range and area shown in the annotation editor. The editor displays source data and labels within those boundaries.
    - Select the account, source group and label branch for each frame when the frame is created.
    - Frames are not shared between users. You should create a batch of frames for each annotator and supervisor separately.
    - Annotator frames should usually use the annotator's own label branch.
    - Reviewer frames (the `Reviewer Frames` tab) should use the branches that the supervisor needs to review, and can only be assigned to users assigned as supervisors for that task on the [Tasks page](#edit-tasks).

## Permissions

The `project-manager` role is required to manage projects, tasks and frames through the web platform.

Project managers can view and edit all frames in their projects. Users without the `project-manager` role can only view their own frames, and can only edit the completion status of those frames.

## Workflows

<a id="edit-projects"></a>
#### Edit Projects (`project-manager` only)

Navigate to the Projects page (`Projects`) to add and modify projects via a [data table](./index.md#data-table).

Only users with the `admin` role can delete a project; the `Delete` command does not appear for other project managers.

You can assign users as project members so that they can access that project even without the `project-manager` role.

Use the `Configuration` tab to set the frame cache size, automatic tracks, and
the editor's initial camera position and target. Use `Configuration (Raw JSON)`
to edit the configuration directly. Invalid JSON is marked `invalid`; correct it
to use the other tab again.

To update several projects, select them and choose `Batch Edit Details`. You can
change `Description`, `Members`, or `Configuration`. Enabled fields replace the
current values on every selected project. Review the member list carefully:
anyone omitted loses their membership, including you if you leave yourself out.
The dialog lists the members who would be removed before you apply the change.
Project names must be edited individually.

See [Batch Editing](./index.md#batch-editing) for the shared dialog controls.

### Open Project

Navigate to the Projects page (`Projects`), then right-click a row in the [data table](./index.md#data-table) and choose `Open` to access the site of that project.

!!! tip
    You can double-click on a project to open it without having to use the context menu.

<a id="edit-tasks"></a>
##### Edit Tasks (`project-manager` only)

Inside the site of a project, navigate to the Tasks page (`Tasks`) to add, modify and delete tasks via a [data table](./index.md#data-table). Task names must be unique within a project; different projects can use the same task name.

You can assign project members with the relevant role as annotators (`annotator` role) and/or supervisors (`supervisor` role) so that they can access that task and contribute to it accordingly. Only project members holding the matching role can be assigned, and both are required: the role and the project membership.

An assignment is also checked against the label branches already used by the frames of that task and its subtasks: each assigned annotator needs at least `Write` access to those branches, and each assigned supervisor needs `Write Elevated`. Grant access before assigning, as described in [Granting Branch Access](./data.md#granting-branch-access). If access is missing, the Tasks page shows `Invalid task branch permissions` with the affected accounts and branches. Grant the required access, then save the assignment again. A task with no frames does not need branch access yet.

You may select several tasks and choose `Batch Edit Details` to reassign `Supervisors` or `Annotators` for all of them at once. Each attribute you enable **replaces** what the selected tasks already hold, so every task ends up with exactly the list you pick and ticking a section with an empty picker unassigns everyone from all of them. A task's name, description and deadline are not batch-editable. Every assignment must meet the role, membership, and branch-access requirements. If any assignment is invalid, none of the selected tasks change. See [Batch Editing](./index.md#batch-editing) for how the dialog works.

!!! tip
    You can drag and drop tasks or use the edit menu to create multiple levels of tasks, enabling inheritance of supervisors and annotators (meaning that a child task will also have those of its parent task).

#### Open Task

Inside the site of a project, navigate to the Tasks page (`Tasks`), then right-click a row in the [data table](./index.md#data-table) and choose `Open` to access the site of that task.

!!! tip
    You can double-click on a task to open it without having to use the context menu.

##### View Recent Frames

Inside the site of a task, navigate to the Recent Frames page (`Recent Frames`) to view the frames that you have recently accessed in the [Annotation Editor](./editor.md), via a [data table](./index.md#data-table). Frames are listed under one of two tabs: `Annotator Frames` for frames to annotate and `Reviewer Frames` for frames to review. The sidebar link opens the `Annotator Frames` tab, so switch tabs to see the other work type.

##### View All Frames

Inside the site of a task, navigate to the All Frames page (`All Frames`) to view all frames which are assigned to you via a [data table](./index.md#data-table), under the same `Annotator Frames` and `Reviewer Frames` tabs.

You may select several of your own frames and choose `Batch Edit Details` to set their completion status all at once, which is the same single attribute the `Edit Completion` form of one frame offers. See [Batch Editing](./index.md#batch-editing) for how the dialog works.

<a id="edit-frames"></a>
###### Edit Frames (`project-manager` only)

Inside the site of a task, navigate to the All Frames page (`All Frames`) to add, modify and delete frames assigned to each user via a [data table](./index.md#data-table), selecting the `Annotator Frames` or `Reviewer Frames` tab for the work type you are managing. The table can be filtered by the frame's owner, so you can work through one user's frames at a time.

If you also have the `data-manager` role, select a user to open
`Initialize a label branch` above the table. This section starts expanded if the
user needs a branch for the active tab.

1. Choose a label repository.
2. Keep or change the suggested `<username>-annotate` or `<username>-review` name.
3. For a reviewer branch, optionally choose a reference branch to start with a
   copy of its current labels.
4. Create the branch, then select it when creating frames.

The selected user receives `Write` access for annotation or `Write Elevated` for
review. You receive `Admin` access to manage the branch. If you are creating a
branch for yourself, your access is `Admin`.

You may select several frames and choose `Batch Edit Details` to set their `Complete` status for the whole selection at once. The dialog offers nothing else: which account a frame belongs to, and the source group and label branch it reads, are per-frame choices that stay with the single-frame form. See [Batch Editing](./index.md#batch-editing) for how the dialog works.

Unlike in other data tables, the `Create Frames` button in this table offers generation methods that build the list of frames for you: `Generate from range`, `Generate and set cells`, `Generate from data`, and `Generate from meshgrid`.

Each frame belongs to one account and selects its own source group and label branch. You can use any source group that exists when constructing frames, but the label branch must be one the frame's account can save to: its owner needs at least `Write` access for an annotator frame and `Write Elevated` for a reviewer frame, so grant that first via [Granting Branch Access](./data.md#granting-branch-access).

Note that you can only manage frames for users who are assigned as annotators and/or supervisors for that task, and that reviewer frames can only be assigned to supervisors.

### Open Annotation Editor

Annotation tasks can be performed via the [Annotation Editor](./editor.md).

#### From Project

To access the annotation editor under a project, follow these steps:

1. Use [Open Project](#open-project) to access the project sidebar, then open the editor in either Annotate mode (`Annotate`) or Review mode (`Review`) for that project.
2. In the `Project > Task` tab, select the task you would like to work on.
3. In the `Project > Task` tab, select the source group and label branch for the frames you would like to work on.
4. In the `Project > Scene` tab, select the frame you would like to work on.

#### From Task

To access the annotation editor under a task, follow these steps:

1. Use [Open Task](#open-task) to access the task sidebar, then open the editor in either Annotate mode (`Annotate`) or Review mode (`Review`) for that task.
2. In the `Project > Task` tab, select the source group and label branch for the frames you would like to work on.
3. In the `Project > Scene` tab, select the frame you would like to work on.

#### From Frame

To access the annotation editor under a frame, follow these steps:

1. Use [View Recent Frames](#view-recent-frames) or [View All Frames](#view-all-frames) to access the list of frames for either Annotate mode (`Annotate`) or Review mode (`Review`).
2. Right-click a row in the [data table](./index.md#data-table) and choose `Open` to open the editor for that frame.

!!! tip
    You can double-click on a frame to open it without having to use the context menu.
