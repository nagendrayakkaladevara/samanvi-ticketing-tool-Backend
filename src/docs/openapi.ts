import { env } from "../config/env";

export function buildOpenApiSpec() {
  return {
    openapi: "3.0.3",
    info: {
      title: "Samanvi Ticketing Tool API",
      version: "0.1.0",
      description: "Backend API for the bus issue ticketing system.",
    },
    servers: [{ url: env.apiPrefix }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    tags: [
      { name: "Health" },
      { name: "Auth" },
      { name: "Profile" },
      { name: "AI" },
      { name: "Tickets" },
      { name: "Access Control" },
      { name: "Workers" },
      { name: "Users" },
      { name: "Issue Categories" },
      { name: "Buses" },
      { name: "Dashboard" },
      { name: "Metrics" },
    ],
    paths: {
      "/health": {
        get: {
          tags: ["Health"],
          summary: "Health check",
          responses: {
            "200": {
              description: "OK",
            },
          },
        },
      },
      "/auth/login": {
        post: {
          tags: ["Auth"],
          summary: "Login and receive JWT",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["username", "password"],
                  properties: {
                    username: { type: "string" },
                    password: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Authenticated",
            },
            "401": {
              description: "Invalid credentials",
            },
          },
        },
      },
      "/auth/me": {
        get: {
          tags: ["Auth"],
          summary: "Get current user from JWT",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "Current user",
            },
            "401": {
              description: "Missing/invalid token",
            },
          },
        },
      },
      "/profile": {
        get: {
          tags: ["Profile"],
          summary: "Get current user profile from database",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "Profile including email and timestamps",
            },
            "401": {
              description: "Missing/invalid token or inactive user",
            },
          },
        },
        patch: {
          tags: ["Profile"],
          summary: "Update current user profile (displayName, email, password)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  description:
                    "At least one of displayName, email, or password. When password is set, currentPassword is required.",
                  properties: {
                    displayName: { type: "string" },
                    email: { type: "string", nullable: true },
                    password: { type: "string" },
                    currentPassword: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description:
                "Updated profile; accessToken present when displayName changed",
            },
            "400": { description: "Invalid payload" },
            "401": {
              description:
                "Missing/invalid token, inactive user, or wrong currentPassword",
            },
            "409": { description: "Email conflict" },
          },
        },
      },
      "/ai/enhance-ticket-description": {
        post: {
          tags: ["AI"],
          summary: "Enhance ticket description in English and Telugu",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["description"],
                  properties: {
                    description: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Enhanced bilingual description text" },
            "400": { description: "Invalid payload" },
            "401": { description: "Missing/invalid token" },
            "502": { description: "AI provider failure" },
          },
        },
      },
      "/tickets": {
        get: {
          tags: ["Tickets"],
          summary:
            "List tickets (role-aware visibility, includes overdue metadata and 4-digit ticketNumber)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "status",
              required: false,
              schema: {
                type: "string",
                enum: [
                  "created",
                  "assigned",
                  "in_progress",
                  "blocked",
                  "resolved",
                  "closed",
                  "reopened",
                ],
              },
            },
            {
              in: "query",
              name: "severity",
              required: false,
              schema: { type: "string", enum: ["critical", "high", "medium", "low"] },
            },
            {
              in: "query",
              name: "priority",
              required: false,
              schema: { type: "string", enum: ["p1", "p2", "p3"] },
            },
            {
              in: "query",
              name: "categoryId",
              required: false,
              schema: { type: "string" },
            },
            {
              in: "query",
              name: "busId",
              required: false,
              schema: { type: "string" },
            },
            {
              in: "query",
              name: "assignedToId",
              required: false,
              schema: { type: "string" },
            },
            {
              in: "query",
              name: "includeUnassigned",
              required: false,
              schema: { type: "boolean", default: true },
            },
          ],
          responses: {
            "200": { description: "Tickets list" },
            "401": { description: "Missing/invalid token" },
          },
        },
        post: {
          tags: ["Tickets"],
          summary: "Create ticket (Supervisor/Admin)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: [
                    "title",
                    "description",
                    "severity",
                    "priority",
                    "categoryId",
                    "busNumber",
                    "slaDueAt",
                  ],
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    severity: {
                      type: "string",
                      enum: ["critical", "high", "medium", "low"],
                    },
                    priority: { type: "string", enum: ["p1", "p2", "p3"] },
                    categoryId: { type: "string" },
                    busNumber: {
                      type: "string",
                      description:
                        "Matched case-insensitively; if no bus exists, one is created with this value stored in uppercase.",
                    },
                    slaDueAt: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Ticket created" },
            "400": { description: "Invalid payload / invalid bus or category" },
            "403": { description: "Forbidden by role matrix" },
          },
        },
      },
      "/tickets/{ticketId}": {
        get: {
          tags: ["Tickets"],
          summary:
            "Get ticket by id (role-aware visibility, includes overdue metadata and 4-digit ticketNumber)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "ticketId",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": { description: "Ticket details" },
            "404": { description: "Ticket not found" },
          },
        },
      },
      "/tickets/search": {
        get: {
          tags: ["Tickets"],
          summary: "Search ticket by 4-digit ticketNumber",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "ticketNumber",
              required: true,
              schema: {
                type: "string",
                pattern: "^\\d{4}$",
              },
              description: "Exactly 4 digits (1000-9999), for example 1007.",
            },
          ],
          responses: {
            "200": { description: "Ticket details for matching ticket number" },
            "400": { description: "Invalid ticketNumber query param" },
            "404": { description: "Ticket not found" },
            "401": { description: "Missing/invalid token" },
          },
        },
      },
      "/tickets/{ticketId}/timeline": {
        get: {
          tags: ["Tickets"],
          summary: "Get ticket activity timeline",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "ticketId",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": { description: "Ticket activity timeline" },
            "404": { description: "Ticket not found" },
          },
        },
      },
      "/tickets/{ticketId}/assign": {
        post: {
          tags: ["Tickets"],
          summary: "Assign ticket (Supervisor/Admin)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "ticketId",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["assignedToId"],
                  properties: {
                    assignedToId: { type: "string" },
                    note: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Ticket assigned" },
            "400": { description: "Invalid payload or assignment target" },
            "404": { description: "Ticket not found" },
            "403": { description: "Forbidden by role matrix" },
          },
        },
      },
      "/tickets/my": {
        get: {
          tags: ["Tickets"],
          summary: "List my assigned tickets (Worker only)",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Assigned tickets list" },
            "403": { description: "Only workers can access this endpoint" },
          },
        },
      },
      "/tickets/{ticketId}/status": {
        patch: {
          tags: ["Tickets"],
          summary: "Update status (Worker/Admin)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "ticketId",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["status"],
                  properties: {
                    status: {
                      type: "string",
                      enum: ["assigned", "in_progress", "blocked", "resolved", "closed"],
                    },
                    note: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Ticket status updated" },
            "400": { description: "Invalid transition or payload" },
            "404": { description: "Ticket not found" },
            "403": { description: "Forbidden by role matrix" },
          },
        },
      },
      "/tickets/{ticketId}/comments": {
        post: {
          tags: ["Tickets"],
          summary: "Add comment or resolution note",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "ticketId",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["note"],
                  properties: {
                    note: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Comment created" },
            "404": { description: "Ticket not found" },
          },
        },
      },
      "/tickets/{ticketId}/reopen": {
        post: {
          tags: ["Tickets"],
          summary: "Reopen resolved/closed ticket with recalculated SLA",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "ticketId",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["note"],
                  properties: {
                    note: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Ticket reopened" },
            "400": { description: "Invalid transition/payload" },
            "404": { description: "Ticket not found" },
          },
        },
      },
      "/dashboard": {
        get: {
          tags: ["Dashboard"],
          summary:
            "Dashboard metrics (ticket, worker, bus); workers see assigned-to-me scope. ticketMetrics includes overdueCount and averageOverdueTimeMs (mean ms past SLA for non-closed overdue tickets, PRD §6.3).",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "days",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 90, default: 14 },
              description: "Window for resolved-per-day series (UTC dates)",
            },
          ],
          responses: {
            "200": { description: "Aggregated metrics" },
            "400": { description: "Invalid query" },
            "403": { description: "Forbidden by role matrix" },
          },
        },
      },
      "/dashboard/admin-summary": {
        get: {
          tags: ["Dashboard"],
          summary:
            "Admin dashboard summary sections: snapshot, queue, SLA, speed, and agent leaderboard (workers see assigned-to-me scope)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "days",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 90, default: 14 },
              description: "Rolling UTC window length used for new/resolved/speed summaries",
            },
          ],
          responses: {
            "200": { description: "Admin dashboard summary payload" },
            "400": { description: "Invalid query" },
            "403": { description: "Forbidden by role matrix" },
          },
        },
      },
      "/metrics/success": {
        get: {
          tags: ["Metrics"],
          summary:
            "PRD §14 success metrics: SLA compliance, resolution-time stats, repeated bus+category issues, worker throughput",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "days",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 366, default: 30 },
              description:
                "Rolling UTC window length: resolutions/SLA/efficiency use resolvedAt; repeats use createdAt",
            },
          ],
          responses: {
            "200": { description: "Success metrics payload" },
            "400": { description: "Invalid query" },
            "403": { description: "Forbidden by role matrix" },
          },
        },
      },
      "/users": {
        get: {
          tags: ["Users"],
          summary: "List users (Admin only)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "includeInactive",
              required: false,
              schema: { type: "boolean", default: false },
            },
            {
              in: "query",
              name: "roleCode",
              required: false,
              schema: { type: "string", enum: ["supervisor", "worker"] },
            },
          ],
          responses: {
            "200": { description: "Users list" },
            "403": { description: "Forbidden by role matrix" },
          },
        },
        post: {
          tags: ["Users"],
          summary: "Create user (Admin only)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["username", "password", "displayName", "roleCode"],
                  properties: {
                    username: { type: "string" },
                    password: { type: "string" },
                    displayName: { type: "string" },
                    email: { type: "string", format: "email" },
                    roleCode: { type: "string", enum: ["supervisor", "worker"] },
                    isActive: { type: "boolean", default: true },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "User created" },
            "409": { description: "Username/email already exists" },
            "403": { description: "Forbidden by role matrix" },
          },
        },
      },
      "/workers": {
        get: {
          tags: ["Workers"],
          summary: "List active workers (Supervisor/Admin)",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Workers list" },
            "403": { description: "Forbidden by role matrix" },
          },
        },
      },
      "/users/{userId}": {
        get: {
          tags: ["Users"],
          summary: "Get user by id (Admin only)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "userId",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": { description: "User details" },
            "404": { description: "User not found" },
            "403": { description: "Forbidden by role matrix" },
          },
        },
        patch: {
          tags: ["Users"],
          summary: "Update user (Admin only)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "userId",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    username: { type: "string" },
                    password: { type: "string" },
                    displayName: { type: "string" },
                    email: {
                      oneOf: [{ type: "string", format: "email" }, { type: "null" }],
                    },
                    roleCode: { type: "string", enum: ["supervisor", "worker"] },
                    isActive: { type: "boolean" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "User updated" },
            "404": { description: "User not found" },
            "409": { description: "Username/email already exists" },
            "403": { description: "Forbidden by role matrix" },
          },
        },
        delete: {
          tags: ["Users"],
          summary: "Delete user (Admin only)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "userId",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": { description: "User deleted" },
            "404": { description: "User not found" },
            "403": { description: "Forbidden by role matrix" },
          },
        },
      },
      "/issue-categories": {
        get: {
          tags: ["Issue Categories"],
          summary: "List issue categories",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "includeInactive",
              required: false,
              schema: { type: "boolean", default: false },
            },
          ],
          responses: {
            "200": { description: "Issue categories list" },
            "401": { description: "Missing/invalid token" },
          },
        },
        post: {
          tags: ["Issue Categories"],
          summary: "Create issue category (Admin only)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name"],
                  properties: {
                    name: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Issue category created" },
            "403": { description: "Forbidden by role matrix" },
          },
        },
      },
      "/issue-categories/{categoryId}": {
        patch: {
          tags: ["Issue Categories"],
          summary: "Update issue category (Admin only)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "categoryId",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    isActive: { type: "boolean" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Issue category updated" },
            "403": { description: "Forbidden by role matrix" },
            "404": { description: "Issue category not found" },
          },
        },
      },
      "/buses": {
        get: {
          tags: ["Buses"],
          summary: "List buses",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Buses list" },
            "401": { description: "Missing/invalid token" },
          },
        },
        post: {
          tags: ["Buses"],
          summary: "Create bus (Supervisor/Admin)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["busNumber"],
                  properties: {
                    busNumber: { type: "string" },
                    lastMaintenanceDate: {
                      type: "string",
                      format: "date-time",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Bus created" },
            "403": { description: "Forbidden by role matrix" },
          },
        },
      },
      "/buses/{busId}/tickets": {
        get: {
          tags: ["Buses"],
          summary: "Bus ticket history (timeline excerpt per ticket); workers see only their assignments",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "busId",
              required: true,
              schema: { type: "string" },
            },
            {
              in: "query",
              name: "limit",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 500, default: 100 },
            },
          ],
          responses: {
            "200": { description: "Tickets for bus" },
            "404": { description: "Bus not found" },
          },
        },
      },
      "/buses/{busId}": {
        patch: {
          tags: ["Buses"],
          summary: "Update bus (Supervisor/Admin)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "busId",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    busNumber: { type: "string" },
                    lastMaintenanceDate: {
                      oneOf: [
                        { type: "string", format: "date-time" },
                        { type: "null" },
                      ],
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Bus updated" },
            "403": { description: "Forbidden by role matrix" },
            "404": { description: "Bus not found" },
          },
        },
      },
    },
  } as const;
}

