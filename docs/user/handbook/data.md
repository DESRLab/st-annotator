# Data Management

Datasets on the ST Annotator Platform are divided into source data and label data:

- Source data are inputted to the ML model.
- Label data are the expected outputs of the ML model.

In the context of annotation, humans refer to source data to create label data. Before annotation can begin, source data must first be [registered](#source-data) and label data [configured](#label-data) on the platform.

Below is a comprehensive list of workflows that relate to data management.

## Permissions

The `data-manager` role is required to manage source and label data.

## Workflows

### Source Data

To set up source data for a project, follow these steps:

1. Use [Edit Data Groups](#source-data-groups) to create a new group.
2. Use [Edit Data Items](#source-data-items) to select the data to include in the group.
3. Use [Edit Data Specifications](#source-data-specifications) to create the specifications to apply to the data.
4. Use [Edit Data Groups](#source-data-groups) to assign the specifications to the group.

More details are provided below.

<a id="source-data-groups"></a>
##### Edit Data Groups (`data-manager` only)

Navigate to the Source Groups page (`Source Data > Groups`) to add, modify and delete groups via a [data table](#data-table).

<a id="source-data-items"></a>
##### Edit Data Items (`data-manager` only)

Navigate to the Source Data Storage page (`Source Data > Data Storage`) to add, modify and delete data items via a [data table](#data-table).

<a id="source-data-specifications"></a>
##### Edit Data Specifications (`data-manager` only)

Navigate to the Source Specifications page (`Source Data > Specifications`) to add, modify and delete data specifications via a [data table](#data-table).

### Label Data

To set up label data for a project, follow these steps:

1. Use [Edit Data Groups](#label-data-groups) to create a new group.
2. Use [Edit Data Specifications](#label-data-specifications) to create the specifications to apply to the data.
3. Use [Edit Data Groups](#label-data-groups) to assign the specifications to the group.
4. Use [Edit Labelset Branches](#labelset-branches) to create the branch for each annotator and reviewer.
    - To avoid conflicts between users, each annotator should have their own branch, while each supervisor should have access to the branch of each annotator they are planning to review. Moreover, supervisors should avoid editing the dataset at the same time as the annotator they are currently reviewing.

To view the annotated labels from a project, follow these steps:

1. Use [View Data Items](#label-data-items) to view the data at the head commit of each labelset branch.

More details are provided below.

<a id="label-data-groups"></a>
##### Edit Data Groups (`data-manager` only)

Navigate to the Label Groups page (`Label Data > Groups`) to add, modify and delete groups via a [data table](#data-table).

<a id="label-data-items"></a>
##### View Data Items (`data-manager` only)

Navigate to the Label Data Storage page (`Label Data > Data Storage`) to view data items via a [data table](#data-table).

<a id="label-data-specifications"></a>
##### Edit Data Specifications (`data-manager` only)

Navigate to the Label Specifications page (`Label Data > Specifications`) to add, modify and delete data specifications via a [data table](#data-table).

<a id="labelset-branches"></a>
##### Edit Labelset Branches (`data-manager` only)

Navigate to the Labelset page (`Label Data > Labelset`) to add, modify and delete labelset branches via a [data table](#data-table).
