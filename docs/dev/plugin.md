# Writing a Plugin

To create a plugin for a data type, you need to consider the following aspects:

1. How to define the data to store in the database?
2. How to process the data in the domain layer?
3. How to access the data in the data manager of the application?
4. How to access the data in the annotation editor of the application?

## 1. Data Definition

In each plugin, you should declare:

- A bundle of source data types, or a bundle of label data types, which the plugin is designed for.
  - Source data: Typically involves a single data type (e.g., point cloud data).
  - Label data: Typically involves a single label element type, and optionally a label entity type. (e.g. box + track for bounding box labels)
- Any number of specification data types related to the source/label data.

### Source Data

Source data refers to the data referenced during the annotation process. It should not be updated by annotators.

Source data (see `SourceDataRecordBase`) includes the following attributes (\* indicates primary key):

- `id`\*: The unique identifier of the data instance.
- `group_id`\*: The group associated with the data instance.
- `st_bounds`: The spatiotemporal boundaries of the data instance.

Usually, source data is stored in read-only files. In this case, we can save storage space by referencing them via metadata instead of copying them into the database.

This metadata (see `SourceMetadataRecordBase`) includes the following attributes in addition to those common to source data:

- `uri`\*: A reference to the file containing the data instance.

Building on this, `SourceTransformMetadataRecordBase` provides a way to transform the local coordinates in a file into world space by including the following attributes:

- `transform`: The transformation matrix used to transform each coordinate in the file into the coordinate system of the database. Note that the spatiotemporal boundaries should be updated along with the transformation matrix to maintain their consistency.

As indicated by the composite primary key, the same data file can be associated with multiple groups; each such association creates a separate instance of metadata.

### Label Data

Label data refers to the data created during the annotation process. To keep track of the annotation history, we maintain snapshots of label data, which are created whenever a user performs an atomic operation. This process is similar to using a Git repository to manage the history of a codebase.

Label data (see `LabelRecordBase`) includes the following attributes (\* indicates primary key):

- `id`\*: The unique identifier of the data instance.
- `commit_hash`\*: The commit of the snapshot.
- `group_id`\*: The group associated with the data instance.

As indicated by the composite primary key, within a particular group, we maintain multiple snapshots for the same data instance. To save storage space, we allow `id`s to be reused between groups; such `id`s have no relation between each other, unlike the case for source data `uri`s.

We categorize label data by their compositional nature: entity (parent) and element (child).

Label entities (see `LabelEntityRecordBase`) do not exist in space and time by themselves. Rather, they are semantically defined by their constituent elements.

Label elements (see `LabelElementRecordBase`) represent concrete observations. They have the following attributes in addition to those common to label data:

- `st_bounds`: The spatiotemporal boundaries of the data instance.
- `entity_id`: The label entity acting as its parent.

### Data Specification

Source and label data can additionally be modified by specifications. Unlike file metadata, which specifies data at the instance level, specification data is applied at the group level; this means that the same specification is applied to every group that uses that specification.

Specifications for source data is referred to as *source specifications* (see `SourceSpecRecordBase`); the same for label data is referred to as *label specifications* (see `LabelSpecRecordBase`). For each specification table, you should also create a corresponding proxy table to associate it with the source/label group.

Since object classes are very common in label data, we have implemented a abstract base class for object class definitions (see `ObjectClassRecordBase`). To control the number of classes that can be selected in the annotation editor, we also provide an abstract base class for object class selections (see `ObjectClassSelectionBase`) so that users can only see those classes in a given label group.

Note that you can define any number of specification types for each type of source/label data; how they apply to the that data is up to you.

## 2. Data Access

### Domain Models

