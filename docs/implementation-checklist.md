# Implementation Order Checklist

Ordered execution from the current foundation (auth, schema, stubs) toward a PRD-complete MVP. Derived from [prd.md](./prd.md) and aligned with [development-order.md](./development-order.md).

---

## Phase 1 — Foundation closeout

- [ ] Confirm DB migrations and seed run clean (roles seeded; `DATABASE_URL` set)
- [ ] Finalize env validation for JWT, database, and production-safe defaults
- [ ] Keep health, auth, and docs routes stable as baseline

---

## Phase 2A — Reference masters (before ticket APIs)

- [ ] Build issue category module (admin create/list/update/deactivate)
- [ ] Seed PRD default categories: Engine, Electrical, Body Damage, Tires, Interior, Other
- [ ] Build bus module (create/list/update; unique bus number; `lastMaintenanceDate`)

---

## Phase 2B — Admin user management

- [ ] Admin-only user CRUD for supervisors and workers
- [ ] Support `isActive` toggle for workers (inactive reassignment rules later)
- [ ] Add or confirm access-control feature for **manage categories** (PRD section 3.3)

---

## Phase 3A — Ticket creation and retrieval

- [ ] Create ticket endpoint (Supervisor and Admin only)
- [ ] Enforce required fields: severity, priority, category, bus, SLA due time
- [ ] Ticket list and detail endpoints with role-aware filtering
- [ ] Unassigned tickets visible in supervisor/admin views (PRD section 13)

---

## Phase 3B — Assignment and worker workflow

- [ ] Assign ticket endpoint (Supervisor and Admin)
- [ ] Worker “my tickets” (assigned) list endpoint
- [ ] Status update endpoint for worker/admin lifecycle (`assigned` → `in_progress` → `resolved` → `closed`)
- [ ] Resolution notes / comments support

---

## Phase 3C — Reopen flow

- [ ] Reopen endpoint and valid transition rules
- [ ] SLA recalculation on reopen (PRD section 13)
- [ ] Track reopen count and resolution/close timestamps consistently

---

## Phase 4 — Audit trail and history

- [ ] Write activity logs on create, assign, status change, comment, reopen, close
- [ ] Persist created by, assigned by, from/to status, timestamps, notes
- [ ] Ticket timeline endpoint (or equivalent) for activity history

---

## Phase 5A — SLA and overdue

- [ ] Overdue rule: current time is after SLA due time and status is not closed (PRD section 6.2)
- [ ] Expose overdue duration where useful (PRD section 6.3)
- [ ] Reject creates/updates that omit required SLA (PRD section 13)

---

## Phase 5B — Bus history and dashboards

- [ ] Bus history: past tickets per bus; status and resolution timelines (PRD section 8.1)
- [ ] Ticket metrics: totals, by status, overdue, completed, resolved per day, average resolution time (PRD section 9.1)
- [ ] Worker metrics: assigned per worker, resolved per worker (PRD section 9.2)
- [ ] Bus metrics: issues per bus, most problematic buses (PRD section 9.3)

---

## Phase 6 — Edge cases and hardening

- [ ] Inactive worker: block or force reassignment per product rules (PRD section 13)
- [ ] Permission regression checks for Supervisor / Worker / Admin matrix (PRD section 12)
- [ ] Lifecycle and reopen transition validation tests
- [ ] Update OpenAPI / API docs for all new endpoints

---

## Phase 7 — Success metrics (PRD section 14)

- [ ] % of tickets resolved within SLA
- [ ] Average resolution time (reporting-grade)
- [ ] Repeated issues per bus (define rule, e.g. same bus + category or title pattern)
- [ ] Worker efficiency (e.g. tickets per day)

---

## Suggested build batches

Use these if you prefer shipping in vertical slices.

| Batch | Scope |
|-------|--------|
| **1** | Categories + buses + admin users |
| **2** | Ticket create/list/detail + assign + worker “my tickets” |
| **3** | Status flow + reopen + activity logs |
| **4** | Overdue/SLA + bus history + dashboards |
| **5** | Tests, docs, permission hardening |

---

## Notes

- **Rationale:** Masters and users exist before ticket creation; assignment and worker flows before SLA dashboards; metrics are read models over stable ticket and audit data.
- **Current repo state:** Prisma models cover much of the domain; HTTP handlers for real CRUD and reporting are still to be implemented—use this checklist to track that work.
