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
      { name: "Access Control" },
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
        post: {
          tags: ["Access Control"],
          summary: "Create ticket (Supervisor/Admin)",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Allowed" },
            "403": { description: "Forbidden by role matrix" },
          },
        },
      },
      "/tickets/{ticketId}/assign": {
        post: {
          tags: ["Access Control"],
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
          responses: {
            "200": { description: "Allowed" },
            "403": { description: "Forbidden by role matrix" },
          },
        },
      },
      "/tickets/{ticketId}/status": {
        patch: {
          tags: ["Access Control"],
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
          responses: {
            "200": { description: "Allowed" },
            "403": { description: "Forbidden by role matrix" },
          },
        },
      },
      "/dashboard": {
        get: {
          tags: ["Access Control"],
          summary: "View dashboard (all roles)",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Allowed" },
            "403": { description: "Forbidden by role matrix" },
          },
        },
      },
      "/users": {
        post: {
          tags: ["Access Control"],
          summary: "Manage users (Admin only)",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Allowed" },
            "403": { description: "Forbidden by role matrix" },
          },
        },
      },
    },
  } as const;
}