Each domain object should correspond to a [SQLAlchemy ORM class](https://docs.sqlalchemy.org/orm/). The abstract base ORM classes described in the previous section also have base classes for their corresponding domain objects. For example, the ORM class `SourceSpecRecordBase` corresponds to the domain class `SourceSpecStateBase`. This parallel hierarchy also exists for the other modules in the domain layer.

You should set up each field such that no data error can be thrown by the database when [Pydantic](https://docs.pydantic.dev/) successfully validates the corresponding domain object. This means that Pydantic should have equal or stricter data validation than that of the database. Nevertheless, unique and foreign key constraints should remain handled by the database.

### Data Mappers

You should define the parameters of each CRUD operation in a `Params` class, with inner classes for each operation. These are contained in `**/domain/repository/**/interface.py`. For clarity, the parameters should correspond to attributes in the domain object.

Based on the parameters, a mapper (`DatabaseCRUDParamsMapper`) is used to transform the parameters into the actual columns and values to use in the database query. Most attributes should have the same name as the database column to operate on, so they do not need additional processing; however, some attributes that cannot be expressed directly in the query need to be processed in the mapper.

- Example for transforming attributes: `ProjectDatabaseCRUDParamsMapper` (the `config` attribute is converted from a Pydantic model into a serializable dictionary)
- Example for setting a default value: `LabelsetCommitDatabaseCRUDParamsMapper` (the `timestamp` attribute is set to the current date and time if it is not provided)
- Example for composite attributes: `SourceTransformMetadataDatabaseCRUDParamsMapper` (the `st_bounds` attribute is decomposed into individual columns such as `min_x` and `max_timestamp`)
- Example for filter attributes: `SourceMetadataDatabaseCRUDParamsMapper` (the `filter_uri` attribute is converted into a query filter and excluded from being inserted to the database)
- Example for many-to-one relationships: `BranchPermissionDatabaseCRUDParamsMapper` (the `branch` attribute in the domain object is mapped to the `branch_id` columns in the database table)
- Example for one-to-many relationships: `LabelSpecDatabaseCRUDParamsMapper` (the `groups` attribute refers to multiple records, so updates to it cannot be easily done in a single query; instead, it is carried out by the [data repository](#data-repositories))

### Data Repositories

It is usually sufficient to just subclass the base repository for that domain object and implement each abstract method. However, if there are additional one-to-many relationships in the data, you may have to provide extra logic to update it (see `LabelSpecDatabaseRepositoryBase` for an example of updating the `groups` attribute).

### Data Accessors

Similar to [data repositories](#data-repositories), you can just subclass the base data accessor for that domain object. You may add new methods to the subclass if you need to support additional operations for that domain object.

## 3. Data Management

In each plugin, you are recommended to implement the following:

- Data porters for migrating to/from the ST Annotator platform as well as importing/exporting datasets during deployment.
- A user interface for data managers to perform CRUD operations on data.

### Domain Layer

### Data Porter

Each concrete subclass of `Porter` uses a `PorterPipeline` to define the underlying logic of the `port()` method.

- `SourceImporter`: Imports source data instances.
- `SourceExporter`: Exports source data instances.
- `LabelImporter`: Imports label data instances.
- `LabelExporter`: Exports label data instances.
- *[TODO: Set up porters for specification data]*

The `PorterPipeline` itself is abstract. We provide the following partial implementations:

- `SourceImporterBySTPipeline`: Contains the logic for importing source data instances from files, where each file represents a spatiotemporal location.
- `SourceExporterToFileTreePipeline`: Contains the logic for exporting source data instances to files, where each file represents a source metadata instance.
- `LabelImporterBySTPipeline`: Contains the logic for importing label data instances from files, where each file represents a spatiotemporal location.
- `LabelExporterBySourcePipeline`: Contains the logic for exporting label data to files, where each file represents a source data instance.

Once you have fully implemented the `PorterPipeline`, you can instantiate the concrete subclass of `BasePorter` using it. Then, use a subclass of `BasePorterParamsPrompter` to obtain the parameters that are used to invoke the `port()` method.

### User Interface

#### Source Data

Source data are managed under the page `Source Data > Data Storage`.

To add a new tab, you need to prepare a `SourceDataViews` to be passed to `SourceService.data_root_child_views`. This will result in a new tab with a label of `SourceDataViews.title` that links to the root endpoint of `SourceDataViews.bp`.

You can customize the pages under `SourceDataViews.bp` as you wish, except that it should have the same navbar and sidebar as the parent page, in order to facilitate navigation. You may have to write some JavaScript code to customize the displayed tables and forms.

We provide example implementations of such pages:

- `SourceDataItemBrowserViews` creates endpoints for an item browser, where the user selects a source group to view all items that belong to it. They can then create, edit and delete such items.
- `SourceDataFileBrowserViews` creates endpoints for a file browser. By selecting a source group and assigning attributes under it, metadata is created (or updated, if it already exists) for the selected files.

You would most likely need to use `SourceDataWriter` to be able to conduct CRUD operations inside `SourceDataViews`. Rather than initializing a new instance inside the views class, you should make it a parameter of the views constructor so that the writer can be injected as a dependency.

#### Label Data

Label data are managed under the page `Label Data > Data Storage`.

To add a new tab, you need to prepare a `LabelDataViews` to be passed to `LabelService.data_root_child_views`. This will result in a new tab with a label of `LabelDataViews.title` that links to the root endpoint of `LabelDataViews.bp`.

You can customize the pages under `LabelDataViews.bp` as you wish, except that it should have the same navbar and sidebar as the parent page, in order to facilitate navigation. You may have to write some JavaScript code to customize the displayed tables and forms.

We provide example implementations of such pages:

- `LabelDataItemBrowserViews` creates endpoints for an item browser, where the user selects a labelset to view all items that belong to it. They cannot modify such items directly, since that is supposed to be done through the annotation editor.

You would most likely need to use `LabelDataWriter` to be able to conduct CRUD operations inside `LabelDataViews`. Rather than initializing a new instance inside the views class, you should make it a parameter of the views constructor so that the writer can be injected as a dependency.

#### Source Specifications

Source specifications are managed under the page `Source Data > Specifications`. However, users can only assign specification data to data groups under the page `Source Data > Groups`.

To add a new tab, you need to prepare a `SourceSpecViews` to be passed to `SourceService.spec_root_child_views`. This will result in a new tab with a label of `SourceSpecViews.title` that links to the root endpoint of `SourceSpecViews.bp`.

You can customize the pages under `SourceSpecViews.bp` as you wish, except that it should have the same navbar and sidebar as the parent page, in order to facilitate navigation. You may have to write some JavaScript code to customize the displayed tables and forms.

If there are multiple types of specifications, then you might want to nest them inside a parent page. To achieve this, create a `SourceSpecViews` for each page, but only pass the top-most instance to `SourceService.spec_root_child_views`.

You would most likely need to use `SourceSpecWriter` to be able to conduct CRUD operations inside `SourceSpecViews`. Rather than initializing a new instance inside the views class, you should make it a parameter of the views constructor so that the writer can be injected as a dependency.

#### Label Specifications

Label specifications are managed under the page `Label Data > Specifications`. However, users can only assign specification data to data groups under the page `Label Data > Groups` (for label data).

To add a new tab, you need to prepare a `LabelSpecViews` to be passed to `LabelService.spec_root_child_views`. This will result in a new tab with a label of `LabelSpecViews.title` that links to the root endpoint of `LabelSpecViews.bp`.

You can customize the pages under `LabelSpecViews.bp` as you wish, except that it should have the same navbar and sidebar as the parent page, in order to facilitate navigation. You may have to write some JavaScript code to customize the displayed tables and forms.

If there are multiple types of specifications, then you might want to nest them inside a parent page. To achieve this, create a `LabelSpecViews` for each page, but only pass the top-most instance to `LabelService.spec_root_child_views`.

You would most likely need to use `LabelSpecWriter` to be able to conduct CRUD operations inside `LabelSpecViews`. Rather than initializing a new instance inside the views class, you should make it a parameter of the views constructor so that the writer can be injected as a dependency.

## 4. Data Annotation

In each plugin, you are required to implement the following:

- Methods to query the data from the backend and load it in the annotation editor.
- A definition of each operation that can be applied to the data. (Label data only)
- A user interface to interact with the data in the annotation editor.

### Data Loading

#### Python code

##### Data Sender

Define a concrete implementation of `SourceDataSender` (for source data) or `LabelDataSender` (for label data). You need to implement the `get_data_bulk()` method, which is called by the annotation editor to send the data for a collection of `frames` to the client browser.

#### JavaScript code

##### Data Receiver

Define a concrete implementation of `DataReceiver`, which loads the data for a given `frame`.

- `BaseDataReceiver` defines basic functionality of `DataReceiver`.
- `BulkDataReceiver` additionally allows the data to be queried for multiple `frames` at once.

In either case, you need to implement an abstract method to get the data. In this method, you should call `EditorViews.bulkGetSourceData` (for source data) or `EditorViews.bulkGetLabelData` (for label data) to request the data from the backend. This will call the `get_data_bulk()` method in Python (described above).

##### Data Lookup

Define a concrete implementation of `DataLookup`, which builds on top of `DataReceiver` by caching the loaded data so that the data does not have to be fetched from the server again when the user returns to the same frame.

- `BaseDataLookup` is meant to be used with `BaseDataReceiver`.
- `BulkDataLookup` is meant to be used with `BulkDataReceiver`.

### Labelset Operations

#### Python code

For each operation, create a `LabelsetOperationDefinition` which includes the following:

- A unique `op_name` to identify the type of operation.
- A `pydantic.BaseModel` (or list or dictionary thereof) to express the `op_params` required by the operation. This is used to parse the JSON data send from the frontend.
- A concrete subclass of `Operation` that accepts `op_name` and `op_params`. Implement its `apply()` method which applies the operation to a blank `commit`. Usually, `apply()` creates a new snapshot of each label that has been updated by the operation; those snapshots are linked to the provided `commit`. The return value of this method can be used in subsequent operations (see [Placeholder Values](#placeholder-values)).

#### JavaScript code

For each operation, define a concrete implementation of `BaseOperation` which includes the following:

- An `opName` that corresponds to the `op_name` in Python (described above).
- A type definition of `opParams` which corresponds to the `op_params` in Python (described above). May contain ([placeholders](#placeholder-values)).
- An `opResult` that corresponds to the return value of `Operation.apply()` in Python. Expressed as a ([placeholder](#placeholder-values)).
- An implementation of `applyLocal()` to update the data in the annotation editor when the operation is applied.
- An implementation of `undoLocal()` to update the data in the annotation editor when the operation is undone.

You can apply an operation by calling `Labelset.apply()` with your operation. This immediately applies the operation client-side. When the user saves their changes, the operation is also applied server-side, which invokes the corresponding `apply()` method in Python (described above).

Note that once an operation has been applied server-side, it can no longer be undone in the annotation editor.

#### Placeholder Values

Considering the following sequence of operations:

1. Create a new label.
2. Edit the newly created label.

At the time when the operation is applied client-side, the operation has not been applied server-side yet. So, there is no ID associated with the new label. How then can we refer to that label in order to edit it?

We can solve this by using placeholder values. Semantically, the signatures of the two operations would be as follows:

1. Create a new label. [`(CreateParams) => Placeholder<ID>`]
2. Edit the newly created label. [`(Placeholder<ID>, EditParams) => void`]

(In the code, the parameters of the operations are contained in `opParams` while the return value is contained in `opResult`.)

When applying the *create* operation, we create a new label object with the unique identifier `Placeholder<ID>`. The *edit* operation can then refer to the label object using this unique identifier.

Once the operations are applied server-side, we collect the return values and resolve the `Placeholder` instances accordingly, so that these values can be displayed to the user.

### User Interface

#### JavaScript code

##### Data Loader

Define a concrete implementation of `DataLoader`, which builds on top of `DataLookup` by adding a layer of indirection between which frame is opened by the user (i.e., the current frame) and which frames need their data to be loaded.

- `UnitDataLoader` is functionally identical to `DataLookup` (one-to-one mapping of frames)
- `WindowDataLoader` additionally loads the data in nearby frames (one-to-many mapping of frames), combining them into a single object. This enables data from other frames to be displayed in the current frame.

##### Data View

Define a concrete implementation of `DataLoader` (`SourceDataView` for source data; `LabelDataView` for label data), which exposes the data from `DataLoader` for the current frame.

For label data, you should also define methods to apply the various [operations](#labelset-operations) to the active data, via the `labelsetView` attribute which exposes the `Labelset` for the current frame.

##### Data Layer

Define a concrete implementation of `DataLayer` (`SourceDataLayer` for source data; `LabelDataLayer` for label data), through which the user can interact with the data that is exposed by `DataView`.

- Customize the layer-specific menus via the `actionsElem`, `toolsElem`, `prefsElem`, `objectTreeElem`, `propsElem`, and `controlsElem` attributes.
- Place `three.js` objects in the scene via the `objects` attribute.
- Customize the 2D overlay via the `overlayElem` attribute.
- Programmatically navigate the scene and labelset repository via the `context` attribute.
- Set up event handlers for 3D pointer interaction via the `WindowPointer` class; windows can be accessed through the `context.display` attribute.
- Set up keybinds via the `keydownHandler` and `keyupHandler` attributes.

You should refresh the `three.js` objects and their associated HTML elements inside the `render()` method, which is called in each animation frame.

## Plugin API

Each plugin package should export the following:

- Python code: The `SourcePluginBuilder` (or `LabelPluginBuilder`) which constructs a `SourcePlugin` (or `LabelPlugin`) containing the aforementioned components.
  - You can set up a command-line interface for data porters through the `attach_cli` method.
- JavaScript code: The `DataLayer` associated with the `SourcePlugin` (or `LabelPlugin`).

This enables the plugin to be [registered to the ST Annotator platform](../user/plugin.md).
