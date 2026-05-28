# Permissions Catalog

Reference for all backend permissions returned on login (`data.user.permissions`) and via `GET /permissions`.

**Total permissions:** 53

> **Note:** `id` is a DB CUID and changes per environment. Map by **`key`** (or `module` + `submodule` + `action`), not by `id`.

---

## Permission object shape

Each entry in `permissions` looks like:

```json
{
  "id": "<cuid-from-db>",
  "module": "masters",
  "submodule": "service_for",
  "action": "view",
  "label": "View",
  "key": "masters:service_for:view",
  "source": "role"
}
```

**Key format:** `module:submodule:action` — when submodule is empty, you get a double colon (e.g. `tickets::view`).

---

## Masters (28)

| # | key | module | submodule | action | label |
|---|-----|--------|-----------|--------|-------|
| 1 | `masters:service_for:view` | masters | service_for | view | View |
| 2 | `masters:service_for:create` | masters | service_for | create | Create New |
| 3 | `masters:service_for:edit` | masters | service_for | edit | Edit |
| 4 | `masters:service_for:delete` | masters | service_for | delete | Delete |
| 5 | `masters:bus_number:view` | masters | bus_number | view | View |
| 6 | `masters:bus_number:create` | masters | bus_number | create | Create New |
| 7 | `masters:bus_number:edit` | masters | bus_number | edit | Edit |
| 8 | `masters:bus_number:delete` | masters | bus_number | delete | Delete |
| 9 | `masters:spare_tank:view` | masters | spare_tank | view | View |
| 10 | `masters:spare_tank:create` | masters | spare_tank | create | Create New |
| 11 | `masters:spare_tank:edit` | masters | spare_tank | edit | Edit |
| 12 | `masters:spare_tank:delete` | masters | spare_tank | delete | Delete |
| 13 | `masters:service_number:view` | masters | service_number | view | View |
| 14 | `masters:service_number:create` | masters | service_number | create | Create New |
| 15 | `masters:service_number:edit` | masters | service_number | edit | Edit |
| 16 | `masters:service_number:delete` | masters | service_number | delete | Delete |
| 17 | `masters:driver:view` | masters | driver | view | View |
| 18 | `masters:driver:create` | masters | driver | create | Create New |
| 19 | `masters:driver:edit` | masters | driver | edit | Edit |
| 20 | `masters:driver:delete` | masters | driver | delete | Delete |
| 21 | `masters:helper:view` | masters | helper | view | View |
| 22 | `masters:helper:create` | masters | helper | create | Create New |
| 23 | `masters:helper:edit` | masters | helper | edit | Edit |
| 24 | `masters:helper:delete` | masters | helper | delete | Delete |
| 25 | `masters:office_staff:view` | masters | office_staff | view | View |
| 26 | `masters:office_staff:create` | masters | office_staff | create | Create New |
| 27 | `masters:office_staff:edit` | masters | office_staff | edit | Edit |
| 28 | `masters:office_staff:delete` | masters | office_staff | delete | Delete |

---

## Garage (12)

| # | key | module | submodule | action | label |
|---|-----|--------|-----------|--------|-------|
| 29 | `garage:repair_category:view` | garage | repair_category | view | View |
| 30 | `garage:repair_category:create` | garage | repair_category | create | Create New |
| 31 | `garage:repair_category:edit` | garage | repair_category | edit | Edit |
| 32 | `garage:repair_category:delete` | garage | repair_category | delete | Delete |
| 33 | `garage:repair_part:view` | garage | repair_part | view | View |
| 34 | `garage:repair_part:create` | garage | repair_part | create | Create New |
| 35 | `garage:repair_part:edit` | garage | repair_part | edit | Edit |
| 36 | `garage:repair_part:delete` | garage | repair_part | delete | Delete |
| 37 | `garage:repair_job:view` | garage | repair_job | view | View |
| 38 | `garage:repair_job:create` | garage | repair_job | create | Create New |
| 39 | `garage:repair_job:edit` | garage | repair_job | edit | Edit |
| 40 | `garage:repair_job:delete` | garage | repair_job | delete | Delete |

---

## Tickets (4)

| # | key | module | submodule | action | label |
|---|-----|--------|-----------|--------|-------|
| 41 | `tickets::view` | tickets | *(empty)* | view | View Dashboard |
| 42 | `tickets::create` | tickets | *(empty)* | create | Create Ticket |
| 43 | `tickets::assign` | tickets | *(empty)* | assign | Assign Ticket |
| 44 | `tickets::update_status` | tickets | *(empty)* | update_status | Update Status |

---

## Issue Categories (4)

| # | key | module | submodule | action | label |
|---|-----|--------|-----------|--------|-------|
| 45 | `issue_categories::view` | issue_categories | *(empty)* | view | View |
| 46 | `issue_categories::create` | issue_categories | *(empty)* | create | Create New |
| 47 | `issue_categories::edit` | issue_categories | *(empty)* | edit | Edit |
| 48 | `issue_categories::delete` | issue_categories | *(empty)* | delete | Delete |

