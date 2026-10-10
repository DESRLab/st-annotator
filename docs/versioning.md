# ⭐ Versioning

## Release versions

Our version numbers take the form `vX.Y.Z` (major/minor/patch). They are incremented according to these rules:

* _Major_ releases occur when the database schema changes in a backwards-incompatible manner.
* _Minor_ releases are for new features that do not fit the criteria of major releases.
* _Patch_ releases are for security and bug fixes.

We use the same version number for all core and plugin packages in this repository, both frontend and backend.

## Documentation versions

The documentation selector offers a snapshot for each published release and
**Development** (`development/`) for the latest `main` source. Release snapshots use the same
version as the core and plugin packages and include both API references.

The documentation root opens the latest stable release, or development docs
before the first stable release is published. `stable/` follows the latest stable
release; prerelease snapshots do not change it. Use a specific version's URL when
sharing documentation for an installed release.
