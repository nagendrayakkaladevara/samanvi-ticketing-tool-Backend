import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, RoleCode, TicketPriority, TicketSeverity, TicketStatus } from "@prisma/client";
import { Pool } from "pg";
import { hashPassword } from "../src/auth/password";

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

  // Clear existing transactional and master data before creating a fresh dataset.
  await prisma.ticketActivityLog.deleteMany({});
  await prisma.ticket.deleteMany({});
  await prisma.bus.deleteMany({});
  await prisma.user.deleteMany({});

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

  const defaultUsers = [
    { username: "admin1", password: "admin123", displayName: "Admin 1", roleCode: RoleCode.admin },
    { username: "supervisor1", password: "supervisor123", displayName: "Supervisor 1", roleCode: RoleCode.supervisor },
    { username: "supervisor2", password: "supervisor123", displayName: "Supervisor 2", roleCode: RoleCode.supervisor },
    { username: "worker1", password: "worker123", displayName: "Worker 1", roleCode: RoleCode.worker },
    { username: "worker2", password: "worker123", displayName: "Worker 2", roleCode: RoleCode.worker },
    { username: "worker3", password: "worker123", displayName: "Worker 3", roleCode: RoleCode.worker },
    { username: "worker4", password: "worker123", displayName: "Worker 4", roleCode: RoleCode.worker },
    { username: "worker5", password: "worker123", displayName: "Worker 5", roleCode: RoleCode.worker },
  ] as const;

  for (const user of defaultUsers) {
    const roleId = roleIdByCode.get(user.roleCode);
    if (!roleId) {
      throw new Error(`Missing role id for code ${user.roleCode}`);
    }
    const passwordHash = await hashPassword(user.password);
    await prisma.user.create({
      data: {
        username: user.username,
        passwordHash,
        displayName: user.displayName,
        roleId,
      },
    });
  }

  const seedBuses = [
    { busNumber: "BUS-1001", lastMaintenanceDate: new Date("2026-04-01T08:00:00.000Z") },
    { busNumber: "BUS-1002", lastMaintenanceDate: new Date("2026-04-15T14:30:00.000Z") },
    { busNumber: "BUS-2003", lastMaintenanceDate: null },
    { busNumber: "BUS-2004", lastMaintenanceDate: new Date("2026-03-20T11:00:00.000Z") },
    { busNumber: "BUS-3005", lastMaintenanceDate: new Date("2026-05-01T09:00:00.000Z") },
  ] as const;

  for (const bus of seedBuses) {
    await prisma.bus.create({
      data: {
        busNumber: bus.busNumber,
        lastMaintenanceDate: bus.lastMaintenanceDate,
      },
    });
  }

  const users = await prisma.user.findMany({
    select: { id: true, username: true, role: { select: { code: true } } },
    orderBy: { username: "asc" },
  });
  const admins = users.filter((u) => u.role.code === RoleCode.admin);
  const supervisors = users.filter((u) => u.role.code === RoleCode.supervisor);
  const workers = users.filter((u) => u.role.code === RoleCode.worker);

  if (admins.length !== 1 || supervisors.length !== 2 || workers.length !== 5) {
    throw new Error("Failed to create requested user distribution (1 admin, 2 supervisors, 5 workers)");
  }

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
  const statuses: TicketStatus[] = [
    TicketStatus.created,
    TicketStatus.assigned,
    TicketStatus.in_progress,
    TicketStatus.blocked,
    TicketStatus.resolved,
    TicketStatus.closed,
    TicketStatus.reopened,
  ];
  const severities: TicketSeverity[] = [
    TicketSeverity.critical,
    TicketSeverity.high,
    TicketSeverity.medium,
    TicketSeverity.low,
  ];
  const priorities: TicketPriority[] = [TicketPriority.p1, TicketPriority.p2, TicketPriority.p3];
  const busNumbers = seedBuses.map((bus) => bus.busNumber);
  const categoryNames = [...defaultCategories];

  for (let i = 0; i < 20; i += 1) {
    const busNumber = busNumbers[i % busNumbers.length];
    const categoryName = categoryNames[i % categoryNames.length];
    const supervisor = supervisors[i % supervisors.length];
    const worker = workers[i % workers.length];
    const status = statuses[i % statuses.length];
    const severity = severities[i % severities.length];
    const priority = priorities[i % priorities.length];

    const categoryId = categoryIdByName.get(categoryName);
    const busId = busIdByNumber.get(busNumber);
    if (!categoryId || !busId) {
      throw new Error(`Missing category or bus for generated ticket ${i + 1}`);
    }

    const createdAt = new Date(Date.now() - (20 - i) * 6 * 60 * 60_000);
    const assigned = status !== TicketStatus.created;
    const completed = status === TicketStatus.resolved || status === TicketStatus.closed;
    const closed = status === TicketStatus.closed;
    const reopenedCount = status === TicketStatus.reopened ? 1 : 0;

    await prisma.ticket.create({
      data: {
        ticketNumber: 1001 + i,
        title: `[Seed] Ticket ${String(i + 1).padStart(2, "0")} - ${categoryName} issue`,
        description: `Generated seed ticket ${i + 1} for ${busNumber}.`,
        status,
        severity,
        priority,
        busId,
        categoryId,
        createdById: i % 4 === 0 ? admins[0]!.id : supervisor.id,
        assignedToId: assigned ? worker.id : null,
        assignedById: assigned ? supervisor.id : null,
        assignedAt: assigned ? new Date(createdAt.getTime() + 30 * 60_000) : null,
        slaDueAt: new Date(createdAt.getTime() + 48 * 60 * 60_000),
        slaDurationMs: sla48h,
        resolvedAt: completed ? new Date(createdAt.getTime() + 10 * 60 * 60_000) : null,
        closedAt: closed ? new Date(createdAt.getTime() + 12 * 60 * 60_000) : null,
        reopenedCount,
        createdAt,
      },
    });
  }

  console.log("Seeded default roles:", roles.map((role) => role.code).join(", "));
  console.log("Seeded users:", defaultUsers.map((user) => user.username).join(", "));
  console.log("Seeded default issue categories:", defaultCategories.join(", "));
  console.log("Seeded buses:", seedBuses.map((b) => b.busNumber).join(", "));
  console.log("Seeded 20 tickets.");
}

main()
  .catch((error) => {
    console.error("Failed to seed database", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

