# Account Management

Accounts are used to identify users and access the ST Annotator Platform. The process of managing them is critical to the operation of the web platform.

The permissions given to each user are represented by its roles:

- `admin`: Full access to all users, including account creation, account deletion and role management.
- `data-manager`: Full access to all data (source data and label data).
- `project-manager`: Full access to all projects (but not necessarily the data used in each project).
- `supervisor`: Can supervise for a task in any project.
- `annotator`: Can annotate for a task in any project.

Each user can have any number of roles. These roles are intentionally orthogonal to each other; for a user to have full access to the platform, it should be given all roles.

When [initializing the web platform](../../cli/index.md#initialize-st-annotator), a default account is created with all available roles. This account should create additional accounts via [Manage Accounts](#manage-accounts-admin-only) for others to access the web platform.

Below is a comprehensive list of workflows that relate to account management.

## Permissions

Each user can manage their own account.

Users with the `admin` role can additionally manage other accounts. To ensure that at least one user has the `admin` role at any given time, they cannot remove the `admin` role from their own account.

## Workflows

### View Profile

Navigate to the Profile page (`Account > Profile`) to view your account profile.

*(This page is currently a placeholder)*

### Edit Settings

Navigate to the Settings page (`Account > Settings`) to edit the details of your account, such as username and password.

### Manage Accounts (`admin` only)

Navigate to the Accounts page (`Administration > Manage accounts`) to add, modify and delete accounts via a [data table](#data-table).
