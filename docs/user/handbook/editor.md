
## Annotation Editor

The annotation editor is used to perform annotation tasks.

The interface has various menus that facilitate the user experience. Here is a list of common menus:

- `Project`: Manages project navigation and changes to the labelset.
- `Controls`: Lists the keyboard shortcuts available to the user.
- `Layers`: Enables the user to select the data type to interact with.
- `Tools`: Includes settings for interacting with the active layer.
- `Preferences`: Includes settings to customize the general user experience.

To avoid clutter, you can reposition each menu (by click and dragging the header bar) and even minimize them (by clicking on the minus icon on the header bar).

Below is a comprehensive list of workflows that can be performed in the annotation editor.

## Permissions

The annotation editor can only access projects and tasks where at least one frame has been assigned to that user through [Project Management](./project.md).

## Workflows

### Project Navigation

The project to open is determined by the URL used to open the annotation interface. Further navigation can be conducted through the `Project` menu, as explained below.

#### Task Navigation

The active task can be set through the `Project > Task` tab; the list of tasks depends on the active project (see above).

To open a task, select a task via the corresponding dropdown. Then, select the source group and label branch to work on under the active task.

#### Scene Navigation

The active scene can be set through the `Project > Scene` tab; the list of frames depends on the active task, source group and label branch (see above).

To open a scene, select the corresponding frame in the `Project > Scene > Frames` folder.

##### Path Setup

For easy navigation between frames, first define how to order the list of frames via the `Project > Scene > Path Setup` folder. Based on this ordering, you can use keyboard shortcuts or the `Project > Scene > Playback` folder to move to the previous/next frame.

##### Skip Frames

To avoid annotating redundant data, adjust `Stride` in the path setup to skip the specified number of frames between each example. To hide the frames that are skipped due to this setting, disable the `Show all frames` checkbox. The number after the ID of the frame (e.g. `#1`) indicates the index of the frame in the current path.

*Note: A negative stride reverses the notion of previous/next while keeping the list unchanged.*

##### Playback

To conveniently review the annotated examples, you can use keyboard shortcuts or the corresponding button in the `Project > Scene > Playback` folder to play a video of the frames, which repeatedly loads the next frame in the current path.

*Note: Adjusting the `FPS` to a smaller value can help load the data more consistently as fewer concurrent requests are sent to the backend.*

### Managing Changes

#### Labelset History

The `Project > Task > History` folder displays a history of each operation made to the active labelset in the current session:

- The blue entry represents the current operation; the active state of the labelset refers to the state immediately after applying that operation.
- Green entries represent saved operations.
- Grey entries represent undone operations.

You can use keyboard shortcuts to undo/redo operations. Clicking on an item in the history sets the current operation to the corresponding one.

*Note: Unless saved, operations only persist for the current session and will be discarded if you reload the page.*

#### Save Changes

You can use a keyboard shortcut or the corresponding button in the `Project > Task > History` folder to save each operation up to the current one. Doing so applies the changes to the remote server.

*Note: Once saved, operations can no longer be undone through the annotation editor.*

#### Complete Frame

After finishing your task for a frame, you can use a keyboard shortcut (`Cycle frame status`) or the corresponding button in the `Project > Frame` tab to mark that frame as completed. Doing so will update the progress that is displayed in the `Project > Task` tab.

### 3D Navigation

#### Main Camera

You can view the scene in 2D (top-down only) or 3D (any angle). Both cameras use orbital controls, which involve the following operations:
- Left click to orbit.
- Right click to pan.
- Scroll wheel to zoom.

You can switch between 2D and 3D mode via a keyboard shortcut (`Cycle view mode`) or the corresponding button in the `Preferences > Main Camera` tab.

To force the camera to orbit about a point that exists in the point cloud (instead of empty space), you can toggle the `Orbit Point` checkbox in the `Preferences > Main Camera` tab.

#### Minimap

The minimap displays a top-down view of the active scene, and is initially located behind the `Project` menu. You can left-click and drag the interior or borders of the minimap to move and resize it, respectively.

The position of the 2D camera is marked in red. The position of the 3D camera is marked in yellow (when active) or grey (when inactive). You can right-click and drag on the minimap to move both cameras horizontally in sync.

### Layer Management

Each layer in the annotation editor enables user interaction with a particular type of source or label data. You can manage layers through the `Layers` menu.

#### Toggle Layer

Data is only displayed for enabled layers. There is no limit to the number of enabled layers at any given time.

You can enable/disable a layer by toggling the `Enabled` checkbox.

#### Select Layer

