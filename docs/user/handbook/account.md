# Account Management

Accounts are used to identify users and access the ST Annotator Platform. The process of managing them is critical to the operation of the web platform.

The permissions given to each user are represented by its roles:

- `admin`: Full access to all users, including account creation, account deletion and role management.
- `data-manager`: Full access to all data (source data and label data).
- `project-manager`: Full access to all projects, plus read-only access to data management pages (except the file explorer).
- `supervisor`: Can supervise for a task in any project.
- `annotator`: Can annotate for a task in any project.

Each user can have any number of roles. These roles are intentionally orthogonal to each other; for a user to have full access to the platform, it should be given all roles.

When [initializing the web platform](../../cli/index.md#initialize-st-annotator), a default account is created with all available roles. This account should create additional accounts via [Manage Accounts](#manage-accounts-admin-only) for others to access the web platform.

Below is a comprehensive list of workflows that relate to account management.

## Permissions

Each user can manage their own account.

Users with the `admin` role can also manage other accounts.

!!! note
    To ensure that at least one user has the `admin` role at any given time, users cannot remove the `admin` role from their own account.

## Workflows

### View Profile

Navigate to the Profile page (`Account > Profile`) to view your account profile.

!!! info
    This page is currently a placeholder.

### Edit Settings

Navigate to the Settings page (`Account > Settings`) to manage your settings:

- Profile: WIP
- Account: Change your username
- Authentication: Change your password
- Preferences: Placeholder. In the future, you could use this page to assign keybinds.

### Manage Accounts (`admin` only)

Navigate to the Accounts page (`Administration > Manage accounts`) to add, modify and delete accounts via a [data table](./index.md#data-table).

`Preferences` opens as two tabs. The platform does not yet define any account preference, so the `Preferences` tab says so -- `Nothing to configure just yet!` -- and the value is entered as JSON under `Preferences (Raw JSON)`. Entering nothing means `{}`.

You may select several accounts and choose `Batch Edit Details` to set `Roles` or `Preferences` for all of them at once. Ticking `Update Roles` gives every selected account exactly the roles you tick, so anyone you leave out loses every role you omit, and with it the pages that role unlocks. `Update Preferences` writes the JSON you enter as the preferences of every selected account; leaving the box empty writes the default `{}` to all of them. A username and password are not batch-editable. A batch that includes your own account applies to it like any other, so leave nothing unticked that you still need: the roles you omit are taken from you too, and a batch that drops your `admin` role is refused outright. The write also restamps every account it touches, so selecting yourself spends the session you are working in and you sign in again to continue. See [Batch Edit](./index.md#batch-edit) for how the dialog works.
