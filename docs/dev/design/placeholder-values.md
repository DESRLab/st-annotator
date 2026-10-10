# Placeholder Values

Consider this sequence of labelset operations:

1. Create a new label.
2. Edit the newly created label.

When these operations run client-side, the create operation has not yet run on the server, so the new label has no database ID. The edit operation therefore cannot refer to it by a permanent ID.

Placeholder values provide a temporary, unique identity. Semantically, the operations have these signatures:

1. Create a new label: `(CreateParams) => Placeholder<ID>`.
2. Edit the new label: `(Placeholder<ID>, EditParams) => void`.

In code, an operation's parameters are held in `opParams`, while its return value is held in `opResult`. Applying the create operation locally constructs the label with a unique `Placeholder<ID>`. Later local operations can use that same placeholder to refer to the label.

## Sending placeholders to the backend

When `EditableBranch` saves active local commits, it walks every operation parameter recursively. Each unresolved `Placeholder` is replaced by its stable `wireKey`, a braced UUID string such as `{2ee540cd-6aa4-4adc-a02f-18e99c1b81ab}`. Repeated references to the same object use the same key. The request declares every key once in `placeholder_keys` and puts the key that an operation will produce in that instruction's `result_placeholder_key`.

Resolved placeholders serialize as their resolved values instead. Placeholders can be nested in plain objects and arrays; the frontend converts the entire parameter tree before sending it. The `Placeholder` object itself never crosses the network.

A create-then-edit batch is therefore shaped conceptually like this:

```json
{
  "placeholder_keys": ["{2ee540cd-6aa4-4adc-a02f-18e99c1b81ab}"],
  "commits": [
    {
      "op_name": "create",
      "op_params": {"name": "New label"},
      "result_placeholder_key": "{2ee540cd-6aa4-4adc-a02f-18e99c1b81ab}"
    },
    {
      "op_name": "update",
      "op_params": {"id": "{2ee540cd-6aa4-4adc-a02f-18e99c1b81ab}", "name": "Edited label"},
      "result_placeholder_key": null
    }
  ]
}
```

## Server-side resolution

The backend validates the complete batch before allowing any operation to mutate state. Placeholder keys must be unique, every `result_placeholder_key` must have been declared, a key may be assigned only once, and an operation may refer only to a result produced by an earlier instruction. This makes resolution strictly forward-moving in request order; forward references and cycles are rejected with a `400 Bad Request`.

The backend then creates a `Placeholders` collection for the declared keys and applies instructions in order:

1. It recursively replaces placeholder references in the instruction's validated `op_params`. Traversal covers Pydantic models, dictionaries, lists, and tuples.
2. If a referenced key is still unresolved, the batch fails rather than passing a temporary value into the operation.
3. It constructs and applies the operation using the resolved parameters.
4. If the instruction has a `result_placeholder_key`, it stores the operation's return value under that key. A second attempt to resolve the key is an error.
5. It appends the operation result to `op_results`, preserving instruction order.

Operation parameter validation can coerce an ID string to `uuid.UUID`, which removes the braces around the wire key. The resolver deliberately canonicalizes UUID values back to braced form before matching them against the declared keys. This lets UUID-typed operation parameters participate in placeholder resolution instead of accidentally receiving the placeholder UUID itself.

After all instructions run, the backend rejects the batch if any declared key remains unresolved. The transaction therefore cannot commit a partially resolved operation sequence. The stored operation metadata contains the resolved parameters, so commit hashes and later replay use permanent server values rather than client placeholder keys.

## Resolving the local objects

The push response contains one `op_results` entry for each submitted instruction, in the same order. `EditableBranch` pairs each local commit with its response entry and calls `put()` on that operation's `opResult` placeholder. `put()` records the permanent value, resolves callers waiting through `getAsync()`, and refuses a second resolution.

The existing local label objects keep the same placeholder object as their identity. Placeholder-aware indexes listen for its resolution and make the object discoverable by the permanent ID, avoiding a destructive replacement of the locally edited object. From then on, string conversion and later saves use the resolved value.
