# Annotation Editor

Use the annotation editor to create, review, and edit labels for your assigned tasks.

The main menus are:

- `Project`: Manages project navigation and changes to the labelset. It provides a `Task`, `Scene` and `Frame` tab.
- `Controls`: Lists the keyboard shortcuts available to the user under a `General` tab, and the shortcuts of one layer under a `Layer` tab (the layer is chosen with the `Configure Layer:` dropdown).
- `Layers`: Enables the user to select the data type to interact with. It provides a `Source Data` and a `Label Data` tab, each listing its layers in a table of `Layer`, `Enabled` and `Actions` columns.
- `Tools`: Includes settings for interacting with the active layer.
- `Preferences`: Includes settings to customize the general user experience. It provides a `Main Camera` tab plus a `Layer` tab holding the settings of one layer (the layer is chosen with the `Configure Layer:` dropdown).

Drag a menu's header to move it. Click the minus icon in the header to minimize it.

While a frame is loading, a `Loading frame data` overlay reports the progress of the process (e.g. `2 of 3 layers ready`). Once the frame is displayed, a hint bar at the top of the scene describes how to interact with the currently selected layer.

Labels with no timestamp are timeless: bounding boxes, vectors, and segmentation
selections can appear in every frame whose spatial bounds include them. Labels
with a timestamp must also match the frame's time bounds. This lets static maps
remain visible while navigating timestamped point-cloud sweeps.

## Permissions

The annotation editor can only access projects and tasks where at least one frame has been assigned to that user through [Project Management](./project.md).

