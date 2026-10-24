# Account Management

Use your account to sign in and access your assigned work. Administrators can create accounts and choose which pages and tools each person can use.

Account roles determine access:

- `admin`: Full access to all users, including account creation, account deletion and role management.
- `data-manager`: Full access to all data (source data and label data).
- `project-manager`: Full access to all projects, plus read-only access to data management pages (except the file explorer).
- `supervisor`: Can supervise for a task in any project.
- `annotator`: Can annotate for a task in any project.

An account can have several roles. Each role grants separate permissions; assign all roles to give someone full access to the platform.

The initial administrator account (see [initializing the web platform](../../cli/index.md#initialize-st-annotator)) has all roles. Use [Manage Accounts](#manage-accounts-admin-only) to create a separate account for each person.

## Permissions

Each user can manage their own account.

Users with the `admin` role can also manage other accounts.

!!! note
    To ensure that at least one user has the `admin` role at any given time, users cannot remove the `admin` role from their own account.

## Workflows

### View Profile

Navigate to the Profile page (`Account > Profile`) to view your account profile.

!!! info
    Profile details are not yet available on this page.

### Edit Settings

Navigate to the Settings page (`Account > Settings`) to manage your settings:

- `Account`: Change your username.
- `Authentication`: Change your password.

Changing your username or password in Settings keeps your current session signed
in and signs out other sessions.

The `Profile` and `Preferences` sections have no settings yet.

### Manage Accounts (`admin` only)

Navigate to the Accounts page (`Administration > Manage accounts`) to add, modify and delete accounts via a [data table](./index.md#data-table).

The account form has two preference tabs. `Preferences` currently has no
settings. Use `Preferences (Raw JSON)` if you need to enter preferences directly;
leaving it empty uses `{}`.

To change several accounts, select them and choose `Batch Edit Details`:

- `Update Roles` replaces each account's roles with exactly the roles you select.
  Omitted roles are removed, along with access to the pages they allow.
- `Update Preferences` replaces each account's preferences with the JSON you
  enter. An empty field resets them to `{}`.

Usernames and passwords must be changed individually. If you include your own
account, the same changes apply to you. You cannot remove your own `admin` role.
Updating your own account in a batch also signs you out; sign in again to
continue.

See [Batch Editing](./index.md#batch-editing) for the shared dialog controls.
