# Application Users Module API

API reference for **Application Users** — scalable, permission-based user management.

**Base URL:** `{API_PREFIX}` (default `/api/v1`)

Only users with the appropriate `users.*` permissions (typically **Admin**) can manage application users, roles, and permission assignments.

---

## Overview

| Resource | Base path | Description |
|----------|-----------|-------------|
| Application Users | `/application-users` | CRUD for login users |
| Roles | `/roles` | User types and role-level permission templates |
| Permissions | `/permissions` | Module → submodule → action catalog |

### Permission model

```text
Module
 └── Submodule (optional — empty string for module-level)
      └── Action (view, create, edit, delete, …)
```

Example keys: `masters:service_for:view`, `garage:repair_job:create`, `users::manage_permissions`

Effective permissions for a user = **role permissions** ∪ **user-specific permissions**. Admin users receive all permissions automatically.

---

## Authentication

All endpoints require `Authorization: Bearer <JWT>` unless noted.

Login response and `GET /auth/me` include the user's effective `permissions` array for frontend UI rendering.

---

## User types (roles)

| Code | Label |
|------|-------|
| `admin` | Admin |
| `supervisor` | Supervisor |
| `chairman` | Chairman |
| `accountant` | Accountant |
| `collection_agent` | Collection Agent |
| `worker` | Worker (legacy ticket field worker) |

New roles can be added to the database enum/migration pipeline as the product grows.

---

## Application Users

### List users

`GET /application-users`

**Permission:** `users::view`

| Query | Type | Default | Description |
|-------|------|---------|-------------|
| `includeInactive` | boolean | `false` | Include deactivated users |
| `userType` | string | — | Filter by role code |
| `page` | number | `1` | Page number |
| `limit` | number | `20` | Page size (max 100) |

### Get user

`GET /application-users/:userId`

**Permission:** `users::view`

### Create user

`POST /application-users`

**Permission:** `users::create`

```json
{
  "username": "rajesh.kumar",
  "fullName": "Rajesh Kumar",
  "password": "secret123",
  "mobileNumber": "9876543210",
  "userType": "supervisor",
  "email": "rajesh@example.com",
  "isActive": true,
  "permissionIds": ["clxyz..."]
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `username` | Yes | Login username (3–50 characters, unique) |
| `fullName` | Yes | Stored as `displayName` |
| `password` | Yes | Min 6 characters |
| `mobileNumber` | Yes | 10 digits |
| `userType` | Yes | One of managed user types (not admin) |
| `permissionIds` | No | Direct user permission overrides |

### Update user

`PATCH /application-users/:userId`

**Permission:** `users::edit`

All create fields optional. `username` and `mobileNumber` can be updated independently.

### Assign user permissions

`PUT /application-users/:userId/permissions`

**Permission:** `users::manage_permissions`

```json
{
  "permissionIds": ["perm-id-1", "perm-id-2"]
}
```

Replaces all user-specific permissions (role template permissions remain).

### Delete user

`DELETE /application-users/:userId`

**Permission:** `users::delete`

### Current user permissions

`GET /application-users/me/permissions`

Returns effective permissions for the authenticated user (no admin permission required).

---

## Roles

### List roles

`GET /roles`

**Permission:** `users::view`

Returns each role with its permission template and user count.

### Get role

`GET /roles/:roleId`

**Permission:** `users::view`

### Update role permissions (template)

`PUT /roles/:roleId/permissions`

**Permission:** `users::manage_permissions`

```json
{
  "permissionIds": ["perm-id-1", "perm-id-2"]
}
```

Use role templates as defaults; per-user overrides are set on the user record.

---

## Permissions catalog

### List all permissions

`GET /permissions`

**Permission:** `users::view`

Response includes flat `items` and nested `tree` for dynamic UI rendering.

### Current user permission tree

`GET /permissions/me`

Returns effective permissions and tree for the logged-in user.

---

## Frontend integration

1. After login, read `user.permissions` or call `GET /permissions/me`.
2. Build navigation from modules where the user has any `view` action.
3. Show action buttons (`Create`, `Edit`, `Delete`) based on matching permission keys.
4. Backend routes enforce the same permissions via `requirePermission` / `requireFeature`.
5. **Application user create form:** load `GET /application-users/linkable-employees` for the employee dropdown (`items[].name` as label, `items[].id` + `items[].employeeType` as value). On submit, send both `employeeId` and `employeeType` in the create payload. When editing, pass `?excludeUserId=<userId>` so the currently linked employee stays selectable.

### Example permission checks

```typescript
const canViewServiceFor = permissions.some(
  (p) => p.module === "masters" && p.submodule === "service_for" && p.action === "view"
);

const canEditGarageJobs = permissions.some(
  (p) => p.module === "garage" && p.submodule === "repair_job" && p.action === "edit"
);
```

---

## Legacy compatibility

Existing routes continue to use `requireFeature("manage_master")`, etc. Feature checks now resolve against the DB permission catalog first, with a fallback to the static role matrix in `src/auth/roles.ts`.

The legacy `/users` endpoints remain for backward compatibility with the ticketing worker list. Prefer `/application-users` for new admin UI work.

---

## Seeding

Run migrations and seed to populate the permission catalog and default role mappings:

```bash
npm run prisma:migrate
npm run prisma:seed
```

Permission definitions live in `src/lib/permission-catalog.ts`. Add new modules/submodules/actions there, then re-run seed or upsert via a future admin API.
