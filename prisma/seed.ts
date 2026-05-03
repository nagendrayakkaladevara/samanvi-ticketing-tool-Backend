import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  RoleCode,
  TicketActivityType,
  TicketPriority,
  TicketSeverity,
  TicketStatus,
} from "@prisma/client";
import { Pool } from "pg";
import { hashPassword } from "../src/auth/password";

const SEED_TICKET_TITLE_PREFIX = "[Seed]";

const connectionString = process.env["DATABASE_URL"];

if (!connectionString) {
  throw new Error("DATABASE_URL is required for seeding");
}

const adapter = new PrismaPg(
  new Pool({
    connectionString,
  }),
);

const prisma = new PrismaClient({ adapter });

async function main() {
  const roles: Array<{ code: RoleCode; label: string }> = [
    { code: RoleCode.admin, label: "Admin" },
    { code: RoleCode.supervisor, label: "Supervisor" },
    { code: RoleCode.worker, label: "Worker" },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { label: role.label },
      create: {
        code: role.code,
        label: role.label,
      },
    });
  }

  const roleRows = await prisma.role.findMany({
    where: {
      code: {
        in: [RoleCode.admin, RoleCode.supervisor, RoleCode.worker],
      },
    },
    select: { id: true, code: true },
  });
  const roleIdByCode = new Map(roleRows.map((row) => [row.code, row.id]));

  const defaultUsers = [
    {
      username: "admin",
      password: "admin123",
      displayName: "Admin User",
      roleCode: RoleCode.admin,
    },
    {
      username: "supervisor",
      password: "supervisor123",
      displayName: "Supervisor User",
      roleCode: RoleCode.supervisor,
    },
    {
      username: "worker",
      password: "worker123",
      displayName: "Worker User",
      roleCode: RoleCode.worker,
    },
  ] as const;

  for (const user of defaultUsers) {
    const roleId = roleIdByCode.get(user.roleCode);
    if (!roleId) {
      throw new Error(`Missing role id for code ${user.roleCode}`);
    }

    const passwordHash = await hashPassword(user.password);

    await prisma.user.upsert({
      where: { username: user.username },
      update: {
        displayName: user.displayName,
        roleId,
        isActive: true,
        passwordHash,
      },
      create: {
        username: user.username,
        passwordHash,
        displayName: user.displayName,
        roleId,
      },
    });
  }

  const defaultCategories = [
    "Engine",
    "Electrical",
    "Body Damage",
    "Tires",
    "Interior",
    "Other",
  ] as const;

  for (const categoryName of defaultCategories) {
    await prisma.issueCategory.upsert({
      where: { name: categoryName },
      update: { isActive: true },
      create: {
        name: categoryName,
      },
    });
  }

  const seedBuses = [
    { busNumber: "BUS-1001", lastMaintenanceDate: new Date("2026-04-01T08:00:00.000Z") },
    { busNumber: "BUS-1002", lastMaintenanceDate: new Date("2026-04-15T14:30:00.000Z") },
    { busNumber: "BUS-2003", lastMaintenanceDate: null },
    { busNumber: "BUS-2004", lastMaintenanceDate: new Date("2026-03-20T11:00:00.000Z") },
  ] as const;

  for (const bus of seedBuses) {
    await prisma.bus.upsert({
      where: { busNumber: bus.busNumber },
      update: { lastMaintenanceDate: bus.lastMaintenanceDate },
      create: {
        busNumber: bus.busNumber,
        lastMaintenanceDate: bus.lastMaintenanceDate,
      },
    });
  }

  await prisma.ticket.deleteMany({
    where: { title: { startsWith: SEED_TICKET_TITLE_PREFIX } },
  });

  const [adminUser, supervisorUser, workerUser] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { username: "admin" }, select: { id: true } }),
    prisma.user.findUniqueOrThrow({
      where: { username: "supervisor" },
      select: { id: true },
    }),
    prisma.user.findUniqueOrThrow({ where: { username: "worker" }, select: { id: true } }),
  ]);

  const categoryMap = await prisma.issueCategory.findMany({
    where: { name: { in: [...defaultCategories] } },
    select: { id: true, name: true },
  });
  const categoryIdByName = new Map(categoryMap.map((c) => [c.name, c.id]));

  const busMap = await prisma.bus.findMany({
    where: { busNumber: { in: seedBuses.map((b) => b.busNumber) } },
    select: { id: true, busNumber: true },
  });
  const busIdByNumber = new Map(busMap.map((b) => [b.busNumber, b.id]));

  const dayMs = 86_400_000;
  const sla48h = BigInt(48 * dayMs);

  const seedTicketSpecs = [
    {
      title: `${SEED_TICKET_TITLE_PREFIX} Reported odd noise from rear axle`,
      description:
        "Driver reports grinding noise when turning left. Vehicle still operational; inspection requested.",
      status: TicketStatus.created,
      severity: TicketSeverity.medium,
      priority: TicketPriority.p2,
      busNumber: "BUS-1001" as const,
      categoryName: "Engine" as const,
      createdById: adminUser.id,
      assignedToId: null as string | null,
      assignedById: null as string | null,
      assignedAt: null as Date | null,
      slaDueAt: new Date(Date.now() + 2 * dayMs),
      slaDurationMs: sla48h,
      resolvedAt: null as Date | null,
      closedAt: null as Date | null,
      reopenedCount: 0,
      logs: [
        {
          actorUserId: adminUser.id,
          actionType: TicketActivityType.created,
          fromStatus: null as TicketStatus | null,
          toStatus: TicketStatus.created,
          note: "Ticket opened from daily inspection checklist.",
          offsetMs: 0,
        },
      ],
    },
    {
      title: `${SEED_TICKET_TITLE_PREFIX} Interior lighting failure — rear cabin`,
      description: "Several LED strips not powering on. Fuse panel checked; escalate to electrical.",
      status: TicketStatus.assigned,
      severity: TicketSeverity.low,
      priority: TicketPriority.p3,
      busNumber: "BUS-1002",
      categoryName: "Electrical",
      createdById: supervisorUser.id,
      assignedToId: workerUser.id,
      assignedById: supervisorUser.id,
      assignedAt: new Date("2026-05-01T09:15:00.000Z"),
      slaDueAt: new Date("2026-05-05T17:00:00.000Z"),
      slaDurationMs: sla48h,
      resolvedAt: null,
      closedAt: null,
      reopenedCount: 0,
      logs: [
        {
          actorUserId: supervisorUser.id,
          actionType: TicketActivityType.created,
          fromStatus: null,
          toStatus: TicketStatus.created,
          note: null,
          offsetMs: 0,
        },
        {
          actorUserId: supervisorUser.id,
          actionType: TicketActivityType.assigned,
          fromStatus: TicketStatus.created,
          toStatus: TicketStatus.assigned,
          note: "Assigned to on-shift technician.",
          offsetMs: 15 * 60_000,
        },
      ],
    },
    {
      title: `${SEED_TICKET_TITLE_PREFIX} Side panel dent — parking incident`,
      description: "Dent on passenger side near wheel well. Cosmetic plus potential moisture ingress.",
      status: TicketStatus.in_progress,
      severity: TicketSeverity.high,
      priority: TicketPriority.p2,
      busNumber: "BUS-2003",
      categoryName: "Body Damage",
      createdById: adminUser.id,
      assignedToId: workerUser.id,
      assignedById: supervisorUser.id,
      assignedAt: new Date("2026-05-02T11:00:00.000Z"),
      slaDueAt: new Date("2026-05-06T18:00:00.000Z"),
      slaDurationMs: sla48h,
      resolvedAt: null,
      closedAt: null,
      reopenedCount: 0,
      logs: [
        {
          actorUserId: adminUser.id,
          actionType: TicketActivityType.created,
          fromStatus: null,
          toStatus: TicketStatus.created,
          note: null,
          offsetMs: 0,
        },
        {
          actorUserId: supervisorUser.id,
          actionType: TicketActivityType.assigned,
          fromStatus: TicketStatus.created,
          toStatus: TicketStatus.assigned,
          note: null,
          offsetMs: 20 * 60_000,
        },
        {
          actorUserId: workerUser.id,
          actionType: TicketActivityType.status_changed,
          fromStatus: TicketStatus.assigned,
          toStatus: TicketStatus.in_progress,
          note: "Parts ordered; repair scheduled.",
          offsetMs: 45 * 60_000,
        },
      ],
    },
    {
      title: `${SEED_TICKET_TITLE_PREFIX} Tire pressure warning — all sensors`,
      description: "TPMS warnings across axles after cold snap. Verified pressures manually; sensors flaky.",
      status: TicketStatus.resolved,
      severity: TicketSeverity.medium,
      priority: TicketPriority.p3,
      busNumber: "BUS-2004",
      categoryName: "Tires",
      createdById: supervisorUser.id,
      assignedToId: workerUser.id,
      assignedById: supervisorUser.id,
      assignedAt: new Date("2026-04-28T07:30:00.000Z"),
      slaDueAt: new Date("2026-05-02T23:59:59.000Z"),
      slaDurationMs: sla48h,
      resolvedAt: new Date("2026-05-01T16:00:00.000Z"),
      closedAt: null,
      reopenedCount: 0,
      logs: [
        {
          actorUserId: supervisorUser.id,
          actionType: TicketActivityType.created,
          fromStatus: null,
          toStatus: TicketStatus.created,
          note: null,
          offsetMs: 0,
        },
        {
          actorUserId: supervisorUser.id,
          actionType: TicketActivityType.assigned,
          fromStatus: TicketStatus.created,
          toStatus: TicketStatus.assigned,
          note: null,
          offsetMs: 10 * 60_000,
        },
        {
          actorUserId: workerUser.id,
          actionType: TicketActivityType.status_changed,
          fromStatus: TicketStatus.assigned,
          toStatus: TicketStatus.in_progress,
          note: "Recalibrated sensors.",
          offsetMs: 2 * 60 * 60_000,
        },
        {
          actorUserId: workerUser.id,
          actionType: TicketActivityType.status_changed,
          fromStatus: TicketStatus.in_progress,
          toStatus: TicketStatus.resolved,
          note: "Road test OK; TPMS clear.",
          offsetMs: 3 * 60 * 60_000,
        },
      ],
    },
    {
      title: `${SEED_TICKET_TITLE_PREFIX} Seat latch broken — row 4`,
      description: "Passenger seat won't lock upright. Tagged out of service until fixed.",
      status: TicketStatus.closed,
      severity: TicketSeverity.low,
      priority: TicketPriority.p3,
      busNumber: "BUS-1001",
      categoryName: "Interior",
      createdById: adminUser.id,
      assignedToId: workerUser.id,
      assignedById: supervisorUser.id,
      assignedAt: new Date("2026-04-20T08:00:00.000Z"),
      slaDueAt: new Date("2026-04-24T12:00:00.000Z"),
      slaDurationMs: sla48h,
      resolvedAt: new Date("2026-04-22T14:00:00.000Z"),
      closedAt: new Date("2026-04-23T09:30:00.000Z"),
      reopenedCount: 0,
      logs: [
        {
          actorUserId: adminUser.id,
          actionType: TicketActivityType.created,
          fromStatus: null,
          toStatus: TicketStatus.created,
          note: null,
          offsetMs: 0,
        },
        {
          actorUserId: supervisorUser.id,
          actionType: TicketActivityType.assigned,
          fromStatus: TicketStatus.created,
          toStatus: TicketStatus.assigned,
          note: null,
          offsetMs: 30 * 60_000,
        },
        {
          actorUserId: workerUser.id,
          actionType: TicketActivityType.status_changed,
          fromStatus: TicketStatus.assigned,
          toStatus: TicketStatus.in_progress,
          note: "Replacement latch installed.",
          offsetMs: 24 * 60 * 60_000,
        },
        {
          actorUserId: workerUser.id,
          actionType: TicketActivityType.status_changed,
          fromStatus: TicketStatus.in_progress,
          toStatus: TicketStatus.resolved,
          note: null,
          offsetMs: 26 * 60 * 60_000,
        },
        {
          actorUserId: supervisorUser.id,
          actionType: TicketActivityType.status_changed,
          fromStatus: TicketStatus.resolved,
          toStatus: TicketStatus.closed,
          note: "Verified on walkthrough.",
          offsetMs: 27 * 60 * 60_000,
        },
      ],
    },
    {
      title: `${SEED_TICKET_TITLE_PREFIX} HVAC weak airflow — driver zone`,
      description: "Previously resolved; issue returned after hot weekend. Reopen for further diagnostics.",
      status: TicketStatus.reopened,
      severity: TicketSeverity.critical,
      priority: TicketPriority.p1,
      busNumber: "BUS-1002",
      categoryName: "Other",
      createdById: supervisorUser.id,
      assignedToId: workerUser.id,
      assignedById: supervisorUser.id,
      assignedAt: new Date("2026-05-03T06:00:00.000Z"),
      slaDueAt: new Date("2026-05-04T06:00:00.000Z"),
      slaDurationMs: sla48h,
      resolvedAt: null,
      closedAt: null,
      reopenedCount: 1,
      logs: [
        {
          actorUserId: supervisorUser.id,
          actionType: TicketActivityType.created,
          fromStatus: null,
          toStatus: TicketStatus.created,
          note: null,
          offsetMs: 0,
        },
        {
          actorUserId: supervisorUser.id,
          actionType: TicketActivityType.assigned,
          fromStatus: TicketStatus.created,
          toStatus: TicketStatus.assigned,
          note: null,
          offsetMs: 5 * 60_000,
        },
        {
          actorUserId: workerUser.id,
          actionType: TicketActivityType.status_changed,
          fromStatus: TicketStatus.assigned,
          toStatus: TicketStatus.resolved,
          note: "Filter swap; seemed OK.",
          offsetMs: 3 * 60 * 60_000,
        },
        {
          actorUserId: supervisorUser.id,
          actionType: TicketActivityType.status_changed,
          fromStatus: TicketStatus.resolved,
          toStatus: TicketStatus.closed,
          note: null,
          offsetMs: 4 * 60 * 60_000,
        },
        {
          actorUserId: adminUser.id,
          actionType: TicketActivityType.reopened,
          fromStatus: TicketStatus.closed,
          toStatus: TicketStatus.reopened,
          note: "Customer callback — still intermittent.",
          offsetMs: 5 * 60 * 60_000,
        },
      ],
    },
  ];

  const ticketBaseTime = new Date("2026-05-01T12:00:00.000Z").getTime();

  for (const spec of seedTicketSpecs) {
    const categoryId = categoryIdByName.get(spec.categoryName);
    const busId = busIdByNumber.get(spec.busNumber);
    if (!categoryId || !busId) {
      throw new Error(`Missing category or bus for seed ticket: ${spec.title}`);
    }

    const ticket = await prisma.ticket.create({
      data: {
        title: spec.title,
        description: spec.description,
        status: spec.status,
        severity: spec.severity,
        priority: spec.priority,
        busId,
        categoryId,
        createdById: spec.createdById,
        assignedToId: spec.assignedToId,
        assignedById: spec.assignedById,
        assignedAt: spec.assignedAt,
        slaDueAt: spec.slaDueAt,
        slaDurationMs: spec.slaDurationMs,
        resolvedAt: spec.resolvedAt,
        closedAt: spec.closedAt,
        reopenedCount: spec.reopenedCount,
      },
    });

    for (const log of spec.logs) {
      const createdAt = new Date(ticketBaseTime + log.offsetMs);
      await prisma.ticketActivityLog.create({
        data: {
          ticketId: ticket.id,
          actorUserId: log.actorUserId,
          actionType: log.actionType,
          fromStatus: log.fromStatus ?? undefined,
          toStatus: log.toStatus ?? undefined,
          note: log.note ?? undefined,
          createdAt,
        },
      });
    }
  }

  console.log("Seeded default roles:", roles.map((role) => role.code).join(", "));
  console.log("Seeded default users:", defaultUsers.map((user) => user.username).join(", "));
  console.log("Seeded default issue categories:", defaultCategories.join(", "));
  console.log("Seeded buses:", seedBuses.map((b) => b.busNumber).join(", "));
  console.log(`Seeded ${seedTicketSpecs.length} dummy tickets and activity logs (titles prefixed "${SEED_TICKET_TITLE_PREFIX}").`);
}

main()
  .catch((error) => {
    console.error("Failed to seed database", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

