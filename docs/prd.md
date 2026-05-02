# 🚌 Bus Issue Ticketing System - Product Requirement Document (PRD)

## 📌 1. Overview

The Bus Issue Ticketing System is designed to streamline the process of identifying, tracking, assigning, and resolving issues found in buses operated by a travels company.

Supervisors inspect buses and raise tickets for identified issues. These tickets are assigned to workers who resolve them. The system provides visibility into ticket status, operational performance, and bus health history through dashboards.

---

## 🎯 2. Objectives

- Enable structured issue reporting for buses
- Track ticket lifecycle efficiently
- Provide real-time visibility into issue status
- Monitor overdue tickets with time tracking
- Maintain historical data for each bus
- Improve operational efficiency and accountability

---

## 👥 3. User Roles & Permissions

### 3.1 Supervisor
- Create tickets
- Assign tickets to workers
- Define expected resolution time (SLA)
- View dashboard and reports
- View bus history

### 3.2 Worker
- View assigned tickets
- Update ticket status
- Add resolution notes

### 3.3 Admin
- Manage users (supervisor, worker)
- Configure categories
- System-level monitoring

---

## 🔄 4. Ticket Lifecycle

Each ticket progresses through the following states:

1. Created
2. Assigned
3. In Progress
4. Resolved
5. Closed
6. Reopened (if issue persists)

---

## ⚠️ 5. Priority & Severity

Each ticket must include:

### Severity Levels:
- Critical
- High
- Medium
- Low

### Priority Levels:
- P1 (Immediate)
- P2 (High)
- P3 (Normal)

---

## ⏱️ 6. SLA & Overdue Tracking

### 6.1 SLA Definition
- Supervisor sets expected resolution time during ticket creation

### 6.2 Overdue Logic
- A ticket is marked **Overdue** if: Current Time > SLA Due Time AND Status != Closed


### 6.3 Overdue Metrics
- Overdue duration (e.g., "2 hours overdue")
- Average overdue time
- Overdue ticket count

---

## 🧑‍🔧 7. Ticket Assignment

- Supervisor assigns ticket to a worker manually
- Worker sees assigned tickets in their dashboard
- No auto-assignment in current version (future scope)

---

## 🚌 8. Bus Management

Each bus should maintain:

- Bus Number (Unique ID)
- Last Maintenance Date
- Full Issue History (linked tickets)

### 8.1 Bus History View
- List of all past tickets
- Status of each issue
- Resolution timelines

---

## 📊 9. Dashboard & Reporting

### 9.1 Ticket Metrics
- Total tickets
- Tickets by status:
- Created
- In Progress
- Overdue
- Completed
- Tickets resolved per day
- Average resolution time

### 9.2 Worker Metrics
- Tickets assigned per worker
- Tickets resolved per worker

### 9.3 Bus Metrics
- Issues per bus
- Most problematic buses

---

## 🧩 10. Issue Categorization

Each ticket must include a category:

- Engine
- Electrical
- Body Damage
- Tires
- Interior
- Other

---

## 📝 11. Audit Trail & History

Every ticket should track:

- Created By
- Assigned By
- Status Changes (with timestamps)
- Comments / Notes

### 11.1 Activity Log Example:
[10:00 AM] Ticket Created by Supervisor
[10:05 AM] Assigned to Worker A
[11:00 AM] Status changed to In Progress
[01:30 PM] Status changed to Resolved
---

## 🔐 12. Access Control

| Feature                | Supervisor | Worker | Admin |
|----------------------|------------|--------|--------|
| Create Ticket        | ✅         | ❌     | ✅     |
| Assign Ticket        | ✅         | ❌     | ✅     |
| Update Status        | ❌         | ✅     | ✅     |
| View Dashboard       | ✅         | ✅     | ✅     |
| Manage Users         | ❌         | ❌     | ✅     |

---

## 13. Edge Cases & Scenarios
Ticket not assigned → should still appear in dashboard
Worker inactive → supervisor must reassign manually
Ticket reopened → SLA recalculation required
Missing SLA → system should enforce required field

---

## 14. Success Metrics
% of tickets resolved within SLA
Average resolution time
Reduction in repeated issues per bus
Worker efficiency (tickets/day)

---
## 15. Conclusion

This system aims to evolve from a simple ticket tracker into a structured operational tool that improves maintenance efficiency, accountability, and decision-making for bus operations.