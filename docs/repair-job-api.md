# Repair Job API

API reference for the **Garage / Repair Job** module — bus repair jobs, parts, categories, activity timeline, and repeat scheduling.

All endpoints require a valid JWT unless noted otherwise.

**Base URL:** `{API_PREFIX}` (default `/api/v1`)  
**Garage prefix:** `/garage`  
**Full base:** `/api/v1/garage`

---

## Table of contents

1. [Overview](#overview)
2. [Latest changes](#latest-changes)
3. [Data model](#data-model)
4. [Status workflow](#status-workflow)
5. [Repeat jobs](#repeat-jobs)
6. [Job parts](#job-parts)
7. [Authentication & permissions](#authentication--permissions)
8. [Repair jobs API](#repair-jobs-api)
9. [Repair categories API](#repair-categories-api)
10. [Repair parts API (master catalog)](#repair-parts-api-master-catalog)
11. [Business rules](#business-rules)
12. [Frontend integration notes](#frontend-integration-notes)

---

## Overview

The Garage module manages bus repair work. It is mounted at `/api/v1/garage` and includes three sub-modules:

| Sub-module | Base path | Purpose |
|------------|-----------|---------|
| Repair jobs | `/garage/jobs` | Create, assign, track, and close repair work on buses |
| Repair categories | `/garage/masters/repair-categories` | Hierarchical repair type taxonomy (up to 5 levels) |
| Repair parts | `/garage/masters/repair-parts` | Spare parts catalog with prices |

### Related master data

Repair jobs reference data from the Master module:

| Field | Master entity | Notes |
|-------|---------------|-------|
| `busNumber` | Bus | Resolved to `busId` on create |
| `reportedDriverId` | Driver | Optional — who reported the issue |
| `assignedToOfficeStaffId` | Office Staff | Optional — garage/mechanic assignee |

### Repeat jobs (summary)

Jobs can schedule a **one-time follow-up** via `scheduleRepeatFor` on PATCH. When the date is due, a new job is auto-created on the next list/detail request. See [Repeat jobs](#repeat-jobs) for full details.

### Job parts (summary)

Spare parts are managed in a **master catalog** (`RepairPart`). Parts used on a job are **line items** (`RepairJobPart`) added via `POST /garage/jobs/:jobId/parts`. Price is snapshotted at add time. See [Job parts](#job-parts) and [Repair parts API (master catalog)](#repair-parts-api-master-catalog).

---

## Latest changes

These are the most recent updates to repair jobs (migration `20260529120000_repair_job_comments_and_closed_status`):

### 1. New `closed` status

- Added `closed` to `RepairJobStatus`.
- Workflow: `completed` → `closed` (terminal state).
- When status becomes `closed`, `closedAt` is set automatically.

### 2. Activity log & timeline

- New model: `RepairJobActivityLog`.
- New enum: `RepairJobActivityType` — `created`, `status_changed`, `commented`, `closed`, `cancelled`.
- Every job create and status change writes an activity log entry.
- Job detail responses now include `activityLogs` (newest first).
- New endpoint: `GET /garage/jobs/:jobId/timeline` — chronological activity feed.

### 3. Comments

- New endpoint: `POST /garage/jobs/:jobId/comments`.
- Any authenticated user can add a comment (no special permission required).
- Comments are stored as activity log entries with `actionType: commented`.

### 4. Required notes on certain status changes

When updating status via `PATCH /garage/jobs/:jobId`, a `note` is required for:

| Target status | Requirement |
|---------------|-------------|
| `completed` | Completion note required |
| `on_hold` | Reason for hold required |

The note is saved on the activity log entry for that status change.

### 5. Office staff assignee (earlier change)

- Assignee changed from application `User` to `OfficeStaff` master record.
- Field: `assignedToOfficeStaffId` (FK to `OfficeStaff`).
- Cannot assign to staff who have a `dateOfLeaving` set.

---

## Data model

### RepairJob

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (cuid) | Internal ID |
| `jobIdNumber` | string | Human-readable ID, format `J01`–`J9999` |
| `busId` | string | FK to Bus |
| `odometerReading` | int | Odometer at time of repair |
| `repairCategoryId` | string | FK to leaf RepairCategory |
| `priority` | enum | `low`, `medium`, `high`, `urgent` |
| `reportedDriverId` | string? | FK to Driver |
| `assignedToOfficeStaffId` | string? | FK to OfficeStaff |
| `description` | string | Job description |
| `status` | enum | See [Status workflow](#status-workflow) |
| `closedAt` | datetime? | Set when status becomes `closed` |
| `createdById` | string | FK to User who created the job |
| `isRepeatJob` | boolean | `true` if auto-created from repeat schedule |
| `previousJobId` | string? | FK to source job for repeat chain |
| `repeatScheduledFor` | datetime? | Future date to spawn a repeat job |
| `repeatProcessedAt` | datetime? | When repeat was processed |
| `deletedAt` | datetime? | Soft delete timestamp |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

### RepairJobPart (line item on a job)

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (cuid) | Line item ID |
| `repairJobId` | string | FK to RepairJob |
| `repairPartId` | string | FK to RepairPart (catalog) |
| `quantity` | int | Default 1; minimum 1 when adding |
| `unitPrice` | decimal | **Snapshot** of catalog price at add time (string in JSON) |
| `addedById` | string | FK to User who added the part |
| `createdAt` | datetime | When the part was added to the job |

**Included in job responses** as `parts[]`, ordered oldest → newest (`createdAt asc`). Each item also includes nested `repairPart` (`id`, `partName`) and `addedBy` (`id`, `username`, `displayName`).

### RepairJobActivityLog

| Field | Type | Description |
|-------|------|-------------|
| `repairJobId` | string | FK to RepairJob |
| `actorUserId` | string | FK to User who performed the action |
| `actionType` | enum | `created`, `status_changed`, `commented`, `closed`, `cancelled` |
| `fromStatus` | enum? | Previous status (status changes only) |
| `toStatus` | enum? | New status (create / status changes) |
| `note` | string? | Comment or status-change note |
| `createdAt` | datetime | |

### RepairCategory

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Category name |
| `parentId` | string? | Parent category (null = root) |
| `level` | int | 1–5 depth in hierarchy |

### RepairPart (master catalog)

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (cuid) | Internal ID |
| `partName` | string | Unique part name (max 120 chars) |
| `price` | decimal | Current unit price (string in JSON, e.g. `"450.00"`) |
| `description` | string? | Optional (max 500 chars) |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

Used as the source when adding parts to jobs. Changing catalog `price` does **not** update parts already on jobs.

---

## Status workflow

```
created ──► assigned ──► in_progress ──► completed ──► closed
   │            │              │              │
   │            │              │              └── (terminal)
   │            │              │
   │            ├── on_hold ◄──┤
   │            │      │       │
   │            ◄──────┘       │
   │                            │
   └── cancelled (terminal) ◄───┘
```

### Allowed transitions

| From | To |
|------|-----|
| `created` | `assigned`, `cancelled` |
| `assigned` | `in_progress`, `on_hold`, `cancelled` |
| `in_progress` | `on_hold`, `completed`, `cancelled` |
| `on_hold` | `in_progress`, `assigned`, `cancelled` |
| `completed` | `closed` |
| `closed` | *(none — terminal)* |
| `cancelled` | *(none — terminal)* |

### Initial status on create

| Condition | Initial status |
|-----------|----------------|
| `assignedToOfficeStaffId` provided | `assigned` |
| No assignee | `created` |
| Explicit `status` in body | Uses provided value |

---

## Repeat jobs

Repeat jobs let you **schedule a follow-up repair job** from an existing job. When the scheduled date arrives, the backend automatically creates a new job that copies key details from the source job.

This is **not** a recurring cron or infinite loop — each schedule produces **one** new job, then the source job is marked as processed.

### How it works

```
Source job                          Repeat job (auto-created)
───────────                         ─────────────────────────
repeatScheduledFor = future date    isRepeatJob = true
         │                          previousJobId → source job
         │                          same bus, category, priority, etc.
         ▼
User opens job list / detail
         │
         ▼
processDueRepeatJobs() runs
         │
         ▼ (if repeatScheduledFor <= now AND repeatProcessedAt is null)
New job created ──────────────────► source.repeatProcessedAt = now
```

### Step-by-step

1. **Schedule** — On an existing job, send `scheduleRepeatFor` (ISO datetime, must be in the future) via `PATCH /api/v1/garage/jobs/:jobId`.
2. **Process** — Before returning data, these endpoints call `processDueRepeatJobs()`:
   - `GET /garage/jobs`
   - `GET /garage/jobs/my`
   - `GET /garage/jobs/:jobId`
3. **Create** — When due, a **new job** is created and the source job is marked processed.

There is **no dedicated create-repeat endpoint** and **no background cron** — repeat jobs are created when someone loads the job list or a job detail page.

### Fields involved

| Field | On source job | On repeat job |
|-------|---------------|---------------|
| `repeatScheduledFor` | Date/time when repeat should spawn | Not set |
| `repeatProcessedAt` | Set when repeat was created | Not set |
| `isRepeatJob` | `false` (default) | `true` |
| `previousJobId` | Not set | Points to source job ID |
| `previousJob` (response) | — | Includes source `id` and `jobIdNumber` |

### What is copied to the repeat job

| Copied | Not copied |
|--------|------------|
| Bus | Parts list |
| Odometer reading | Activity log / comments |
| Repair category | `repeatScheduledFor` on the new job |
| Priority | Status history |
| Reported driver | |
| Office staff assignee | |
| Description | |
| `createdById` (original creator) | |

Initial status on the repeat job:

| Condition | Status |
|-----------|--------|
| Source had `assignedToOfficeStaffId` | `assigned` |
| No assignee on source | `created` |

A new `jobIdNumber` is generated (e.g. `J42`).

### Schedule a repeat

**Permission:** `manage_garage_job`

```http
PATCH /api/v1/garage/jobs/:jobId
Content-Type: application/json

{
  "scheduleRepeatFor": "2026-06-15T00:00:00.000Z"
}
```

| Rule | Detail |
|------|--------|
| Date format | ISO 8601 datetime string |
| Must be future | Returns `400` if date is in the past or now |
| Reschedule | Sending a new `scheduleRepeatFor` resets `repeatProcessedAt` to `null`, allowing another repeat to be spawned later |

`scheduleRepeatFor` can be sent alone or together with other PATCH fields (status, description, etc.).

### Filter repeat jobs

Use the list endpoints with `isRepeatJob`:

```http
GET /api/v1/garage/jobs?isRepeatJob=true
GET /api/v1/garage/jobs/my?assignedToOfficeStaffId=<id>&isRepeatJob=true
```

### Example response (repeat job)

```json
{
  "id": "clx...",
  "jobIdNumber": "J15",
  "isRepeatJob": true,
  "previousJobId": "clx-source-id",
  "repeatScheduledFor": null,
  "repeatProcessedAt": null,
  "previousJob": {
    "id": "clx-source-id",
    "jobIdNumber": "J08"
  },
  "status": "assigned",
  "description": "Follow-up radiator check"
}
```

### Limitations

| Limitation | Detail |
|------------|--------|
| One repeat per schedule | Each `scheduleRepeatFor` creates at most one follow-up job (`repeatProcessedAt` prevents re-processing) |
| No automatic polling | Repeat jobs are only processed when a job list/get API is called |
| No parts copy | Parts must be added separately on the new job |
| No activity log on auto-create | The repeat job is created directly; no `RepairJobActivityLog` entry is written for the auto-create (unlike manual `POST /jobs`) |
| No recurring chain by default | The new repeat job does not inherit a schedule; schedule again on the new job if another follow-up is needed |

### Typical use cases

- **Preventive maintenance** — Schedule a follow-up inspection 30 days after completing a repair.
- **Warranty check** — Re-open the same category of work after a cooling-off period.
- **Part verification** — Confirm a temporary fix holds after a set number of days.

---

## Job parts

Parts track **spare parts consumed** on a repair job. There are two layers:

| Layer | Model | Purpose |
|-------|-------|---------|
| **Master catalog** | `RepairPart` | Reusable part definitions with name and price |
| **Job line items** | `RepairJobPart` | Parts actually used on a specific job |

```
RepairPart (catalog)          RepairJobPart (on job)
─────────────────────         ────────────────────────
partName, price        ──►    quantity, unitPrice (snapshot)
                              repairPart → catalog ref
                              addedBy → who added it
```

### Add part to a job

**Endpoint:** `POST /api/v1/garage/jobs/:jobId/parts`  
**Permission:** `manage_garage_job`

```http
POST /api/v1/garage/jobs/:jobId/parts
Content-Type: application/json

{
  "repairPartId": "<catalog-part-id>",
  "quantity": 2
}
```

| Field | Required | Rules |
|-------|----------|-------|
| `repairPartId` | Yes | Must exist in `RepairPart` catalog |
| `quantity` | No | Integer ≥ 1; defaults to `1` |

**Behaviour:**

1. Looks up the catalog part and reads its current `price`.
2. Creates a `RepairJobPart` line with `unitPrice` = catalog price at that moment.
3. Records `addedById` as the authenticated user.
4. Returns `201` with the **full updated job** (including all `parts`).

**Example response** (`data.parts` excerpt):

```json
"parts": [
  {
    "id": "clx-line-1",
    "quantity": 2,
    "unitPrice": "450.00",
    "createdAt": "2026-05-29T11:00:00.000Z",
    "repairPart": {
      "id": "clx-part-1",
      "partName": "Radiator Hose"
    },
    "addedBy": {
      "id": "clx-user-1",
      "username": "supervisor1",
      "displayName": "Supervisor One"
    }
  }
]
```

### Price snapshot

| Scenario | Behaviour |
|----------|-----------|
| Part added to job | `unitPrice` copied from catalog `price` at add time |
| Catalog price updated later | Existing job line items **unchanged** |
| Same part added twice | Two separate line items (allowed) |

**Line total:** `quantity × parseFloat(unitPrice)` (compute on frontend).

**Job parts total:** Sum of all line totals on the job.

### View parts on a job

Parts are included automatically on:

- `GET /api/v1/garage/jobs/:jobId`
- `GET /api/v1/garage/jobs` (each item in list)
- `GET /api/v1/garage/jobs/my`
- Response from `POST /api/v1/garage/jobs/:jobId/parts`

There is **no separate** `GET /jobs/:jobId/parts` endpoint — use the job detail `parts` array.

### What is not supported (job parts)

| Action | Status |
|--------|--------|
| Add part to job | Supported — `POST .../parts` |
| Update quantity on a line | **Not supported** — add another line or handle in UI only |
| Remove part from job | **Not supported** — no DELETE endpoint |
| Add parts on job create | **Not supported** — add after create via POST |
| Parts on repeat jobs | **Not copied** — add parts again on the new job |

### Repeat jobs and parts

When a repeat job is auto-created, **parts are not copied** from the source job. The mechanic must add parts again on the follow-up job if needed. See [Repeat jobs](#repeat-jobs).

### Typical workflow

1. Admin/supervisor maintains the part catalog via [Repair parts API](#repair-parts-api-master-catalog).
2. On job detail, load catalog: `GET /garage/masters/repair-parts`.
3. User selects part + quantity → `POST /garage/jobs/:jobId/parts`.
4. Job detail refreshes with updated `parts` list and running total.

---

## Authentication & permissions

### Headers

```http
Authorization: Bearer <access_token>
Content-Type: application/json
```

### Permission keys

| Permission key | Label |
|----------------|-------|
| `garage:repair_job:view` | View repair jobs |
| `garage:repair_job:create` | Create repair jobs |
| `garage:repair_job:edit` | Edit / update repair jobs |
| `garage:repair_job:delete` | Delete repair jobs |

### Legacy feature flags (used in route middleware)

| Feature | Permissions required | Used on |
|---------|---------------------|---------|
| `create_garage_job` | view + create | `POST /garage/jobs` |
| `manage_garage_job` | view + edit | `PATCH`, `POST .../parts`, `DELETE` |
| `manage_garage_masters` | category/part CRUD | Repair category & part mutations |

### Endpoint access summary

| Endpoint | Auth | Feature / rule |
|----------|------|----------------|
| `GET /garage/jobs` | Required | Any authenticated user |
| `GET /garage/jobs/my` | Required | Any authenticated user |
| `GET /garage/jobs/:jobId` | Required | Any authenticated user |
| `POST /garage/jobs` | Required | `create_garage_job` |
| `PATCH /garage/jobs/:jobId` | Required | `manage_garage_job` |
| `GET /garage/jobs/:jobId/timeline` | Required | Any authenticated user |
| `POST /garage/jobs/:jobId/comments` | Required | Any authenticated user |
| `POST /garage/jobs/:jobId/parts` | Required | `manage_garage_job` |
| `DELETE /garage/jobs/:jobId` | Required | `manage_garage_job`; **workers forbidden** |
| Master category/part GET | Required | Any authenticated user |
| Master category/part mutations | Required | `manage_garage_masters` |

---

## Repair jobs API

### List jobs

```http
GET /api/v1/garage/jobs
```

**Query parameters**

| Param | Type | Description |
|-------|------|-------------|
| `page` | int | Page number (default 1) |
| `limit` | int | Page size (default 20) |
| `status` | enum | Filter by status |
| `priority` | enum | Filter by priority |
| `assignedToOfficeStaffId` | string | Filter by assignee |
| `busId` | string | Filter by bus |
| `isRepeatJob` | boolean | Filter repeat jobs |

**Notes:** Triggers processing of due repeat jobs before returning results. Soft-deleted jobs are excluded.

**Response**

```json
{
  "success": true,
  "data": {
    "items": [ /* repair job objects */ ]
  },
  "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 }
}
```

---

### List my jobs (by office staff assignee)

```http
GET /api/v1/garage/jobs/my?assignedToOfficeStaffId=<officeStaffId>
```

Same filters as list jobs except `assignedToOfficeStaffId` is **required**.

---

### Get job by ID

```http
GET /api/v1/garage/jobs/:jobId
```

Returns full job including `parts`, `activityLogs`, related bus, category, driver, assignee, and previous job (if repeat).

---

### Create job

```http
POST /api/v1/garage/jobs
```

**Permission:** `create_garage_job`

**Body**

```json
{
  "busNumber": "BUS-001",
  "odometerReading": 125000,
  "repairCategoryId": "<leaf-category-id>",
  "priority": "high",
  "reportedDriverId": "<driver-id>",
  "assignedToOfficeStaffId": "<office-staff-id>",
  "description": "Engine overheating on route 12",
  "status": "created"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `busNumber` | Yes | Must exist in Bus master |
| `odometerReading` | Yes | Non-negative integer |
| `repairCategoryId` | Yes | Must be a **leaf** category (no children) |
| `priority` | Yes | `low`, `medium`, `high`, `urgent` |
| `description` | Yes | Non-empty string |
| `reportedDriverId` | No | Must exist if provided |
| `assignedToOfficeStaffId` | No | Active office staff only |
| `status` | No | Defaults based on assignee |

**Side effects:** Creates activity log with `actionType: created`.

---

### Update job

```http
PATCH /api/v1/garage/jobs/:jobId
```

**Permission:** `manage_garage_job`

**Body** (at least one field required)

```json
{
  "odometerReading": 125500,
  "repairCategoryId": "<id>",
  "priority": "urgent",
  "reportedDriverId": "<id>",
  "assignedToOfficeStaffId": "<id>",
  "description": "Updated description",
  "status": "in_progress",
  "note": "Started work on radiator",
  "scheduleRepeatFor": "2026-06-15T00:00:00.000Z"
}
```

| Field | Notes |
|-------|-------|
| `reportedDriverId` | Pass `null` to clear |
| `assignedToOfficeStaffId` | Pass `null` to unassign |
| `status` | Must follow allowed transitions |
| `note` | Required when status → `completed` or `on_hold` |
| `scheduleRepeatFor` | ISO datetime; must be in the future |

**Side effects:**

- Status change → activity log entry (`status_changed`, `closed`, or `cancelled`).
- Status → `closed` → sets `closedAt`.
- `scheduleRepeatFor` → resets `repeatProcessedAt` to null.

---

### Job timeline

```http
GET /api/v1/garage/jobs/:jobId/timeline
```

**Response**

```json
{
  "success": true,
  "data": {
    "jobId": "<id>",
    "items": [
      {
        "id": "...",
        "actionType": "created",
        "fromStatus": null,
        "toStatus": "assigned",
        "note": null,
        "createdAt": "2026-05-29T10:00:00.000Z",
        "actor": {
          "id": "...",
          "username": "admin",
          "displayName": "Admin User"
        }
      }
    ]
  }
}
```

Items are ordered oldest → newest.

---

### Add comment

```http
POST /api/v1/garage/jobs/:jobId/comments
```

**Body**

```json
{
  "note": "Waiting for spare part delivery"
}
```

| Field | Rules |
|-------|-------|
| `note` | Required, 1–2000 characters |

**Response:** `201` with the created activity log entry (`actionType: commented`).

---

### Add part to job

See [Job parts](#job-parts) for full behaviour, response shape, price snapshot rules, and limitations.

```http
POST /api/v1/garage/jobs/:jobId/parts
```

**Permission:** `manage_garage_job`

```json
{
  "repairPartId": "<part-id>",
  "quantity": 2
}
```

Returns `201` with the full updated job object.

---

### Delete job (soft delete)

```http
DELETE /api/v1/garage/jobs/:jobId
```

**Permission:** `manage_garage_job`  
**Restriction:** Workers cannot delete (admin/supervisor only).

Sets `deletedAt`; job is hidden from all list/get endpoints.

---

## Repair categories API

### List categories

```http
GET /api/v1/garage/masters/repair-categories
```

Returns flat `items` array and nested `tree` structure.

### Create category

```http
POST /api/v1/garage/masters/repair-categories
```

**Permission:** `manage_garage_masters`

```json
{
  "name": "Engine",
  "parentId": "<optional-parent-id>"
}
```

Max depth: **5 levels**.

### Update category

```http
PATCH /api/v1/garage/masters/repair-categories/:categoryId
```

**Permission:** `manage_garage_masters`

```json
{ "name": "Engine & Transmission" }
```

### Delete category

```http
DELETE /api/v1/garage/masters/repair-categories/:categoryId
```

**Permission:** `manage_garage_masters`

Blocked if category has children or is referenced by active repair jobs.

---

## Repair parts API (master catalog)

The parts **catalog** holds reusable spare part definitions. Jobs reference catalog entries when parts are added.

**Base path:** `/api/v1/garage/masters/repair-parts`

### List parts

```http
GET /api/v1/garage/masters/repair-parts?page=1&limit=20
```

**Auth:** Any authenticated user  
**Permission for read:** None (view is open to all authenticated roles)

**Query parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `limit` | int | 20 | Page size |

**Response**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "clx-part-1",
        "partName": "Radiator Hose",
        "price": "450.00",
        "description": "Upper radiator hose",
        "createdAt": "2026-05-26T10:00:00.000Z",
        "updatedAt": "2026-05-26T10:00:00.000Z"
      }
    ]
  },
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

Sorted by `partName` ascending.

---

### Get part

```http
GET /api/v1/garage/masters/repair-parts/:partId
```

**Auth:** Any authenticated user

**Response:** Single part object (same shape as list item).

**Errors:** `404` if part not found.

---

### Create part

```http
POST /api/v1/garage/masters/repair-parts
```

**Permission:** `manage_garage_masters`

**Body**

```json
{
  "partName": "Radiator Hose",
  "price": "450.00",
  "description": "Upper radiator hose"
}
```

| Field | Required | Rules |
|-------|----------|-------|
| `partName` | Yes | 1–120 chars; must be unique |
| `price` | Yes | Non-negative number (coerced); stored as decimal |
| `description` | No | 1–500 chars if provided |

**Response:** `201` with created part.

**Errors:** `409` if `partName` already exists.

---

### Update part

```http
PATCH /api/v1/garage/masters/repair-parts/:partId
```

**Permission:** `manage_garage_masters`

**Body** (at least one field required)

```json
{
  "partName": "Radiator Hose (Premium)",
  "price": "520.00",
  "description": null
}
```

| Field | Notes |
|-------|-------|
| `partName` | Must remain unique |
| `price` | Non-negative; does not retroactively change job line items |
| `description` | Pass `null` to clear |

**Response:** `200` with updated part.

**Errors:** `404` not found; `409` duplicate name.

---

### Delete part

```http
DELETE /api/v1/garage/masters/repair-parts/:partId
```

**Permission:** `manage_garage_masters`

**Response:** `200` with `{ "id": "<partId>" }`.

**Blocked when:** Part is referenced by any `RepairJobPart` line on a job (`409`: `Cannot delete a repair part used on repair jobs`).

### Catalog vs job parts

| Operation | Catalog (`RepairPart`) | Job line (`RepairJobPart`) |
|-----------|------------------------|----------------------------|
| Create | `POST /masters/repair-parts` | `POST /jobs/:jobId/parts` |
| Read | List / get catalog | Via job `parts[]` on GET job |
| Update | `PATCH /masters/repair-parts/:id` | Not supported |
| Delete | `DELETE /masters/repair-parts/:id` | Not supported |

---

## Business rules

### Job ID generation

- Format: `J` + zero-padded number (`J01`, `J02`, … `J9999`).
- Auto-generated on create; max capacity 9999 jobs.

### Repeat jobs

See [Repeat jobs](#repeat-jobs) for full scheduling behaviour, copied fields, API examples, and limitations.

### Job parts

See [Job parts](#job-parts) for adding parts to jobs, price snapshots, and supported operations.

### Soft delete

- Deleted jobs (`deletedAt` set) are excluded from all queries.
- No hard delete endpoint.

### Category selection

- Jobs must use a **leaf** repair category (no subcategories).
- Prevents assigning broad parent categories to jobs.

### Assignee validation

- `assignedToOfficeStaffId` must reference an active Office Staff record.
- Staff with `dateOfLeaving` set cannot be assigned.

### Decimal serialization

- Catalog `price` and job line `unitPrice` are returned as **strings** in JSON (e.g. `"450.00"`).
- Parse with `parseFloat()` or a decimal library for totals.

---

## Frontend integration notes

### Suggested UI flows

1. **Create job:** Load bus list, leaf repair categories, drivers, and office staff from Master APIs.
2. **Job board:** Use `GET /jobs` with `status` filter for kanban columns.
3. **My jobs view:** Use `GET /jobs/my?assignedToOfficeStaffId=...` for mechanic dashboard.
4. **Job detail:** Show `activityLogs` inline; use `/timeline` for full history view.
5. **Status actions:** Prompt for `note` when moving to `completed` or `on_hold`.
6. **Close job:** Only available from `completed` → `closed`.
7. **Schedule repeat:** On job detail, offer a date picker that PATCHes `scheduleRepeatFor`. Show `repeatScheduledFor` on the source job until processed.
8. **Repeat badge:** Show `isRepeatJob` and link to `previousJob` (`jobIdNumber`) on follow-up jobs.
9. **Repeat filter:** Optional tab or filter using `?isRepeatJob=true` on the job list.
10. **Parts on job:** Load catalog from `GET /masters/repair-parts`; add via `POST /jobs/:jobId/parts`; show line total (`quantity × unitPrice`) and job parts total.
11. **Parts picker:** Search/select from catalog; default quantity `1`; refresh job after add (response includes full job).
12. **Price display:** Show snapshotted `unitPrice` on each line — not live catalog price — so historical job cost stays accurate.

### Activity log display

| `actionType` | Suggested UI label |
|--------------|-------------------|
| `created` | Job created |
| `status_changed` | Status changed (`fromStatus` → `toStatus`) |
| `commented` | Comment added |
| `closed` | Job closed |
| `cancelled` | Job cancelled |

### Error cases to handle

| Scenario | HTTP | Message pattern |
|----------|------|-----------------|
| Invalid status transition | 400 | `Cannot transition repair job from X to Y` |
| Missing note on complete/hold | 400 | `A note is required before changing status to...` |
| Non-leaf category | 400 | `Repair category must be a leaf node` |
| Repeat date in past | 400 | `Repeat job must be scheduled for a future date` |
| Repair part not found | 404 | `Repair part not found` |
| Duplicate part name | 409 | `Repair part name already exists` |
| Delete part in use | 409 | `Cannot delete a repair part used on repair jobs` |
| Worker delete attempt | 403 | `Only administrators and supervisors can delete` |
| Job not found / deleted | 404 | `Repair job not found` |

### Migration

Apply the latest migration before using comments and closed status:

```bash
npx prisma migrate deploy
```

Migration: `20260529120000_repair_job_comments_and_closed_status`

---

## Related files

| File | Purpose |
|------|---------|
| `src/routes/garage-jobs.route.ts` | Repair job routes |
| `src/routes/garage-repair-categories.route.ts` | Category master routes |
| `src/routes/garage-repair-parts.route.ts` | Part master routes |
| `src/lib/garage.ts` | Shared helpers (ID gen, status rules, repeat processing) |
| `prisma/schema.prisma` | Database models and enums |
| `docs/permissions-catalog.md` | Full permission matrix |