---

## Application Users (5)

| # | key | module | submodule | action | label |
|---|-----|--------|-----------|--------|-------|
| 49 | `users::view` | users | *(empty)* | view | View |
| 50 | `users::create` | users | *(empty)* | create | Create New |
| 51 | `users::edit` | users | *(empty)* | edit | Edit |
| 52 | `users::delete` | users | *(empty)* | delete | Delete |
| 53 | `users::manage_permissions` | users | *(empty)* | manage_permissions | Manage Permissions |

---

## Display labels

### Modules

| code | UI label |
|------|----------|
| `masters` | Masters |
| `garage` | Garage |
| `tickets` | Tickets |
| `issue_categories` | Issue Categories |
| `users` | Application Users |

### Submodules

| code | UI label |
|------|----------|
| `service_for` | Service For |
| `bus_number` | Bus Number |
| `spare_tank` | Spare Tank |
| `service_number` | Service Number |
| `driver` | Driver |
| `helper` | Helper |
| `office_staff` | Office Staff |
| `repair_category` | Repair Category |
| `repair_part` | Repair Part |
| `repair_job` | Repair Job |

---

## Frontend route → permission mapping

| Frontend route / screen | View key | Create | Edit | Delete | Other |
|-------------------------|----------|--------|------|--------|-------|
| `/master/service-for` | `masters:service_for:view` | `masters:service_for:create` | `masters:service_for:edit` | `masters:service_for:delete` | — |
| `/master/buses` | `masters:bus_number:view` | `masters:bus_number:create` | `masters:bus_number:edit` | `masters:bus_number:delete` | — |
| `/master/spare-tanks` | `masters:spare_tank:view` | `masters:spare_tank:create` | `masters:spare_tank:edit` | `masters:spare_tank:delete` | — |
| `/master/service-numbers` | `masters:service_number:view` | `masters:service_number:create` | `masters:service_number:edit` | `masters:service_number:delete` | — |
| `/master/drivers` | `masters:driver:view` | `masters:driver:create` | `masters:driver:edit` | `masters:driver:delete` | — |
| `/master/helpers` | `masters:helper:view` | `masters:helper:create` | `masters:helper:edit` | `masters:helper:delete` | — |
| `/master/office-staff` | `masters:office_staff:view` | `masters:office_staff:create` | `masters:office_staff:edit` | `masters:office_staff:delete` | — |
| `/garage/repair-categories` | `garage:repair_category:view` | `garage:repair_category:create` | `garage:repair_category:edit` | `garage:repair_category:delete` | — |
| `/garage/repair-parts` | `garage:repair_part:view` | `garage:repair_part:create` | `garage:repair_part:edit` | `garage:repair_part:delete` | — |
| `/garage/jobs` | `garage:repair_job:view` | `garage:repair_job:create` | `garage:repair_job:edit` | `garage:repair_job:delete` | — |
| `/dashboard` / tickets | `tickets::view` | `tickets::create` | — | — | `tickets::assign`, `tickets::update_status` |
| `/issue-categories` | `issue_categories::view` | `issue_categories::create` | `issue_categories::edit` | `issue_categories::delete` | — |
| `/application-users` | `users::view` | `users::create` | `users::edit` | `users::delete` | `users::manage_permissions` |

---

## All keys (JSON array)

```json
[
  "masters:service_for:view",
  "masters:service_for:create",
  "masters:service_for:edit",
  "masters:service_for:delete",
  "masters:bus_number:view",
  "masters:bus_number:create",
  "masters:bus_number:edit",
  "masters:bus_number:delete",
  "masters:spare_tank:view",
  "masters:spare_tank:create",
  "masters:spare_tank:edit",
  "masters:spare_tank:delete",
  "masters:service_number:view",
  "masters:service_number:create",
  "masters:service_number:edit",
  "masters:service_number:delete",
  "masters:driver:view",
  "masters:driver:create",
  "masters:driver:edit",
  "masters:driver:delete",
  "masters:helper:view",
  "masters:helper:create",
  "masters:helper:edit",
  "masters:helper:delete",
  "masters:office_staff:view",
  "masters:office_staff:create",
  "masters:office_staff:edit",
  "masters:office_staff:delete",
  "garage:repair_category:view",
  "garage:repair_category:create",
  "garage:repair_category:edit",
  "garage:repair_category:delete",
  "garage:repair_part:view",
  "garage:repair_part:create",
  "garage:repair_part:edit",
  "garage:repair_part:delete",
  "garage:repair_job:view",
  "garage:repair_job:create",
  "garage:repair_job:edit",
  "garage:repair_job:delete",
  "tickets::view",
  "tickets::create",
  "tickets::assign",
  "tickets::update_status",
  "issue_categories::view",
  "issue_categories::create",
  "issue_categories::edit",
  "issue_categories::delete",
  "users::view",
  "users::create",
  "users::edit",
  "users::delete",
  "users::manage_permissions"
]
```

---

## Source

Canonical definitions live in `src/lib/permission-catalog.ts`. Admin users receive all permissions automatically on login.
