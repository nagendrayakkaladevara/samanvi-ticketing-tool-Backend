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
      { name: "Tickets" },
      { name: "Access Control" },
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
      "/tickets": {
        get: {
          tags: ["Tickets"],
          summary: "List tickets (role-aware visibility, includes overdue metadata)",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "status",
              required: false,
              schema: {
                type: "string",
                enum: ["created", "assigned", "in_progress", "resolved", "closed", "reopened"],
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
                    "busId",
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
                    busId: { type: "string" },
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
          summary: "Get ticket by id (role-aware visibility, includes overdue metadata)",
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
                      enum: ["assigned", "in_progress", "resolved", "closed"],
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

