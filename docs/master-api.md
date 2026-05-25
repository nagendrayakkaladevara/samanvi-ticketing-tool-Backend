# Master Module API

API reference for the **Master** module — master data used across the application (Service For, Buses, Spare Tanks, Service Numbers, Drivers, Helpers, Office Staff).

All Master endpoints require a valid JWT unless noted otherwise.

**Base URL:** `{API_PREFIX}` (default `/api/v1`)  
**Master prefix:** `/master`  
**Full base:** `/api/v1/master`

Interactive docs (when enabled): `GET /api/v1/docs` · OpenAPI JSON: `GET /api/v1/openapi.json`

---

## Table of contents

1. [Overview](#overview)
2. [Authentication & permissions](#authentication--permissions)
3. [Common conventions](#common-conventions)
4. [Service For](#1-service-for)
5. [Bus creation](#2-bus-creation)
6. [Spare tank creation](#3-spare-tank-creation)
7. [Service number](#4-service-number)
8. [Drivers](#5-drivers)
9. [Helpers](#6-helpers)
10. [Office staff](#7-office-staff)
11. [Validation reference](#validation-reference)
12. [Frontend integration notes](#frontend-integration-notes)

---

## Overview

The Master module is grouped under a single route prefix:

| Sub-module | Base path | Pagination | Auto-generated ID |
|------------|-----------|------------|-------------------|
| Service For | `/master/service-for` | No | No |
| Buses | `/master/buses` | Yes | No |
| Spare Tanks | `/master/spare-tanks` | Yes | No |
| Service Numbers | `/master/service-numbers` | Yes | No |
| Drivers | `/master/drivers` | Yes | Yes (`D0001`) |
| Helpers | `/master/helpers` | Yes | Yes (`H0001`) |
| Office Staff | `/master/office-staff` | Yes | Yes (`S0001`) |

### Module dependencies

```
Service For ──► Service Number (serviceForId FK)
```

Recommended UI flow:

1. Create **Service For** entries before **Service Numbers**.
2. **Spare Tanks** accept any bus number — it does not need to exist in the Buses master.

---

## Authentication & permissions

### Headers

Every request must include:

```http
Authorization: Bearer <access_token>
Content-Type: application/json
```

Obtain a token via `POST /auth/login`.

### Feature permissions

| Feature | Used for | Admin | Supervisor | Worker |
|---------|----------|-------|--------------|--------|
| `manage_buses` | Bus create / update / delete | Yes | Yes | No |
| `manage_master` | All other Master mutations | Yes | Yes | No |

- **Read (GET)** endpoints: any authenticated role (admin, supervisor, worker).
- **Write (POST / PATCH / DELETE)** endpoints: require the feature above.

Workers can list and view Master data but cannot create, edit, or delete.

### Permission probe (optional)

Use these lightweight POST endpoints to check write access before showing action buttons:

```http
POST /api/v1/master/buses          → requires manage_buses
POST /api/v1/master/service-for    → requires manage_master
```

Both return `200` with `{ "success": true, "data": { "message": "..." } }` when allowed, or `403` when forbidden.

---

## Common conventions

### Success response envelope

```json
{
  "success": true,
  "data": { ... }
}
```

Paginated list responses also include `meta`:

```json
{
  "success": true,
  "data": { "items": [ ... ] },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

### Error response envelope

```json
{
  "success": false,
  "message": "User-friendly message",
  "error": "Technical message",
  "code": "BAD_REQUEST",
  "details": {
    "issues": [ /* Zod validation issues on 400 */ ]
  },
  "requestId": "..."
}
```

| HTTP | `code` | Typical cause |
|------|--------|---------------|
| `400` | `BAD_REQUEST` | Invalid body, query, or path param |
| `401` | `UNAUTHORIZED` | Missing or expired JWT |
| `403` | `FORBIDDEN` | Role lacks required feature |
| `404` | `NOT_FOUND` | Record or referenced FK not found |
| `409` | `CONFLICT` | Duplicate unique field, or delete blocked by references |

Validation errors include Zod `issues` in `details.issues` — use these for inline form field errors.

### Pagination query params

Used by: buses, spare tanks, service numbers, drivers, helpers, office staff.

| Param | Type | Default | Constraints |
|-------|------|---------|-------------|
| `page` | integer | `1` | Min `1` |
| `limit` | integer | `20` | Min `1`, max `100` |

Example:

```http
GET /api/v1/master/drivers?page=2&limit=25
```

### Date format

All Master **date fields** in request and response bodies use:

```text
dd-mm-yyyy
```

Examples: `05-01-2026`, `31-12-2025`

- Mandatory date fields must be non-empty strings matching the pattern.
- Optional dates may be omitted on create.
- Nullable dates (e.g. `dateOfLeaving`) may be sent as `null` on update to clear the value.
- `createdAt` / `updatedAt` remain ISO 8601 timestamps (unchanged).

### Document uploads (employees)

Driver, Helper, and Office Staff documents are sent as **base64-encoded strings** in the JSON body (not multipart/form-data).

| Field | Driver | Helper | Office Staff |
|-------|--------|--------|--------------|
| `aadharCardFront` | Required | Required | Required |
| `aadharCardBack` | Required | Required | Required |
| `dlFront` | Required | — | — |
| `dlBack` | Required | — | — |
| `upiScanner` | Optional | Optional | Optional |

**List endpoints** (`GET /drivers`, etc.) **exclude** document blobs for performance.  
**Detail endpoints** (`GET /drivers/:id`, create/update responses) **include** documents as base64 strings.

**Request body limit:** `15 MB` (JSON). Keep compressed images where possible.

Example — convert a file before upload:

```javascript
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1]; // strip data:image/...;base64,
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
```

Example — display a returned document:

```javascript
const src = `data:image/jpeg;base64,${data.aadharCardFront}`;
```

### Auto-generated employee IDs

| Entity | Field | Format | Example |
|--------|-------|--------|---------|
| Driver | `driverIdNumber` | `D` + 4 digits | `D0140` |
| Helper | `helperIdNumber` | `H` + 4 digits | `H0086` |
| Office Staff | `staffIdNumber` | `S` + 4 digits | `S0020` |

Do **not** send these on create — the server assigns them. They are returned in the response.

### Internal IDs

All records also have a Prisma `id` (cuid string) used in URL path params (`:busId`, `:driverId`, etc.). Use `id` for API calls; display `driverIdNumber` / `helperIdNumber` / `staffIdNumber` in the UI.

---

## 1. Service For

Simple lookup table for service types. Used as a dropdown when creating Service Numbers.

### List service for entries

```http
GET /master/service-for
```

No pagination. Returns all entries sorted alphabetically by `serviceFor`.

**Response `200`**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "clx...",
        "serviceFor": "Express",
        "createdAt": "2026-05-24T10:00:00.000Z",
        "updatedAt": "2026-05-24T10:00:00.000Z"
      }
    ]
  }
}
```

Response includes `Cache-Control: no-store` — do not cache aggressively on the client.

---

### Create service for

```http
POST /master/service-for
```

**Permission:** `manage_master`

**Body**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `serviceFor` | string | Yes | 1–120 chars, trimmed, unique |

```json
{
  "serviceFor": "Express"
}
```

**Response `201`** — returns the created object.

**Errors:** `409` if `serviceFor` already exists.

---

### Update service for

```http
PATCH /master/service-for/:serviceForId
```

**Permission:** `manage_master`

**Body** — at least one field required:

| Field | Type | Required |
|-------|------|----------|
| `serviceFor` | string | Optional (1–120 chars) |

**Response `200`** — returns updated object.

---

### Delete service for

```http
DELETE /master/service-for/:serviceForId
```

**Permission:** `manage_master`

**Response `200`**

```json
{
  "success": true,
  "data": { "id": "clx..." }
}
```

**Note:** Deletion fails with `409` if service numbers still reference this entry.

---

## 2. Bus creation

### List buses (paginated)

```http
GET /master/buses?page=1&limit=20
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "clx...",
        "busNumber": "BUS-1001",
        "engineNumber": "ENG-0001",
        "chassisNumber": "CHS-0001",
        "purchaseDate": "15-03-2024",
        "odometer": 85000,
        "insuranceValidity": "31-12-2026",
        "pollutionValidity": null,
        "fcValidity": null,
        "basePermitValidity": null,
        "homeTaxValidity": null,
        "aitpValidity": null,
        "aitpAuthorizationValidity": null,
        "serviceOutDate": null,
        "remarks": null,
        "lastMaintenanceDate": "10-01-2026",
        "createdAt": "2026-05-24T10:00:00.000Z",
        "updatedAt": "2026-05-24T10:00:00.000Z"
      }
    ]
  },
  "meta": { "page": 1, "limit": 20, "total": 21, "totalPages": 2 }
}
```

---

### List bus numbers (dropdown)

```http
GET /master/buses/bus-numbers
```

Returns a flat array of bus number strings (for ticket creation, optional spare tank autocomplete, etc.).

**Response `200`**

```json
{
  "success": true,
  "data": ["BUS-1001", "BUS-1002", "BUS-1003"]
}
```

---

### Get single bus

```http
GET /master/buses/:busId
```

**Response `200`** — same bus object shape as list item.

---

### Get bus ticket history

```http
GET /master/buses/:busId/tickets?limit=100
```

Existing ticketing integration. Workers only see tickets assigned to them.

| Query | Default | Max |
|-------|---------|-----|
| `limit` | `100` | `500` |

**Response `200`**

```json
{
  "success": true,
  "data": {
    "bus": { "id": "clx...", "busNumber": "BUS-1001" },
    "items": [ /* ticket objects with activity logs */ ]
  }
}
```

---

### Create bus

```http
POST /master/buses
```

**Permission:** `manage_buses`

**Body**

| Field | Type | Required | Format / constraints |
|-------|------|----------|----------------------|
| `busNumber` | string | Yes | 1–50 chars; stored uppercase |
| `engineNumber` | string | Yes | 1–80 chars |
| `chassisNumber` | string | Yes | 1–80 chars |
| `purchaseDate` | string | No | `dd-mm-yyyy` |
| `odometer` | number | Yes | Integer ≥ 0 |
| `insuranceValidity` | string | Yes | `dd-mm-yyyy` |
| `pollutionValidity` | string | No | `dd-mm-yyyy` |
| `fcValidity` | string | No | `dd-mm-yyyy` |
| `basePermitValidity` | string | No | `dd-mm-yyyy` |
| `homeTaxValidity` | string | No | `dd-mm-yyyy` |
| `aitpValidity` | string | No | `dd-mm-yyyy` |
| `aitpAuthorizationValidity` | string | No | `dd-mm-yyyy` |
| `serviceOutDate` | string | No | `dd-mm-yyyy` |
| `remarks` | string | No | Max 500 chars |
| `lastMaintenanceDate` | string | No | `dd-mm-yyyy` |

```json
{
  "busNumber": "TN-01-AB-1234",
  "engineNumber": "ENG123456",
  "chassisNumber": "CHS789012",
  "odometer": 120000,
  "insuranceValidity": "31-12-2026",
  "purchaseDate": "01-06-2020"
}
```

**Response `201`** — created bus with formatted dates.

**Errors:** `409` if `busNumber` already exists.

---

### Update bus

```http
PATCH /master/buses/:busId
```

**Permission:** `manage_buses`

**Body** — at least one field from the create schema (all optional on update).

**Response `200`**

---

### Delete bus

```http
DELETE /master/buses/:busId
```

**Permission:** `manage_buses`

**Response `200`**

```json
{
  "success": true,
  "data": { "id": "clx..." }
}
```

**Errors:** `409` if the bus is referenced by tickets.

---

## 3. Spare tank creation

### List spare tanks

```http
GET /master/spare-tanks?page=1&limit=20
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "clx...",
        "busNumber": "BUS-1001",
        "ownerName": "Ravi Kumar",
        "createdAt": "2026-05-24T10:00:00.000Z",
        "updatedAt": "2026-05-24T10:00:00.000Z"
      }
    ]
  },
  "meta": { "page": 1, "limit": 20, "total": 5, "totalPages": 1 }
}
```

---

### Create spare tank

```http
POST /master/spare-tanks
```

**Permission:** `manage_master`

**Body**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `busNumber` | string | Yes | Any bus number (1–50 chars); does not need to exist in Buses master |
| `ownerName` | string | Yes | 1–120 chars |

```json
{
  "busNumber": "BUS-1001",
  "ownerName": "Ravi Kumar"
}
```

**Response `201`**

**Errors:** none specific to bus lookup — any valid bus number is accepted.

---

### Update spare tank

```http
PATCH /master/spare-tanks/:spareTankId
```

**Permission:** `manage_master`

**Body** — at least one of:

| Field | Type |
|-------|------|
| `busNumber` | string |
| `ownerName` | string |

---

### Delete spare tank

```http
DELETE /master/spare-tanks/:spareTankId
```

**Permission:** `manage_master`

---

## 4. Service number

### List service numbers

```http
GET /master/service-numbers?page=1&limit=20
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "clx...",
        "serviceNo": "SRV-101",
        "from": "Chennai",
        "to": "Bangalore",
        "via": "Vellore",
        "parkingAmount": "500.00",
        "driverOneBeta": "1500.00",
        "driverTwoBeta": "1200.00",
        "helperBeta": "800.00",
        "conductorBeta": "900.00",
        "distance": "350.00",
        "optDriver": "Optional Driver Name",
        "optHelper": "Optional Helper Name",
        "remarks": "Night service",
        "serviceFor": {
          "id": "clx...",
          "serviceFor": "Express"
        },
        "createdAt": "2026-05-24T10:00:00.000Z",
        "updatedAt": "2026-05-24T10:00:00.000Z"
      }
    ]
  },
  "meta": { "page": 1, "limit": 20, "total": 10, "totalPages": 1 }
}
```

> **Note:** Decimal amount fields are returned as strings from Prisma (e.g. `"500.00"`). Send them as numbers in requests; the API coerces them.

---

### Create service number

```http
POST /master/service-numbers
```

**Permission:** `manage_master`

**Body**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `serviceForId` | string | Yes | Must exist in Service For |
| `serviceNo` | string | Yes | 1–50 chars, unique |
| `from` | string | Yes | 1–120 chars |
| `to` | string | Yes | 1–120 chars |
| `via` | string | Yes | 1–120 chars |
| `parkingAmount` | number | Yes | ≥ 0 |
| `driverOneBeta` | number | Yes | ≥ 0 |
| `driverTwoBeta` | number | Yes | ≥ 0 |
| `helperBeta` | number | Yes | ≥ 0 |
| `conductorBeta` | number | Yes | ≥ 0 |
| `distance` | number | Yes | ≥ 0 |
| `optDriver` | string | Yes | 1–120 chars |
| `optHelper` | string | Yes | 1–120 chars |
| `remarks` | string | Yes | 1–500 chars |

```json
{
  "serviceForId": "clx...",
  "serviceNo": "SRV-101",
  "from": "Chennai",
  "to": "Bangalore",
  "via": "Vellore",
  "parkingAmount": 500,
  "driverOneBeta": 1500,
  "driverTwoBeta": 1200,
  "helperBeta": 800,
  "conductorBeta": 900,
  "distance": 350,
  "optDriver": "John",
  "optHelper": "Mike",
  "remarks": "Regular route"
}
```

**Response `201`**

**Errors:** `404` invalid `serviceForId` · `409` duplicate `serviceNo`

---

### Update / delete service number

```http
PATCH /master/service-numbers/:serviceNumberId
DELETE /master/service-numbers/:serviceNumberId
```

**Permission:** `manage_master`

Update body: any subset of create fields (at least one required).

---

## 5. Drivers

### List drivers

```http
GET /master/drivers?page=1&limit=20
```

Returns all fields **except** document blobs. Dates are `dd-mm-yyyy`.

**Response item shape (abbreviated)**

```json
{
  "id": "clx...",
  "driverIdNumber": "D0140",
  "aadharName": "Full Name As Per Aadhar",
  "dlName": "Name As Per DL",
  "dateOfBirth": "15-08-1990",
  "mobileNumber": "9876543210",
  "alternateMobile": null,
  "emergencyNumber": "9876543211",
  "aadharNumber": "123456789012",
  "dlNumber": "DL1234567890",
  "accountHolderName": "Account Holder",
  "accountNumber": "1234567890",
  "bankName": "State Bank",
  "branchName": "Main Branch",
  "ifscCode": "SBIN0001234",
  "upiId": "name@upi",
  "dlIssueDate": "01-01-2020",
  "dlExpiryDate": "01-01-2030",
  "transportIssueDate": "01-01-2020",
  "transportValidFrom": "01-01-2020",
  "transportValidTo": "01-01-2030",
  "dateOfJoining": "01-06-2022",
  "dateOfLeaving": null,
  "referenceName": "Reference Person",
  "remarks": null,
  "createdAt": "2026-05-24T10:00:00.000Z",
  "updatedAt": "2026-05-24T10:00:00.000Z"
}
```

---

### Get driver (with documents)

```http
GET /master/drivers/:driverId
```

Same as list item **plus** base64 document fields:

```json
{
  "...": "...",
  "aadharCardFront": "<base64>",
  "aadharCardBack": "<base64>",
  "dlFront": "<base64>",
  "dlBack": "<base64>",
  "upiScanner": "<base64 or null>"
}
```

---

### Create driver

```http
POST /master/drivers
```

**Permission:** `manage_master`

**Body**

| Field | Required | Validation |
|-------|----------|------------|
| `aadharName` | Yes | 1–120 chars |
| `dlName` | Yes | 1–120 chars |
| `dateOfBirth` | Yes | `dd-mm-yyyy` |
| `mobileNumber` | Yes | Exactly 10 digits |
| `alternateMobile` | No | Exactly 10 digits |
| `emergencyNumber` | No | Exactly 10 digits |
| `aadharNumber` | Yes | Exactly 12 digits, unique |
| `dlNumber` | Yes | 1–30 chars, unique |
| `accountHolderName` | Yes | 1–120 chars |
| `accountNumber` | Yes | 1–30 chars |
| `bankName` | Yes | 1–120 chars |
| `branchName` | Yes | 1–120 chars |
| `ifscCode` | Yes | Valid IFSC (e.g. `SBIN0001234`) |
| `upiId` | No | 1–120 chars |
| `dlIssueDate` | Yes | `dd-mm-yyyy` |
| `dlExpiryDate` | Yes | `dd-mm-yyyy` |
| `transportIssueDate` | Yes | `dd-mm-yyyy` |
| `transportValidFrom` | Yes | `dd-mm-yyyy` |
| `transportValidTo` | Yes | `dd-mm-yyyy` |
| `dateOfJoining` | Yes | `dd-mm-yyyy` |
| `dateOfLeaving` | No | `dd-mm-yyyy` or `null` |
| `referenceName` | Yes | 1–120 chars |
| `remarks` | No | Max 500 chars |
| `aadharCardFront` | Yes | Base64 string |
| `aadharCardBack` | Yes | Base64 string |
| `dlFront` | Yes | Base64 string |
| `dlBack` | Yes | Base64 string |
| `upiScanner` | No | Base64 string |

**Response `201`** — full driver object including `driverIdNumber` and documents.

**Errors:** `409` duplicate `aadharNumber` or `dlNumber`

---

### Update driver

```http
PATCH /master/drivers/:driverId
```

**Permission:** `manage_master`

Any subset of create fields (at least one). Omit document fields to keep existing files unchanged.

To clear optional documents on update, send `"upiScanner": null`.

---

### Delete driver

```http
DELETE /master/drivers/:driverId
```

**Permission:** `manage_master`

---

## 6. Helpers

Same patterns as Drivers. Differences:

| Field | Notes |
|-------|-------|
| `helperIdNumber` | Auto-generated (`H0001`) — read-only |
| `nickName` | Required |
| `reference` | Required (not `referenceName`) |
| `alternateNumber` | Optional 10-digit mobile |
| `emergencyMobile` | Optional 10-digit mobile |
| Documents | `aadharCardFront`, `aadharCardBack`, optional `upiScanner` only |

### Endpoints

```http
GET    /master/helpers
GET    /master/helpers/:helperId
POST   /master/helpers
PATCH  /master/helpers/:helperId
DELETE /master/helpers/:helperId
```

---

## 7. Office staff

Same patterns as Helpers. Differences:

| Field | Notes |
|-------|-------|
| `staffIdNumber` | Auto-generated (`S0001`) — read-only |
| `designation` | Required |
| `nickName` | Required |
| `referenceName` | Required |
| `alternativeMobile` | Optional 10-digit mobile |
| `emergencyContact` | Optional 10-digit mobile |
| Documents | `aadharCardFront`, `aadharCardBack`, optional `upiScanner` |

### Endpoints

```http
GET    /master/office-staff
GET    /master/office-staff/:staffId
POST   /master/office-staff
PATCH  /master/office-staff/:staffId
DELETE /master/office-staff/:staffId
```

---

## Validation reference

Quick reference for client-side validation (mirrors server Zod rules):

| Rule | Pattern / constraint |
|------|----------------------|
| Date | `^(0[1-9]\|[12]\d\|3[01])-(0[1-9]\|1[0-2])-\d{4}$` |
| Mobile | `^\d{10}$` |
| Aadhar | `^\d{12}$` |
| IFSC | `^[A-Z]{4}0[A-Z0-9]{6}$` (server uppercases input) |
| Decimal amounts | Number ≥ 0 |
| Base64 document | Non-empty valid base64 |
| Bus number | Trimmed; server stores uppercase |

---

## Frontend integration notes

### Suggested API client structure

```text
/api/v1/master/
  service-for/
  buses/
  spare-tanks/
  service-numbers/
  drivers/
  helpers/
  office-staff/
```

### Route map (all endpoints)

| Method | Path | Permission |
|--------|------|------------|
| `GET` | `/master/service-for` | Auth |
| `POST` | `/master/service-for` | manage_master |
| `PATCH` | `/master/service-for/:serviceForId` | manage_master |
| `DELETE` | `/master/service-for/:serviceForId` | manage_master |
| `GET` | `/master/buses` | Auth |
| `GET` | `/master/buses/bus-numbers` | Auth |
| `GET` | `/master/buses/:busId` | Auth |
| `GET` | `/master/buses/:busId/tickets` | Auth |
| `POST` | `/master/buses` | manage_buses |
| `PATCH` | `/master/buses/:busId` | manage_buses |
| `DELETE` | `/master/buses/:busId` | manage_buses |
| `GET` | `/master/spare-tanks` | Auth |
| `POST` | `/master/spare-tanks` | manage_master |
| `PATCH` | `/master/spare-tanks/:spareTankId` | manage_master |
| `DELETE` | `/master/spare-tanks/:spareTankId` | manage_master |
| `GET` | `/master/service-numbers` | Auth |
| `POST` | `/master/service-numbers` | manage_master |
| `PATCH` | `/master/service-numbers/:serviceNumberId` | manage_master |
| `DELETE` | `/master/service-numbers/:serviceNumberId` | manage_master |
| `GET` | `/master/drivers` | Auth |
| `GET` | `/master/drivers/:driverId` | Auth |
| `POST` | `/master/drivers` | manage_master |
| `PATCH` | `/master/drivers/:driverId` | manage_master |
| `DELETE` | `/master/drivers/:driverId` | manage_master |
| `GET` | `/master/helpers` | Auth |
| `GET` | `/master/helpers/:helperId` | Auth |
| `POST` | `/master/helpers` | manage_master |
| `PATCH` | `/master/helpers/:helperId` | manage_master |
| `DELETE` | `/master/helpers/:helperId` | manage_master |
| `GET` | `/master/office-staff` | Auth |
| `GET` | `/master/office-staff/:staffId` | Auth |
| `POST` | `/master/office-staff` | manage_master |
| `PATCH` | `/master/office-staff/:staffId` | manage_master |
| `DELETE` | `/master/office-staff/:staffId` | manage_master |

### Breaking change from earlier backend versions

Bus and Master CRUD previously lived at `/api/v1/buses`, `/api/v1/service-for`, etc.  
**All Master APIs are now under `/api/v1/master/...`**. Update all frontend API paths accordingly.

Ticket creation (`POST /tickets`) still accepts `busNumber` and auto-creates a minimal bus record if needed — that flow is unchanged.

### UI recommendations

1. **Master landing page** — tabs or sidebar for each sub-module.
2. **Service Number form** — load Service For dropdown from `GET /master/service-for`.
3. **Spare Tank form** — free-text bus number input (optional autocomplete from `GET /master/buses/bus-numbers`).
4. **Employee forms** — use date pickers formatted as `dd-mm-yyyy` before submit.
5. **Employee list** — paginate; fetch detail (with documents) only on view/edit.
6. **Delete confirmations** — show API error message on `409` (referenced records).
7. **Role gating** — hide Create/Edit/Delete for workers; use permission probes or JWT role claims.

### TypeScript types (starter)

```typescript
type ApiSuccess<T> = { success: true; data: T };
type ApiPaginated<T> = ApiSuccess<{ items: T[] }> & {
  meta: { page: number; limit: number; total: number; totalPages: number };
};
type ApiError = {
  success: false;
  message: string;
  error: string;
  code: string;
  details?: { issues?: unknown[] };
  requestId?: string;
};

type ServiceFor = {
  id: string;
  serviceFor: string;
  createdAt: string;
  updatedAt: string;
};

type Bus = {
  id: string;
  busNumber: string;
  engineNumber: string;
  chassisNumber: string;
  purchaseDate: string | null;
  odometer: number;
  insuranceValidity: string;
  pollutionValidity: string | null;
  fcValidity: string | null;
  basePermitValidity: string | null;
  homeTaxValidity: string | null;
  aitpValidity: string | null;
  aitpAuthorizationValidity: string | null;
  serviceOutDate: string | null;
  remarks: string | null;
  lastMaintenanceDate: string | null;
  createdAt: string;
  updatedAt: string;
};
```

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-24 | Initial Master module release; all routes under `/master` prefix |