User can only interact with selected layers. Only one layer can be selected at any given time. Also, a disabled layer is automatically deselected.

You can select a layer by clicking on its name in the list of layers.

#### Layer Actions

Each layer may further define `Actions` which represent common operations to be performed on that layer. They are only available when the layer is selected.

### Plugins

#### Point Cloud

The point cloud plugin adds the `Point Cloud` source data layer which displays point clouds in the annotation editor.

Upon navigating to a scene, any point clouds that occur in the corresponding frame are loaded. They cannot be modified in the annotation editor.

<a id="pcd-preferences"></a>
##### Preferences

The following settings can be adjusted via the `Preferences` menu:

- Data Loading:
    - `RemoveBG`: Toggles whether `remove-bg` preprocessors are applied.
    - `CropArea`: Toggles whether `crop-box` and `crop-polygon` preprocessors are applied.
- Visualization:
    - `Point Size`: Adjusts the point size to avoid visual clutter when the point cloud is too dense.
    - `Blender`: Controls the display color associated with each point.
        - `ApplyColormap`: Sets the display color by applying a colormap on the values along a single channel.
        - `ComposeRGB`: Sets the display color using the values along three channels.

#### Ground Mesh

The ground mesh plugin adds the `Ground Mesh` source data layer which displays triangle meshes in the annotation editor.

Upon navigating to a scene, any meshes that occur in the corresponding frame are loaded. They cannot be modified in the annotation editor.

<a id="gmesh-preferences"></a>
##### Preferences

The following settings can be adjusted via the `Preferences` menu:

