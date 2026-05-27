import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, RoleCode, TicketPriority, TicketSeverity, TicketStatus } from "@prisma/client";
import { Pool } from "pg";
import { hashPassword } from "../src/auth/password";
import { seedPermissions } from "../src/lib/permission-seed";

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

const BUS_COUNT = 20;
const TICKET_COUNT = 60;
const HISTORY_DAYS = 90;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pickAt<T>(items: readonly T[], index: number): T {
  return items[index % items.length]!;
}

async function main() {
  const roles: Array<{ code: RoleCode; label: string }> = [
    { code: RoleCode.admin, label: "Admin" },
    { code: RoleCode.supervisor, label: "Supervisor" },
    { code: RoleCode.chairman, label: "Chairman" },
    { code: RoleCode.accountant, label: "Accountant" },
    { code: RoleCode.collection_agent, label: "Collection Agent" },
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
        in: [
          RoleCode.admin,
          RoleCode.supervisor,
          RoleCode.chairman,
          RoleCode.accountant,
          RoleCode.collection_agent,
          RoleCode.worker,
        ],
      },
    },
    select: { id: true, code: true },
  });
  const roleIdByCode = new Map(roleRows.map((row) => [row.code, row.id]));

  await seedPermissions(prisma);

  await prisma.notification.deleteMany({});
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

  const seedBuses = Array.from({ length: BUS_COUNT }, (_, index) => {
    const fleet = Math.floor(index / 10) + 1;
    const unit = (index % 10) + 1;
    const busNumber = `BUS-${fleet}${String(unit).padStart(3, "0")}`;
    const rand = mulberry32(index + 17);
    const hasMaintenance = rand() > 0.2;
    const daysAgo = Math.floor(rand() * 120);
    return {
      busNumber,
      engineNumber: `ENG-${String(index + 1).padStart(4, "0")}`,
      chassisNumber: `CHS-${String(index + 1).padStart(4, "0")}`,
      odometer: 50_000 + index * 1_000,
      insuranceValidity: new Date(Date.now() + 365 * 86_400_000),
      lastMaintenanceDate: hasMaintenance ? new Date(Date.now() - daysAgo * 86_400_000) : null,
    };
  });

  await prisma.bus.createMany({ data: seedBuses });

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
  const categoryNames = categoryMap.map((c) => c.name);

  const busMap = await prisma.bus.findMany({
    select: { id: true, busNumber: true },
    orderBy: { busNumber: "asc" },
  });

  const dayMs = 86_400_000;
  const sla48h = BigInt(48 * 60 * 60_000);
  const now = Date.now();
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

  const tickets = Array.from({ length: TICKET_COUNT }, (_, i) => {
    const rand = mulberry32(i + 101);
    const bus = pickAt(busMap, i);
    const category = pickAt(categoryMap, i + 3);
    const supervisor = pickAt(supervisors, i);
    const worker = pickAt(workers, i);
    const status = pickAt(statuses, i);
    const severity = pickAt(severities, i + 2);
    const priority = pickAt(priorities, i + 1);

    const ageDays = Math.floor(rand() * (HISTORY_DAYS + 1));
    const ageHours = Math.floor(rand() * 24);
    const createdAt = new Date(now - ageDays * dayMs - ageHours * 3_600_000);

    const assigned = status !== TicketStatus.created;
    const completed = status === TicketStatus.resolved || status === TicketStatus.closed;
    const closed = status === TicketStatus.closed;
    const reopenedCount = status === TicketStatus.reopened ? 1 : 0;

    const isOpen = !closed && status !== TicketStatus.resolved;
    const makeOverdue = isOpen && i % 10 < 3;
    const slaDueAt = makeOverdue
      ? new Date(createdAt.getTime() + Math.floor(rand() * 12) * 3_600_000)
      : new Date(createdAt.getTime() + 48 * 60 * 60_000);

    return {
      ticketNumber: 1001 + i,
      title: `${category.name} issue on ${bus.busNumber}`.slice(0, 160),
      description: `Maintenance ticket for ${bus.busNumber} — ${category.name} category.`,
      status,
      severity,
      priority,
      busId: bus.id,
      categoryId: category.id,
      createdById: i % 5 === 0 ? admins[0]!.id : supervisor.id,
      assignedToId: assigned ? worker.id : null,
      assignedById: assigned ? supervisor.id : null,
      assignedAt: assigned
        ? new Date(createdAt.getTime() + Math.floor(rand() * 6 + 1) * 3_600_000)
        : null,
      slaDueAt,
      slaDurationMs: sla48h,
      resolvedAt: completed
        ? new Date(createdAt.getTime() + Math.floor(rand() * 36 + 4) * 3_600_000)
        : null,
      closedAt: closed
        ? new Date(createdAt.getTime() + Math.floor(rand() * 48 + 12) * 3_600_000)
        : null,
      reopenedCount,
      createdAt,
    };
  });

  await prisma.ticket.createMany({ data: tickets });

  console.log("Seeded default roles:", roles.map((role) => role.code).join(", "));
  console.log("Seeded users:", defaultUsers.map((user) => user.username).join(", "));
  console.log("Seeded default issue categories:", defaultCategories.join(", "));
  console.log(`Seeded ${BUS_COUNT} buses.`);
  console.log(`Seeded ${TICKET_COUNT} tickets (spread over ${HISTORY_DAYS} days).`);
}

main()
  .catch((error) => {
    console.error("Failed to seed database", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
