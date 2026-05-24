# Notifications API

In-app notifications for ticket events, with optional email delivery. All notification endpoints require a valid JWT (`Authorization: Bearer <token>`).

**Base URL:** `{API_PREFIX}` (default `/api/v1`)

---

## Overview

When a ticket event occurs (create, assign, status change, reopen, comment), the backend:

1. Creates one **in-app notification** per recipient in the database.
2. Optionally sends an **email** to recipients who have an `email` on their profile (if SMTP is configured).

Notifications are **scoped to the logged-in user**. Admin, supervisor, and worker roles use the same endpoints; each user only sees their own notifications.

### Who gets notified

Recipients are built from:

- **Ticket stakeholders:** creator (`createdById`), current assignee (`assignedToId`), assigner (`assignedById`)
- **Plus** all active users with role `admin` or `supervisor`
- **Minus** the user who performed the action (actor)

Workers receive notifications only when they are stakeholders (e.g. assigned to the ticket). They do not receive global supervisor/admin broadcasts unless they hold one of those roles.

### Events that trigger notifications

| Ticket action | API | Notification `type` |
|---------------|-----|------------------------|
| Create ticket | `POST /tickets` | `ticket_created` |
| Assign / reassign | `POST /tickets/:ticketId/assign` | `ticket_assigned` |
| Status change | `PATCH /tickets/:ticketId/status` | `ticket_status_changed` or `ticket_closed` |
| Reopen | `POST /tickets/:ticketId/reopen` | `ticket_reopened` |
| Comment | `POST /tickets/:ticketId/comments` | `ticket_commented` |

Ticket delete does **not** generate notifications.

---

## Authentication

Every request must include:

```http
Authorization: Bearer <access_token>
```

Obtain a token via `POST /auth/login`.

---

## Endpoints

### List notifications

```http
GET /notifications
```

Returns a paginated list for the current user, newest first.

**Query parameters**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `page` | integer | `1` | Page number (min 1) |
| `limit` | integer | `20` | Page size (min 1, max 50) |
| `unreadOnly` | string | — | Set to `true` to return only unread items |

**Example**

```http
GET /api/v1/notifications?page=1&limit=20&unreadOnly=true
```

**Response `200`**

```json
{
  "success": true,
  "data": [
    {
      "id": "clx...",
      "type": "ticket_commented",
      "title": "New comment on #1042 — Brake issue",
      "message": "Jane Supervisor commented on #1042 — Brake issue. \"Waiting for parts\"",
      "ticketId": "clx...",
      "ticketNumber": 1042,
      "activityLogId": "clx...",
      "readAt": null,
      "createdAt": "2026-05-18T10:30:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "totalPages": 1
  }
}
```

| Field | Description |
|-------|-------------|
| `readAt` | `null` = unread; ISO timestamp when marked read |
| `activityLogId` | Links to timeline entry when applicable; may be `null` |
| `ticketNumber` | 4-digit ticket number for UI display / navigation |

**Errors**

| Status | When |
|--------|------|
| `400` | Invalid query parameters |
| `401` | Missing or invalid token |

---

### Unread count

```http
GET /notifications/unread-count
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "count": 3
  }
}
```

Use this for badge counts in the UI without loading the full list.

---

### Mark one notification as read

```http
PATCH /notifications/:notificationId/read
```

**Path parameters**

| Name | Description |
|------|-------------|
| `notificationId` | Notification CUID |

Only notifications owned by the current user can be updated.

**Response `200` (newly read)**

```json
{
  "success": true,
  "data": {
    "id": "clx...",
    "type": "ticket_assigned",
    "title": "Ticket assigned #1042 — Brake issue",
    "message": "Admin User assigned #1042 — Brake issue to Worker One.",
    "ticketId": "clx...",
    "ticketNumber": 1042,
    "activityLogId": "clx...",
    "readAt": "2026-05-18T10:35:00.000Z",
    "createdAt": "2026-05-18T10:30:00.000Z"
  }
}
```

If the notification was already read, returns `200` with `id` and existing `readAt` only.

**Errors**

| Status | When |
|--------|------|
| `400` | Invalid notification id |
| `401` | Missing or invalid token |
| `404` | Notification not found or not owned by user |

---

### Mark all as read

```http
PATCH /notifications/read-all
```

Marks every unread notification for the current user as read.

**Response `200`**

```json
{
  "success": true,
  "data": {
    "updatedCount": 7
  }
}
```

---

## Notification types

| `type` | Meaning |
|--------|---------|
| `ticket_created` | New ticket was created |
| `ticket_assigned` | Ticket assigned or reassigned to a worker |
| `ticket_status_changed` | Status updated (not closed) |
| `ticket_closed` | Ticket closed |
| `ticket_reopened` | Ticket reopened from resolved/closed |
| `ticket_commented` | Comment added on ticket |

---

## Email delivery (optional)

In-app notifications always work without SMTP. Email is sent only when:

1. `SMTP_HOST` and `EMAIL_FROM` are set in the server environment, and  
2. The recipient has a non-null `email` on their user profile.

### Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SMTP_HOST` | Yes* | — | SMTP server hostname |
| `EMAIL_FROM` | Yes* | — | Sender email address |
| `SMTP_PORT` | No | `587` | SMTP port |
| `SMTP_SECURE` | No | `false` | `true` for SSL (e.g. port 465) |
| `SMTP_USER` | No | — | SMTP username |
| `SMTP_PASS` | No | — | SMTP password / app password |
| `APP_PUBLIC_URL` | No | — | Frontend base URL for “View ticket” links |

\*Both required for email to be enabled.

**Example (Gmail app password)**

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=your@gmail.com
APP_PUBLIC_URL=http://localhost:5173
```

Email failures are logged and do **not** fail the ticket API. Restart the server after changing `.env`.

### User email

Users must set email via profile:

```http
PATCH /profile
Content-Type: application/json

{
  "email": "user@example.com"
}
```

---

## Frontend integration notes

1. **Poll or refresh** `GET /notifications/unread-count` for badge updates (no WebSocket in v1).
2. **Navigate to ticket** using `ticketId` or `ticketNumber` from the notification payload.
3. **Mark read** when the user opens a notification: `PATCH /notifications/:id/read`.
4. **Filter unread** in the inbox with `?unreadOnly=true`.
5. Register the **read-all** route before treating `:notificationId` as a dynamic segment in client routers (server already orders routes correctly).

---

## OpenAPI

Interactive docs (when `SWAGGER_ENABLED=true`):

- `GET /docs`
- `GET /openapi.json`

Look for the **Notifications** tag.

---

## Related ticket APIs

These actions create notifications automatically; no separate “send notification” endpoint exists.

| Method | Path |
|--------|------|
| `POST` | `/tickets` |
| `POST` | `/tickets/:ticketId/assign` |
| `PATCH` | `/tickets/:ticketId/status` |
| `POST` | `/tickets/:ticketId/reopen` |
| `POST` | `/tickets/:ticketId/comments` |

Timeline for a ticket: `GET /tickets/:ticketId/timeline`