- Visualization:
    - `Show Wireframe`: Toggles whether meshes are displayed with solid faces, to avoid visual clutter when a [point cloud](#point-cloud) is also available in the current frame.
    - `Opacity`: Adjusts the opacity of meshes to avoid visual clutter.
    - `Blender`: Controls the display color associated with each vertex.
        - `ApplyColormap`: Sets the display color by applying a colormap on the values along a single channel.
        - `ComposeRGB`: Sets the display color using the values along three channels.

#### Bounding Box Labels

The bounding box labels plugin adds the `Bounding Box` label data layer which enables the user to edit bounding boxes and associated object tracks in the annotation editor.

Upon navigating to a scene, any labels that occur in the corresponding frame as well as other frames within the [display range](#bbox-preferences) are loaded. While the layer is selected, the collection of labels can be modified via the following [actions](#layer-actions):

- [(D)raw](#bbox-draw) a new bounding box.
- [(S)elect](#bbox-select) an existing bounding box and [editing](#bbox-edit) it.

<a id="bbox-draw"></a>
##### Draw Mode

The draw mode is activated by pressing `D` or clicking on the corresponding [action](#layer-actions). While in draw mode, you can create a new bounding box via these methods:

- Left-click and drag on empty space: All properties follow those in the `Bounding Box` menu, except for the following:
    - The pose of the new box is determined by the setting in `Tools > Draw > Draw Origin`:
        - `Corner` (corner-to-corner): The box is horizontally bounded by the start and end points of the click-and-drag interaction. Usually used for cuboid boxes.
        - `Center` (center-to-front): The center of the box is located at the start point, with its front touching the end point of the click-and-drag interaction. Usually used for cylindrical boxes.
    - The object track associated with the new box depends on the `Object Track` menu:
        - If an object track is selected in the `Object Track` menu, the new bounding box is assigned to that object track.
        - Otherwise, a new object track is created according to the properties in the `Object Track` menu before being assigned to the bounding box.
        - You can also create object tracks manually by clicking on the `+` button in the `Object Track` menu.
    - For convenience, you can use the keyboard shortcut (`Finish draw box`) to set the size of the new box to the default value defined for its perceived class (if not provided, then the ground truth class of its associated object track).
- Left-click and drag on existing bounding box: All properties are copied from the referenced bounding box, except for the following:
    - The position of the new box is set to the end point of the click-and-drag interaction.
    - The heading of the new box follows the line joining the start and end points of the click-and-drag interaction, arranged in chronological order.

In both cases, the timestamp of the new box is set to that of the current frame.

After drawing a bounding box, you are automatically sent into [edit mode](#bbox-edit) which enables you to further edit it.

<a id="bbox-select"></a>
##### Select Mode

The select mode is activated by pressing `S` or clicking on the corresponding [action](#layer-actions). While in select mode, you can select an existing bounding box by left-clicking it in the scene.

After selecting a bounding box, you are automatically sent into [edit mode](#bbox-edit) which enables you to further edit it.

<a id="bbox-edit"></a>
##### Edit Mode

The edit mode is automatically activated when you select a bounding box (through [select mode](#bbox-select) or directly via the `Bounding Box` menu). Upon entering this mode, the selected bounding box in the `Bounding Box` menu is updated accordingly, and the selected object track in the `Object Track` menu is updated to its associated object track. While in edit mode, you can directly update the properties of the selected bounding box and object track via their corresponding menus.

Moreover, a transform widget appears on the selected bounding box which can be manipulated to modify its pose based on the [camera mode](#main-camera):

- In 2D mode, you can adjust the pose along the horizontal plane.
- In 3D mode, you can adjust the pose along the vertical plane.

The individual components of the widget can be toggled on/off in `Tools > Transform > Modes`.

<a id="bbox-clipboard"></a>
##### Clipboard

While in [edit mode](#bbox-edit), you can use a keyboard shortcut (`Copy box`) or click on the corresponding button in `Tools > Clipboard` to copy the data of the selected bounding box to the clipboard.

When not in [draw mode](#bbox-draw) or [select mode](#bbox-select), you can use a keyboard shortcut (`Paste box`) or click on the corresponding button in `Tools > Clipboard` to create a new bounding box with the same data (except for timestamp, which is always set to that of the current frame).

*Note: This is similar in function to left-clicking and dragging a reference box in [draw mode](#bbox-draw). Nevertheless, using the clipboard is preferred when the reference box is located many frames away from the current frame as doing so avoids the need to load the data for each frame in between.*

<a id="bbox-preferences"></a>
##### Preferences

The following settings can be adjusted via the `Preferences` menu:

- Data Loading:
    - `Display Range`: Adjusts the number of frames from the current one for which to load bounding boxes and object tracks, facilitating access to labels in nearby frames.
- Data Editing:
    - `Maintain elevation relative to ground mesh`: If a [ground mesh](#ground-mesh) is available in the current frame and this option is enabled, the elevation of bounding boxes are preserved when translating them horizontally. This is particularly useful in situations where the ground level is not constant.
- Visualization:
    - `Show perceived class`: Toggles whether the perceived (tied to bounding box) or ground truth (tied to object track) class is displayed for each bounding box.
    - `Show tooltips`: Toggles whether tooltips are displayed for each bounding box.
        - `Show Occlusion`: Toggles whether the occlusion level is displayed in each tooltip.
        - `Show Distinctiveness`: Toggles whether the distinctiveness level is displayed in each tooltip.
        - `Show Timestamp Difference`: Toggles whether the timestamp difference is displayed in each tooltip.
        - `Show Track & Box IDs`: Toggles whether the label ID is displayed in each tooltip.
    - `Transparent Faces`: Toggles whether bounding boxes are displayed with solid faces, to prevent them from occluding each other.
    - `Face Opacity`: Adjusts the opacity of bounding boxes to prevent them from occluding each other.
    - `Hover color`: Controls the display color of bounding boxes when hovered over.
    - `Select color`: Controls the display color of bounding boxes when selected.

#### Vector Labels

The vector labels plugin adds the `Vector` label data layer which enables the user to edit polylines, polygons and single points in the annotation editor.

Upon navigating to a scene, any vertices of vector labels are loaded that occur in the corresponding frame's timestamp and boundary coordinate. While the layer is selected, the collection of labels can be modified via the following [actions](#layer-actions):

- [(D)raw](#vector-draw) a new vector object.
- [(S)elect](#vector-select) an existing vector object and [editing](#vector-edit) it.

<a id="vector-draw"></a>
##### Draw Mode

The draw mode is activated by pressing `D` or clicking on the corresponding [action](#layer-actions). While in draw mode, you can create any type of vector labels by selecting the label type from the setting `Tools > Draw` widgets or the keyboard shortcuts below:

- `Polyline`: Activated by pressing `L`, the position of each vertex of polyline is
determined by the mouse left click on the scene and to finish drawing press `G`.
- `Polygon`: Activated by pressing `K`, the position of each vertex of polygon is 
determined by the mouse left click on the scene and to finish drawing press `G`.
- `Point`: Activated by pressing `P`, the position of a point vertex is determined once the mouse left click is released and the draw is finished automatically.

After selecting a vector object, you are automatically sent into [edit mode](#vector-edit) which enables you to further edit it.

<a id="vector-edit"></a>
##### Edit Mode

The edit mode is activated after selecting or drawing a vector object, you can modify the vertices by translating the vertex/vertices of vector objects only in [2D mode](#main-camera).

The vertices of polygon and polyline can be modified in two ways as below:

- In 2D mode, translate each individual vertex at a time.
- In 2D mode, translate all the vertices at the same time via translating a 2D plane helper.

The above mode of translations can be toggled on/off in `Tools > Transform` widgets.

<a id="vector-clipboard"></a>
##### Clipboard

While in [edit mode](#vector-edit), you can use a keyboard shortcut (`Copy box`) or click on the corresponding button in `Tools > Clipboard` to copy the data of the selected vector object to the clipboard.

When not in [draw mode](#vector-draw) or [select mode](#vector-select), you can use a keyboard shortcut (`Paste vector object`) or click on the corresponding button in `Tools > Clipboard` to create a new vector object with the same data (except for timestamp, which is always set to that of the current frame).

<a id="vector-preferences"></a>
##### Preferences

The following settings can be adjusted via the `Preferences` menu:

- Data Editing:
    - `Stroke width`: Controls the width size of vector objects in draw mode.
- Visualization:
    - `Stroke color`: Controls the display color of vector objects in draw mode.
    - `Hover color`: Controls the display color of vector objects when hovered over.
    - `Select color`: Controls the display color of vector objects when selected.

#### Segmentation Labels

The segmentation labels plugin adds the `Segmentation` label data layer which enables the user to edit selection points and associated object instance in the annotation editor.

Upon navigating to a scene, any labels that occur in the corresponding frame as well as other frames within the [display range](#segmentation-preferences) are loaded. While the layer is selected, the collection of labels can be modified via the following [actions](#selection-layer-actions):

- [(D)raw](#selection-draw) a new points selection.
- [(S)elect](#selection-select) an existing point selection and [editing](#selection-edit) it.

<a id="selection-draw"></a>
##### Draw Mode

The draw mode is activated by pressing `D` or clicking on the corresponding [action](#layer-actions). While in draw mode, you can create point selections via different methods by selecting corresponding method from the setting `Tools > Draw` widgets or the keyboard shortcuts as below:

- `Box`: Activated by pressing `O` and start drawing a rectangle box by left-click and dragging the mouse in the desired direction after the mouse is released the points inside the drawn rectangle box, would create a selection. 
- `Lasso`: Activated by pressing `L` and start drawing any kind of shapes as you would with a pen, by left-click and dragging the mouse in any direction, after the mouse is released hte points inside the drawn shape, would create a selection.
- `Polygon`: Activated by pressing `K`, the position of each vertex of polygon is 
determined by the mouse left click on the scene and to finish drawing press `g` in after which the points inside the polygon would create a selection.
- `Painting Brush`: Activate by pressing `B`, and start painting the desired area for segmentation as a result the points inside the diameter of brush would create a selection.

After drawing a selection, you are automatically sent into [edit mode](#selection-edit) which enables you to further edit it.

*Note: In edit mode the selection [action](#layer-actions) is still on draw since a selection is made via drawing objects in the scene to query the points inside drawn object. In order to differentiate whether you are drawing new selection or editing an existing object, simply check the widgets for this data layer.*

<a id="vector-edit"></a>
##### Edit Mode

The edit mode is activated after selecting or drawing a vector object, you can modify points of a selection by adding more points or remove/earsing some points from a selection, to do so, you can follow the same steps in [draw mode](#selection-draw) section, with a small difference that if you wish to remove points from a selection you are required to select the erase option in setting from `Tool > Modify > Erase` widgets and to add points select `Tool > Modify > Add`.

<a id="selection-preferences"></a>
##### Preferences

The following settings can be adjusted via the `Preferences` menu:

- Data Loading:
    - `Display Range`: Adjusts the number of frames from the current one for which to load selection points and object instances, facilitating access to labels in nearby frames.
- Data Editing:
    - `Stroke width`: Controls the width size of drawn objects/shapes to query points for a selection.
- Visualization:
    - `Show perceived class`: Toggles whether the perceived (tied to point selection) or ground truth (tied to object instance) class is displayed for each point selection.
    - `Show tooltips`: Toggles whether tooltips are displayed for each point selection.
        - `Show Occlusion`: Toggles whether the occlusion level is displayed in each tooltip.
        - `Show Distinctiveness`: Toggles whether the distinctiveness level is displayed in each tooltip.
        - `Show Timestamp Difference`: Toggles whether the timestamp difference is displayed in each tooltip.
        - `Show Track & Box IDs`: Toggles whether the label ID is displayed in each tooltip.
    - `Stroke color`: Controls the display color of drawn objects/shapes to query points for a selection.
    - `Hover color`: Controls the display color of point selections when hovered over.
    - `Select color`: Controls the display color of point selections when selected.
