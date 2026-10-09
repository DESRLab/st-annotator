# Project Management

Projects are responsible for organizing the annotation workload on the ST Annotator Platform.

To set up a project, follow these steps:

1. Use [Edit Projects](#edit-projects) to create a new project.
    - Assign other users to the project so that they can access it without elevated permissions.
2. Use [Edit Tasks](#edit-tasks) to create the tasks to be completed under that project.
    - Assign data to be annotated under each task by specifying the source group.
    - Assign the destination of the labels by specifying the label group.
    - Assign annotators and supervisors to each task.
3. Use [Edit Frames](#edit-tasks) to create the frames to be completed under each task.
    - Each frame represents a scene in the annotation editor. Any source and label data that exist within the frame's spatiotemporal boundaries are included in the scene, and will be automatically loaded and displayed to the user.
    - Frames are not shared between users. You should create a batch of frames for each annotator and supervisor separately. 
    - Annotators should only have frames for their own branch.
    - Supervisors should have frames for the branch of each annotator to review.

Below is a comprehensive list of workflows that relate to project management.

## Permissions

The `project-manager` role is required to manage projects through the web platform.

Those without the `project-manager` role can only view projects, tasks and frames which they are assigned to.

## Workflows

<a id="edit-projects"></a>
#### Edit Projects (`project-manager` only)

Navigate to the Projects page (`Projects`) to add, modify and delete projects via a [data table](#data-table).

You can assign users as project members so that they can access that project even without the `project-manager` role.

### Open Project

Navigate to the Projects page (`Projects`), then right-click a row in the [data table](#data-table) and choose `Open` to access the site of that project.

<a id="edit-tasks"></a>
##### Edit Tasks (`project-manager` only)

Inside the site of a project, navigate to the Tasks page (`Tasks`) to add, modify and delete tasks via a [data table](#data-table).

You have to assign the source group and label group containing the data to be processed under each task.

You can assign project members with the relevant role as annotators (`annotator` role) and/or supervisors (`supervisor` role) so that they can access that task and contribute to it accordingly.

Note that supervisors and annotators are inherited (meaning that a child task will additionally have those of its parent task), but not data groups.

#### Open Task

Inside the site of a project, navigate to the Tasks page (`Tasks`), then right-click a row in the [data table](#data-table) and choose `Open` to access the site of that task.

##### View Recent Frames

Inside the site of a task, navigate to the Recent Frames page (`Recent Frames`) to view the frames that you have recently accessed in the [Annotation Editor](./editor.md), via a [data table](#data-table).

##### View All Frames

Inside the site of a task, navigate to the All Frames page (`All Frames`) to view all frames which are assigned to you via a [data table](#data-table).

<a id="edit-frames"></a>
###### Edit Frames (`project-manager` only)

Inside the site of a task, navigate to the All Frames page (`All Frames`) to add, modify and delete frames assigned to each user via a [data table](#data-table).

Unlike in other data tables, the `New` button in this table provides utility methods to semi-automatically generate a list of frames to create.

Note that you can only manage frames for users who are assigned as annotators and/or supervisors for that task.

### Open Annotation Editor

Annotation tasks can be performed via the [Annotation Editor](./editor.md).

#### From Project

To access the annotation editor under a project, follow these steps:

1. Use [Open Project](#open-project) to access the project sidebar, then open the editor in either Annotate mode (`Annotate`) or Review mode (`Review`) for that project.
2. In the `Project > Task` tab, select the task you would like to work on.
3. In the `Project > Task` tab, select the source group and label branch you would like to work on under the selected task.
4. In the `Project > Scene` tab, select the frame you would like to work on.

#### From Task

To access the annotation editor under a task, follow these steps:

1. Use [Open Task](#open-task) to access the task sidebar, then open the editor in either Annotate mode (`Annotate`) or Review mode (`Review`) for that task.
2. In the `Project > Task` tab, select the source group and label branch you would like to work on under the selected task.
3. In the `Project > Scene` tab, select the frame you would like to work on.

#### From Frame

To access the annotation editor under a frame, follow these steps:

1. Use [View Recent Frames](#view-recent-frames) or [View All Frames](#view-all-frames) to access the list of frames for either Annotate mode (`Annotate`) or Review mode (`Review`).
2. Right-click a row in the [data table](#data-table) and choose `Open` to open the editor for that frame.