What you may do with the label branch of a frame follows its access level: `Read` lets you open the branch and look at its labels, while saving changes requires `Write`. See [Branch Access Levels](./data.md#branch-access-levels).

## Workflows

### Project Navigation

The editor opens the project you selected. Use the `Project` menu to choose a task, scene, or frame.

#### Task Navigation

The active task can be set through the `Project > Task` tab; the list of tasks depends on the active project (see above).

To open a task, select a task via the corresponding dropdown. Then, select the source group and label branch for the frames you want to work on under the active task.

#### Scene Navigation

The active scene can be set through the `Project > Scene` tab; the list of frames is filtered by the active task, source group and label branch (see above).

To open a scene, select the corresponding frame in the `Project > Scene > Frames` folder.

##### Path Setup

For easy navigation between frames, first define how to order the list of frames via the `Project > Scene > Path Setup` folder, which sets the ordering with `Sort by axes:` and the sampling with `Stride`. Based on this ordering, you can use the `Step previous frame` (`Z`) and `Step next frame` (`C`) keyboard shortcuts, or the corresponding buttons in the `Project > Scene > Playback` folder, to move to the previous/next frame.

##### Skip Frames

To avoid annotating redundant data, adjust `Stride` in the `Project > Scene > Path Setup` folder to skip the specified number of frames between each example. To hide the frames that are skipped due to this setting, disable the `Show all frames` checkbox in the `Project > Scene > Frames` folder. The number after the ID of the frame (e.g. `#1`) indicates the index of the frame in the current path.

!!! note
    A negative stride reverses the notion of previous/next while keeping the list unchanged.

##### Playback

To conveniently review the annotated examples, you can use the `Play/Pause video` (`Space`) keyboard shortcut or the corresponding button in the `Project > Scene > Playback` folder to play a video of the frames, which repeatedly loads the next frame in the current path.

!!! note
    Lower `FPS` if playback struggles to keep up.

### Managing Changes

#### Labelset History

The `Project > Task > History` folder lists your changes in the current session:

- The blue entry marks your current position in the history.
- Green entries are saved changes.
- Grey entries are undone changes.

Press `Ctrl+Z` to undo a change or `Ctrl+Y` to redo it. Click a history entry to return to that point.

!!! note
    Reloading the page discards unsaved changes.

#### Save Changes

Press `Ctrl+S` or click `Save Changes` below the `History` folder in `Project > Task` to save your changes up to the current history entry.

!!! note
    Saved changes can no longer be undone through the annotation editor.

#### Complete Frame

After finishing your task for a frame, you can mark that frame as completed either without a keyboard by selecting `Complete` in the `Frame Status` control of the `Project > Frame` tab, or with the `Cycle frame status; step previous frame` (`Shift+Z`) and `Cycle frame status; step next frame` (`Shift+C`) keyboard shortcuts, which also move to the previous/next frame. Doing so will update the progress that is displayed in the `Project > Task` tab.

### 3D Navigation

#### Main Camera

You can view the scene in 2D (top-down only) or 3D (any angle). Both cameras use orbital controls, which involve the following operations:
- Left click to orbit.
- Right click to pan.
- Scroll wheel to zoom.

You can switch between 2D and 3D mode via the `Cycle view mode` (`X`) keyboard shortcut or the corresponding button in the `Preferences > Main Camera` tab.

To force the camera to orbit about a point that exists in the point cloud (instead of empty space), you can toggle the `Orbit Point` checkbox in the `Preferences > Main Camera` tab, either by clicking it or by using the `Toggle orbit point` (`O`) keyboard shortcut.

#### Minimap

The minimap displays a top-down view of the active scene, and is initially located behind the `Project` menu. You can left-click and drag the interior or borders of the minimap to move and resize it, respectively.

The position of the 2D camera is marked in red. The position of the 3D camera is marked in yellow (when active) or grey (when inactive). You can right-click and drag on the minimap to move both cameras horizontally in sync.

### Layer Management

Each layer in the annotation editor enables user interaction with a particular type of source or label data. You can manage layers through the `Layers` menu, which separates them into a `Source Data` tab and a `Label Data` tab. Each tab lists its layers in a table with an `Enabled` checkbox and an `Actions` column.

#### Toggle Layer

Data is only displayed for enabled layers. There is no limit to the number of enabled layers at any given time.

You can enable/disable a layer by toggling the `Enabled` checkbox. The button below the table enables (`Enable All`) or disables (`Disable All`) every layer of the current tab at once.

#### Select Layer

Select a layer to use its tools. Only one layer can be selected at a time. Disabling the selected layer also deselects it.

You can select a layer by clicking on its name in the list of layers.

#### Layer Actions

Each layer may further define `Actions` which represent common operations to be performed on that layer. They are only available when the layer is selected.

### Plugins

#### Point Cloud

The `Point Cloud` layer displays the scene's point clouds.

The layer shows point clouds for the current frame. You can inspect them but cannot edit them here.

<a id="pcd-preferences"></a>
##### Preferences

The following settings can be adjusted via the `Preferences` menu:

- `RemoveBG`: Applies the project's background-removal settings. Toggle it with `J` (`Toggle RemoveBG`).
- `CropArea`: Limits the displayed points to the project's configured crop areas. Toggle it with `K` (`Toggle CropArea`).
- `Point Size`: Adjusts the point size to avoid visual clutter when the point cloud is too dense.
- `Blender Type`: Chooses how points are colored. The available settings depend on the selected type:
    - `ApplyColormap`: Sets the display color by applying a colormap on the values along a single channel. Its sub-controls are `Colormap` (the colormap to apply), `Channel` (the channel to read), and `Use Z-Score` (which switches the two range inputs between `Min. Z-Score`/`Max. Z-Score` and `Min. Value`/`Max. Value`).
    - `ComposeRGB`: Sets the display color using the values along three channels. Its `Red`, `Green` and `Blue` tabs each provide the channel and range controls described above for one color component.

#### Ground Mesh

The `Ground Mesh` layer displays the scene's triangle meshes.

The layer shows meshes for the current frame. You can inspect them but cannot edit them here.

<a id="gmesh-preferences"></a>
##### Preferences

The following settings can be adjusted via the `Preferences` menu:

- `Show Wireframe`: Toggles whether meshes are displayed with solid faces, to avoid visual clutter when a [point cloud](#point-cloud) is also available in the current frame.
- `Opacity`: Adjusts the opacity of meshes to avoid visual clutter.
- `Blender Type`: Chooses how the mesh is colored. The available settings depend on the selected type:
    - `ApplyColormap`: Sets the display color by applying a colormap on the values along a single channel. Its sub-controls are `Colormap` (the colormap to apply), `Channel` (the channel to read), and `Use Z-Score` (which switches the two range inputs between `Min. Z-Score`/`Max. Z-Score` and `Min. Value`/`Max. Value`).
    - `ComposeRGB`: Sets the display color using the values along three channels. Its `Red`, `Green` and `Blue` tabs each provide the channel and range controls described above for one color component.

#### Bounding Box Labels

Use the `Bounding Box` layer to draw and edit boxes and their associated object tracks.

The layer shows labels for the current frame and nearby frames within the [time-path range](#bbox-preferences). Select it to use these [actions](#layer-actions):

- [(D)raw](#bbox-draw) a new bounding box.
- [(S)elect](#bbox-select) an existing bounding box and [editing](#bbox-edit) it.

<a id="bbox-draw"></a>
##### Draw Mode

The draw mode is activated by pressing `D` or clicking on the corresponding [action](#layer-actions). While in draw mode, you can create a new bounding box via these methods:

- Left-click and drag on empty space: All properties follow those in the `Bounding Box` menu, except for the following:
    - The pose of the new box is determined by the setting in `Tools > Draw > Draw Origin`, which you can switch between with the `Cycle draw origin` (`F`) keyboard shortcut:
        - `Corner` (corner-to-corner): The box is horizontally bounded by the start and end points of the click-and-drag interaction. Usually used for cuboid boxes.
        - `Center` (center-to-front): The center of the box is located at the start point, with its front touching the end point of the click-and-drag interaction. Usually used for cylindrical boxes.
    - The object track associated with the new box depends on the `Object Track` menu:
        - If an object track is selected in the `Object Track` menu, the new bounding box is assigned to that object track.
        - Otherwise, a new object track is created according to the properties in the `Object Track` menu before being assigned to the bounding box.
        - You can also create object tracks manually by clicking on the `+` button in the `Object Track` menu.
    - For convenience, you can use the keyboard shortcut (`Finish draw box`, `G`) to set the size of the new box to the default value defined for its perceived class (if not provided, then the ground truth class of its associated object track). Dimensions without a class default retain their current drawn value, and the box is still created.
- Left-click and drag on existing bounding box: All properties are copied from the referenced bounding box, except for the following:
    - The position of the new box is set to the end point of the click-and-drag interaction.
    - The heading of the new box follows the line joining the start and end points of the click-and-drag interaction, arranged in chronological order.

In both cases, the timestamp of the new box is set to that of the current frame.

You can abandon the box being drawn with the `Cancel draw box` (`Esc`) keyboard shortcut.

After drawing a bounding box, you are automatically sent into [edit mode](#bbox-edit) which enables you to further edit it.

<a id="bbox-select"></a>
##### Select Mode

The select mode is activated by pressing `S` or clicking on the corresponding [action](#layer-actions). While in select mode, you can select an existing bounding box by left-clicking it in the scene. You can leave select mode without selecting a bounding box with the `Cancel select box` (`Esc`) keyboard shortcut.

After selecting a bounding box, you are automatically sent into [edit mode](#bbox-edit) which enables you to further edit it.

<a id="bbox-edit"></a>
##### Edit Mode

The edit mode is automatically activated when you select a bounding box (through [select mode](#bbox-select) or directly via the `Bounding Box` menu). Upon entering this mode, the selected bounding box in the `Bounding Box` menu is updated accordingly, and the selected object track in the `Object Track` menu is updated to its associated object track. While in edit mode, you can directly update the properties of the selected bounding box and object track via their corresponding menus.

Use **Hide in scene** in the `Bounding Box` menu or press `H` while editing a selected box to temporarily make a box's faces transparent and its edges dashed. Hidden boxes have no tooltip and their center and visible edges respond to hover and selection. Select the center or an edge (or choose the box in the menu) and clear the checkbox to unhide it. Boxes stay hidden as you move between frames during the current session. Hiding a box does not change its saved annotation.

Also, a transform widget appears on the selected bounding box which can be manipulated to modify its pose based on the [camera mode](#main-camera):

- In 2D mode, you can adjust the pose along the horizontal plane.
- In 3D mode, you can adjust the pose along the vertical plane.

The individual components of the widget can be toggled on/off in `Tools > Transform > Modes`, or with the `Toggle translate gizmo` (`W`), `Toggle rotate gizmo` (`E`) and `Toggle scale gizmo` (`R`) keyboard shortcuts. While dragging the widget, holding `Shift` constrains the transformation (`Enable gizmo constraints`); releasing it removes the constraint (`Disable gizmo constraints`). You can also turn the heading of the selected bounding box by a quarter turn with the `Rotate box heading` (`Alt`) keyboard shortcut.

To discard the selected bounding box, use the `Delete box` (`Delete`) keyboard shortcut. To leave edit mode without selecting another bounding box, use the `Cancel edit box` (`Esc`) keyboard shortcut.

<a id="bbox-clipboard"></a>
##### Clipboard

While in [edit mode](#bbox-edit), you can use the `Copy box` (`Ctrl+C`) keyboard shortcut or click on the corresponding button in `Tools > Clipboard` to copy the data of the selected bounding box to the clipboard.

When not in [draw mode](#bbox-draw) or [select mode](#bbox-select), you can use the `Paste box` (`Ctrl+V`) keyboard shortcut or click on the corresponding button in `Tools > Clipboard` to create a new bounding box with the same data (except for timestamp, which is always set to that of the current frame).

!!! note
    Use the clipboard to reuse a box from a distant frame. For a nearby box, you can also copy it by dragging from it in [draw mode](#bbox-draw).

<a id="bbox-preferences"></a>
##### Preferences

The following settings can be adjusted via the `Preferences` menu:

- `Time-path Range`: Adjusts the number of frames from the current one in the time-sorted frame path for which to load bounding boxes and object tracks, facilitating access to labels in nearby timestamps.
- `Maintain elevation relative to ground mesh`: If a [ground mesh](#ground-mesh) is available in the current frame and this option is enabled, the elevation of bounding boxes are preserved when translating them horizontally. This is particularly useful in situations where the ground level is not constant.
- `Show perceived class`: Toggles whether the perceived (tied to bounding box) or ground truth (tied to object track) class is displayed for each bounding box.
- `Show tooltips`: Toggles whether tooltips are displayed for each bounding box. You can also toggle it with the `Toggle box tooltips` (`T`) keyboard shortcut.
- `Show Occlusion`: Toggles whether the occlusion level is displayed in each tooltip.
- `Show Distinctiveness`: Toggles whether the distinctiveness level is displayed in each tooltip.
- `Show Timestamp Diff.`: Toggles whether each tooltip shows the time difference from the current frame.
- `Show Track & Box IDs`: Toggles whether the label ID is displayed in each tooltip.
- `Transparent Faces`: Toggles whether bounding boxes are displayed with solid faces, to prevent them from occluding each other. You can also toggle it with the `Toggle box transparency` (`Q`) keyboard shortcut.
- `Face opacity`: Adjusts the opacity of bounding boxes to prevent them from occluding each other.
- `Hover color`: Controls the display color of bounding boxes when hovered over.
- `Select color`: Controls the display color of bounding boxes when selected.

#### Vector Labels

Use the `Vector` layer to draw and edit polylines, polygons, and single points.

The layer shows vector labels for the current frame. Select it to use these [actions](#layer-actions):

- [(D)raw](#vector-draw) a new vector object.
- [(S)elect](#vector-select) an existing vector object and [editing](#vector-edit) it.

<a id="vector-draw"></a>
##### Draw Mode

The draw mode is activated by pressing `D` or clicking on the corresponding [action](#layer-actions). While in draw mode, you can create any type of vector labels by selecting the label type from the setting `Tools > Draw` widgets or the keyboard shortcuts below:

- `Polygon`: Selected by default; activated by pressing `K` (`Draw polygon`). Click to place vertices, then double-click or press `G` to finish.
- `Line`: Activated by pressing `L` (`Draw line`). Click to place vertices, then double-click or press `G` to finish.
- `Point`: Activated by pressing `P` (`Draw point`), the position of a point vertex is determined once the mouse left click is released and the draw is finished automatically.

At any point you can abandon the vector being drawn with the `cancel draw vector` (`Esc`) keyboard shortcut.

After selecting a vector object, you are automatically sent into [edit mode](#vector-edit) which enables you to further edit it.

<a id="vector-select"></a>
##### Select Mode

The select mode is activated by pressing `S` or clicking on the corresponding [action](#layer-actions). While in select mode, you can select an existing vector object by left-clicking it in the scene.

After selecting a vector object, you are automatically sent into [edit mode](#vector-edit) which enables you to further edit it.

<a id="vector-edit"></a>
##### Edit Mode

The edit mode is activated after selecting or drawing a vector object, you can modify the vertices by translating the vertex/vertices of vector objects only in [2D mode](#main-camera).

Use **Hide in scene** in the vector inspector or press `H` while editing a selected vector to hide its geometry and tooltip. A clickable centroid marker remains visible for points, polylines, and polygons. Select the marker and press `H`, or clear **Hide in scene** in the inspector, to show the vector again.

The vertices of polygon and polyline can be modified in two ways as below:

- In 2D mode, translate each individual vertex at a time.
- In 2D mode, translate all the vertices at the same time by dragging the translucent plane or its centroid point. The plane highlights when hovered.

The above modes of translations can be toggled with the `Translation Modes` control (`Vertex` / `Vertices`) in the `Tools > Transform` folder, or with the `Toggle translate single vertex` (`W`) and `Toggle translate all vertices` (`E`) keyboard shortcuts.

To discard the selected vector object, use the `Delete vector` (`Delete`) keyboard shortcut. To leave edit mode without selecting another vector object, use the `Cancel edit vector` (`Esc`) keyboard shortcut.

<a id="vector-clipboard"></a>
##### Clipboard

While in [edit mode](#vector-edit), you can use the `Copy vector` (`Ctrl+C`) keyboard shortcut or click on the corresponding button in `Tools > Clipboard` to copy the data of the selected vector object to the clipboard.

When not in [draw mode](#vector-draw) or [select mode](#vector-select), you can use the `Paste vector` (`Ctrl+V`) keyboard shortcut or click on the corresponding button in `Tools > Clipboard` to create a new vector object with the same data (except for timestamp, which is always set to that of the current frame).

<a id="vector-preferences"></a>
##### Preferences

The following settings can be adjusted via the `Preferences` menu:

- `Show tooltips`: Toggles tooltips at each vector object's centroid marker. You can also toggle it with the `Toggle vector tooltips` (`T`) keyboard shortcut.
- `Show Vector ID`: Toggles whether the ID of the vector object is displayed in each tooltip.
- `stroke width`: Controls the width size of vector objects in draw mode.
- `Stroke color`: Controls the display color of vector objects in draw mode.
- `Hover color`: Controls the display color of vector objects when hovered over.
- `Select color`: Controls the display color of vector objects when selected.

#### Segmentation Labels

Use the `Segmentation` layer to select groups of points and edit their associated object instances.

The layer shows labels for the current frame and nearby frames within the [time-path range](#segmentation-preferences). Select it to use these [actions](#layer-actions):

- [(D)raw](#selection-draw) a new points selection.
- [(S)elect](#selection-select) an existing point selection and [editing](#selection-edit) it.

<a id="selection-draw"></a>
##### Draw Mode

The draw mode is activated by pressing `D` or clicking on the corresponding [action](#layer-actions). While in draw mode, you can create point selections via different methods by selecting corresponding method from the setting `Tools > Draw` widgets or the keyboard shortcuts as below:

- `box`: Activated by pressing `R` (`Query with Rectangle`) and start drawing a rectangle box by left-click and dragging the mouse in the desired direction after the mouse is released the points inside the drawn rectangle box, would create a selection.
- `lasso`: Activated by pressing `L` (`Query with Lasso`) and start drawing any kind of shapes as you would with a pen, by left-click and dragging the mouse in any direction, after the mouse is released hte points inside the drawn shape, would create a selection.
- `polygon`: Activated by pressing `P` (`Query with Polygon`), the position of each vertex of polygon is
determined by the mouse left click on the scene and to finish drawing press `g` (`finish create selection`) in after which the points inside the polygon would create a selection.
- `brush`: Activate by pressing `B` (`Query with Brush`), and start painting the desired area for segmentation as a result the points inside the diameter of brush would create a selection.

At any point you can abandon the object being drawn with the `cancel create/edit selection` (`Esc`) keyboard shortcut.

After drawing a selection, you are automatically sent into [edit mode](#selection-edit) which enables you to further edit it.

!!! note
    The `Draw` action remains active while editing. Check the selection inspector to see which selection you are modifying.

<a id="selection-select"></a>
##### Select Mode

The select mode is activated by pressing `S` or clicking on the corresponding [action](#layer-actions). While in select mode, you can select an existing point selection by left-clicking it in the scene.

After selecting a point selection, you are automatically sent into [edit mode](#selection-edit) which enables you to further edit it.

<a id="selection-edit"></a>
##### Edit Mode

The edit mode is activated after selecting or drawing a point selection, you can modify points of a selection by adding more points or removing some points from a selection, to do so, you can follow the same steps in [draw mode](#selection-draw) section, with a small difference that the mode of the modification is set by the `Edit Mode` control in the `Tools > Modify` folder, which offers the `Add` and `Erase` options. To add points to a selection, select `Add`; to remove points from a selection, select `Erase`.

Use **Hide in scene** in the selection inspector or press `H` while editing a selected point selection to hide its points and tooltip. A clickable centroid marker remains visible. Select the marker and press `H`, or clear **Hide in scene** in the inspector, to show the points again.

To discard the selected point selection, use the `Delete selection` (`Delete`) keyboard shortcut.

<a id="selection-assistant"></a>
##### Assistant

Instead of querying the points inside a drawn object, the segmentation layer can ask a labeling assistant to predict which points belong to the object you are working on. To use it, enable the `Use Assistant` checkbox in the settings of the `Segmentation` layer.

Once enabled, the [draw mode](#selection-draw) queries no longer create a selection from the points inside a drawn object. Instead, each click on the point cloud adds a point prompt at the clicked location, and the assistant predicts the selection from the prompts gathered so far. A left click prompts with a foreground point and a right click with a background point; when `Prompt Mode` is set to `Background`, every click prompts in the background. The prompts are configured by the `Tools > Assistant` folder:

- `Prompt Mode`: Sets whether each prompt marks a point that belongs to the selection (`Foreground`) or a point that must be excluded from it (`Background`).
- `Number of Prompts`: Sets how many prompts are gathered before a new selection is created.
- `Mask Threshold`: Sets the cutoff applied to the assistant's prediction when deciding which points join the selection.

While editing an existing selection, prompts in `Foreground` mode add points to it and prompts in `Background` mode remove points from it.

!!! note
    Ask your administrator to enable a labeling assistant if it is unavailable.

<a id="segmentation-preferences"></a>
##### Preferences

The following settings can be adjusted via the `Preferences` menu:

- `Use Assistant`: Enable the [labeling assistant](#selection-assistant) to predict selections from foreground and background points when an assistant is available.
- `Time-path Range`: Adjusts the number of frames from the current one in the time-sorted frame path for which to load selection points and object instances, facilitating access to labels in nearby timestamps.
- `Show tooltips`: Toggles tooltips at each point selection's centroid marker. You can also toggle it with the `Toggle selection tooltips` (`T`) keyboard shortcut.
- `Show Occlusion`: Toggles whether the occlusion level is displayed in each tooltip.
- `Show Distinctiveness`: Toggles whether the distinctiveness level is displayed in each tooltip.
- `Show Timestamp Diff.`: Toggles whether each tooltip shows the time difference from the current frame.
- `Show Track & Segment IDs`: Toggles whether the label ID is displayed in each tooltip.
- `Show perceived class`: Toggles whether the perceived (tied to point selection) or ground truth (tied to object instance) class is displayed for each point selection.
- `Transparent Points`: Blends selection points with the point cloud so its colors remain visible. Toggle it with `Toggle selection transparency` (`Q`).
- `Point opacity`: Sets the opacity of selection points from 0 (invisible) to 1 (opaque) when `Transparent Points` is enabled.
- `Brush Diameter`: Controls the diameter of the brush used to query points for a selection.
- `Brush Hue`: Controls how strongly the area painted by the brush is highlighted, with a minimum strength of 0.1.
- `Stroke color`: Controls the display color of drawn objects/shapes to query points for a selection.
- `Hover color`: Controls the display color of point selections when hovered over.
- `Select color`: Controls the display color of point selections when selected.

## Relations

Use the `Relations` layer to describe how two labels are related, such as
"supports", "beside", or "behind". An arrow points from the source label to
the target label. For vector and segmentation labels, the arrow connects their
centroid markers.

Select the `Relations` layer to use these [actions](#layer-actions):

- [(D)raw](#relation-draw) a relation between two labels.
- [(S)elect](#relation-select) an existing relation to inspect or edit it.

<a id="relation-draw"></a>
### Draw Mode

Press `D` or click **D** in the Layers menu to enter Draw mode. Choose a relation
class in the inspector, then click the source label followed by the target label.
The two labels can be different types. After selecting the source, it no longer
intercepts pointer hits, so you can choose a target behind it. Yellow highlights
show the source and the target you are pointing at.

Completing the relation selects it and leaves Draw mode. Press `Escape` to cancel
before choosing both labels. Both labels must be visible in the current branch;
a relation cannot connect to another relation. The **D** button beside the
inspector's search field also toggles Draw mode.

<a id="relation-select"></a>
### Select Mode

Press `S` or click **S** in the Layers menu to enter Select mode, then click a
relation to select it and leave Select mode. Hovering highlights the relation and
its two labels. Press `Escape` to leave Select mode without choosing a relation.

You can also select a relation by typing part of its ID in the inspector's search
field and choosing a result.

### Review Relations

Press `Tab` with the Relations layer active to review relations one at a time.
The current relation and its two labels remain visible while other labels are
hidden. Press `Tab` again to move to the next group; after the last group, it
returns to the first.

You can also enable **Isolate current relation** in the `Tools` menu to focus on
the selected relation. The **Relations** list shows the review order and
highlights the selected group. Click a row to jump to that group. Groups whose
labels are outside the current view are omitted, but groups hidden with
**Hide in scene** remain available.

Clear **Isolate current relation** or press `Escape` to restore the normal view.
Changing tools or layers, or moving to another frame, also ends the review.
Each label returns to its previous visibility. Reviewing does not change your
annotations.

To hide a selected relation, press `H` or enable **Hide in scene** in its inspector.
This hides the line, arrowheads, and tooltip. Choose the relation in the inspector
and press `H` again, or clear the checkbox, to show it.

### Read Grouped Relations

Several relations between the same two labels share one line. Arrowheads at both
ends indicate relations in both directions. Tooltips group names by direction,
for example **(in front of / beside) / (behind)**. Repeated categories show a count,
such as **beside [x3]**. Counts are separate for each direction. Relation lists
show the same grouping and counts without colors.

Press `T` to show or hide tooltips. Category names use their class colors; the
parentheses and separators stay white.

### Edit Relations

Select a group, then use **Direction** to choose which direction to edit. Each
option shows the source and target object classes and the number of relations in
that direction. Labels without a class appear as **(Unclassified)**.

The inspector's **Relations** folder lists the entries for that direction, each
with its own ID and class. Click an entry to make it the current relation:

- Change its class using the class selector.
- Click **Add relation** to add another relation for the same pair and direction
  using the current class. Change the new entry's class if needed.
- Press `Delete` to remove only the current entry. Another entry is selected if
  any remain.

Use the **Source** and **Target** folders to inspect or replace the connected
labels. Each folder shows the label's ID and object class. To replace a label,
choose its type and search by ID or object class, then choose a result. You can
also click **Replace source** or **Replace target** and pick a label in the scene.
Only labels visible in the current branch are offered, and you cannot choose
the same label for both ends. Replacement affects only the chosen direction.

Arrows follow their labels when you move them. Deleting a label also deletes its
relations, including those outside the current frame. Undo restores them together.
Use **Save Changes** to keep your edits.

### Preferences

Under **Preferences > Layer > Relations**:

- **Hover color** sets the highlight color when pointing at a relation (red by default).
- **Select color** sets the highlight color for the selected relation (blue by default).
- **Line thickness** adjusts the line and arrowhead size (2 pixels by default).
- **Show tooltips** displays category names beside relation lines. Tooltips are off
  by default; press `T` to toggle them for the active Relations layer.

A data manager can choose relation classes and their colors under
**Label Specifications**. Relation classes are separate from object classes.
If all categories have the default white color, tooltips use distinct colors
automatically. To choose specific colors, update the relation classes under
**Label Specifications**. Existing relations can still display retired classes.
