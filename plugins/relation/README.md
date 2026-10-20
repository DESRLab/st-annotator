# ⭐ Relation Labels Plugin

This plugin enables the ST Annotator platform to represent directed relationships between bounding box, vector, and segmentation labels, such as “in front of”, “beside”, or “behind”.

Each relation connects a source label to a target label and has a relation class describing their relationship. Relation classes are defined separately from object classes and are assigned to label groups through relation-class selections.

The same pair of labels can have multiple relations, including relations in opposite directions. Relations belong to the labelset alongside their endpoints and share its version history.
