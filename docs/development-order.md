# Bus Issue Ticketing System — Development Order

Derived from [prd.md](./prd.md). Build bottom-up so auth, reference data, and ticket core exist before dashboards and metrics.

---

## Phase 1 — Foundation

1. **Project setup** — API structure, config, environment, error handling, logging.
2. **Database & migrations** — Schema for users, roles (Supervisor, Worker, Admin), shared enums as needed.
3. **Authentication & authorization** — Sessions or JWT; enforce role matrix (PRD §12).

---

## Phase 2 — Reference data

4. **Bus management** — CRUD or create/list; unique bus number; `last_maintenance_date` (PRD §8).
5. **Issue categories** — Seed or admin-configurable categories (PRD §10); Admin-only where required (PRD §3.3, §12).
6. **User management (Admin)** — Create/edit supervisors and workers; support inactive workers for later reassignment rules (PRD §13).

---

## Phase 3 — Core ticketing

7. **Ticket model & API** — Severity, priority, category, bus link, SLA due time (required — PRD §13); statuses per lifecycle (PRD §4).
8. **Ticket creation** — Supervisor and Admin (PRD §12); validate required SLA.
9. **Assignment** — Manual assign to worker; Assigned state; audit (Assigned By — PRD §11).
10. **Worker workflow** — List assigned tickets; status updates; resolution notes (PRD §3.2).
11. **Reopen flow** — Reopened state; SLA recalculation (PRD §13).

---

## Phase 4 — SLA, overdue, and audit

12. **SLA & overdue** — Overdue when current time > SLA due and status ≠ Closed (PRD §6.2); overdue duration for metrics (PRD §6.3).
13. **Activity / audit trail** — Created, assigned, status changes with timestamps, comments (PRD §11).

---

## Phase 5 — Visibility

14. **Bus history** — Past tickets per bus; status and resolution timelines (PRD §8.1).
15. **Dashboards & metrics** — Ticket, worker, and bus metrics (PRD §9.1–9.3); include unassigned tickets in supervisor/admin views (PRD §13).

---

## Phase 6 — Hardening & success metrics

16. **Edge cases** — Unassigned tickets visible; inactive worker handling; reopened SLA; permission regression checks (PRD §12–13).
17. **Success-oriented reporting** — SLA compliance %, average resolution time, and other PRD §14 indicators as needed beyond basic dashboards.

---

## Notes

- **Order rationale:** Roles and data model first; tickets and assignment before SLA/overdue and dashboards; metrics are read models over stable ticket + audit data.
- Admin category/user work can track closely with Phase 2 as long as buses, categories, and users exist before ticket creation.
