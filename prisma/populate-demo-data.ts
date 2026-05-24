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

const connectionString = process.env["DATABASE_URL"];

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const adapter = new PrismaPg(
  new Pool({
    connectionString,
  }),
);

const prisma = new PrismaClient({ adapter });

const CONFIG = {
  busCount: 20,
  supervisorCount: 2,
  workerCount: 5,
  ticketCount: 60,
  historyDays: 90,
  ticketBatchSize: 500,
  activityBatchSize: 1_000,
} as const;

const MAX_TICKET_NUMBER = 9_999;
const MIN_TICKET_NUMBER = 1_000;

const ISSUE_CATEGORIES = [
  "Engine",
  "Electrical",
  "Body Damage",
  "Tires",
  "Interior",
  "Other",
] as const;

const TITLE_TEMPLATES = [
  "{category} inspection required on {bus}",
  "Urgent {category} fault reported for {bus}",
  "{bus} — {category} issue during morning route",
  "Driver reported {category} problem on {bus}",
  "{category} repair pending for {bus}",
  "Preventive {category} check flagged on {bus}",
  "{bus} stopped due to {category} malfunction",
  "Workshop review: {category} on {bus}",
] as const;

const DESCRIPTION_SNIPPETS = [
  "Driver noticed symptoms during peak hours.",
  "Issue escalated after repeated occurrences this week.",
  "Maintenance team requested immediate follow-up.",
  "Passenger safety review recommended.",
  "Diagnostic scan confirms component degradation.",
  "Temporary fix applied; permanent repair still required.",
  "Spare parts ordered from central depot.",
  "Field supervisor validated the report on-site.",
] as const;

const STATUS_WEIGHTS: Array<{ status: TicketStatus; weight: number }> = [
  { status: TicketStatus.created, weight: 8 },
  { status: TicketStatus.assigned, weight: 14 },
  { status: TicketStatus.in_progress, weight: 22 },
  { status: TicketStatus.blocked, weight: 6 },
  { status: TicketStatus.resolved, weight: 20 },
  { status: TicketStatus.closed, weight: 26 },
  { status: TicketStatus.reopened, weight: 4 },
];

const SEVERITY_WEIGHTS: Array<{ severity: TicketSeverity; weight: number }> = [
  { severity: TicketSeverity.critical, weight: 8 },
  { severity: TicketSeverity.high, weight: 22 },
  { severity: TicketSeverity.medium, weight: 45 },
  { severity: TicketSeverity.low, weight: 25 },
];

const PRIORITY_WEIGHTS: Array<{ priority: TicketPriority; weight: number }> = [
  { priority: TicketPriority.p1, weight: 12 },
  { priority: TicketPriority.p2, weight: 38 },
  { priority: TicketPriority.p3, weight: 50 },
];

function pickWeighted<T extends string>(
  items: Array<{ value: T; weight: number }>,
  seed: number,
): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let cursor = seed % total;
  for (const item of items) {
    if (cursor < item.weight) {
      return item.value;
    }
    cursor -= item.weight;
  }
  return items[items.length - 1]!.value;
}

function pickAt<T>(items: readonly T[], index: number): T {
  return items[index % items.length]!;
}

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

function buildTitle(category: string, busNumber: string, index: number): string {
  const template = pickAt(TITLE_TEMPLATES, index);
  return template.replace("{category}", category).replace("{bus}", busNumber).slice(0, 160);
}

function buildDescription(category: string, busNumber: string, index: number): string {
  const snippet = pickAt(DESCRIPTION_SNIPPETS, index);
  return `${category} maintenance ticket for ${busNumber}. ${snippet}`;
}

async function clearTransactionalData(): Promise<void> {
  await prisma.notification.deleteMany({});
  await prisma.ticketActivityLog.deleteMany({});
  await prisma.ticket.deleteMany({});
  await prisma.bus.deleteMany({});
  await prisma.user.deleteMany({});
}

async function ensureRolesAndCategories(): Promise<Map<RoleCode, string>> {
  const roles: Array<{ code: RoleCode; label: string }> = [
    { code: RoleCode.admin, label: "Admin" },
    { code: RoleCode.supervisor, label: "Supervisor" },
    { code: RoleCode.worker, label: "Worker" },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { label: role.label },
      create: role,
    });
  }

  for (const categoryName of ISSUE_CATEGORIES) {
    await prisma.issueCategory.upsert({
      where: { name: categoryName },
      update: { isActive: true },
      create: { name: categoryName },
    });
  }

  const roleRows = await prisma.role.findMany({
    where: { code: { in: [RoleCode.admin, RoleCode.supervisor, RoleCode.worker] } },
    select: { id: true, code: true },
  });

  return new Map(roleRows.map((row) => [row.code, row.id]));
}

async function createUsers(roleIdByCode: Map<RoleCode, string>): Promise<{
  adminId: string;
  supervisorIds: string[];
  workerIds: string[];
}> {
  const [adminHash, supervisorHash, workerHash] = await Promise.all([
    hashPassword("admin123"),
    hashPassword("supervisor123"),
    hashPassword("worker123"),
  ]);

  const adminRoleId = roleIdByCode.get(RoleCode.admin);
  const supervisorRoleId = roleIdByCode.get(RoleCode.supervisor);
  const workerRoleId = roleIdByCode.get(RoleCode.worker);

  if (!adminRoleId || !supervisorRoleId || !workerRoleId) {
    throw new Error("Missing required role ids");
  }

  const admin = await prisma.user.create({
    data: {
      username: "admin1",
      passwordHash: adminHash,
      displayName: "Admin 1",
      roleId: adminRoleId,
    },
    select: { id: true },
  });

  const supervisorIds: string[] = [];
  for (let i = 1; i <= CONFIG.supervisorCount; i += 1) {
    const user = await prisma.user.create({
      data: {
        username: `supervisor${i}`,
        passwordHash: supervisorHash,
        displayName: `Supervisor ${i}`,
        roleId: supervisorRoleId,
      },
      select: { id: true },
    });
    supervisorIds.push(user.id);
  }

  const workerIds: string[] = [];
  for (let i = 1; i <= CONFIG.workerCount; i += 1) {
    const user = await prisma.user.create({
      data: {
        username: `worker${i}`,
        passwordHash: workerHash,
        displayName: `Worker ${i}`,
        roleId: workerRoleId,
      },
      select: { id: true },
    });
    workerIds.push(user.id);
  }

  return { adminId: admin.id, supervisorIds, workerIds };
}

async function createBuses(): Promise<Array<{ id: string; busNumber: string }>> {
  const buses = Array.from({ length: CONFIG.busCount }, (_, index) => {
    const fleet = Math.floor(index / 100) + 1;
    const unit = (index % 100) + 1;
    const busNumber = `BUS-${fleet}${String(unit).padStart(3, "0")}`;
    const rand = mulberry32(index + 17);
    const hasMaintenance = rand() > 0.18;
    const daysAgo = Math.floor(rand() * 120);
    return {
      busNumber,
      engineNumber: `ENG-${String(index + 1).padStart(4, "0")}`,
      chassisNumber: `CHS-${String(index + 1).padStart(4, "0")}`,
      odometer: 50_000 + index * 1_000,
      insuranceValidity: new Date(Date.now() + 365 * 86_400_000),
      lastMaintenanceDate: hasMaintenance
        ? new Date(Date.now() - daysAgo * 86_400_000)
        : null,
    };
  });

  await prisma.bus.createMany({ data: buses });

  return prisma.bus.findMany({
    select: { id: true, busNumber: true },
    orderBy: { busNumber: "asc" },
  });
}

type TicketDraft = {
  ticketNumber: number;
  title: string;
  description: string;
  status: TicketStatus;
  severity: TicketSeverity;
  priority: TicketPriority;
  busId: string;
  categoryId: string;
  createdById: string;
  assignedToId: string | null;
  assignedById: string | null;
  assignedAt: Date | null;
  slaDueAt: Date;
  slaDurationMs: bigint;
  resolvedAt: Date | null;
  closedAt: Date | null;
  reopenedCount: number;
  createdAt: Date;
};

async function createTickets(input: {
  buses: Array<{ id: string; busNumber: string }>;
  categories: Array<{ id: string; name: string }>;
  adminId: string;
  supervisorIds: string[];
  workerIds: string[];
}): Promise<void> {
  const { buses, categories, adminId, supervisorIds, workerIds } = input;
  const dayMs = 86_400_000;
  const slaMs = BigInt(48 * 60 * 60_000);
  const now = Date.now();
  const statusItems = STATUS_WEIGHTS.map((item) => ({ value: item.status, weight: item.weight }));
  const severityItems = SEVERITY_WEIGHTS.map((item) => ({ value: item.severity, weight: item.weight }));
  const priorityItems = PRIORITY_WEIGHTS.map((item) => ({ value: item.priority, weight: item.weight }));

  const ticketCount = Math.min(
    CONFIG.ticketCount,
    MAX_TICKET_NUMBER - MIN_TICKET_NUMBER + 1,
  );

  for (let offset = 0; offset < ticketCount; offset += CONFIG.ticketBatchSize) {
    const batchSize = Math.min(CONFIG.ticketBatchSize, ticketCount - offset);
    const batch: TicketDraft[] = [];

    for (let i = 0; i < batchSize; i += 1) {
      const index = offset + i;
      const rand = mulberry32(index + 101);
      const bus = pickAt(buses, index);
      const category = pickAt(categories, index + 3);
      const supervisor = pickAt(supervisorIds, index + 5);
      const worker = pickAt(workerIds, index + 11);
      const status = pickWeighted(statusItems, index);
      const severity = pickWeighted(severityItems, index + 7);
      const priority = pickWeighted(priorityItems, index + 13);

      const ageDays = Math.floor(rand() * CONFIG.historyDays);
      const ageHours = Math.floor(rand() * 24);
      const createdAt = new Date(now - ageDays * dayMs - ageHours * 3_600_000);

      const assigned = status !== TicketStatus.created;
      const completed = status === TicketStatus.resolved || status === TicketStatus.closed;
      const closed = status === TicketStatus.closed;
      const reopenedCount = status === TicketStatus.reopened ? 1 + (index % 2) : 0;

      const isOpen = !closed && status !== TicketStatus.resolved;
      const makeOverdue = isOpen && index % 10 < 3;
      const slaDueAt = makeOverdue
        ? new Date(createdAt.getTime() + Math.floor(rand() * 12) * 3_600_000)
        : new Date(createdAt.getTime() + 48 * 60 * 60_000);

      const assignedAt = assigned
        ? new Date(createdAt.getTime() + Math.floor(rand() * 6 + 1) * 3_600_000)
        : null;
      const resolvedAt = completed
        ? new Date(createdAt.getTime() + Math.floor(rand() * 36 + 4) * 3_600_000)
        : null;
      const closedAt = closed
        ? new Date((resolvedAt ?? createdAt).getTime() + Math.floor(rand() * 8 + 2) * 3_600_000)
        : null;

      batch.push({
        ticketNumber: MIN_TICKET_NUMBER + index,
        title: buildTitle(category.name, bus.busNumber, index),
        description: buildDescription(category.name, bus.busNumber, index),
        status,
        severity,
        priority,
        busId: bus.id,
        categoryId: category.id,
        createdById: index % 17 === 0 ? adminId : supervisor,
        assignedToId: assigned ? worker : null,
        assignedById: assigned ? supervisor : null,
        assignedAt,
        slaDueAt,
        slaDurationMs: slaMs,
        resolvedAt,
        closedAt,
        reopenedCount,
        createdAt,
      });
    }

    await prisma.ticket.createMany({ data: batch });
    console.log(`Inserted tickets ${offset + 1}-${offset + batchSize} of ${ticketCount}`);
  }
}

async function createActivityLogs(input: {
  adminId: string;
  supervisorIds: string[];
  workerIds: string[];
}): Promise<void> {
  const { adminId, supervisorIds, workerIds } = input;
  const tickets = await prisma.ticket.findMany({
    select: {
      id: true,
      status: true,
      createdById: true,
      assignedToId: true,
      assignedById: true,
      createdAt: true,
      assignedAt: true,
      resolvedAt: true,
      closedAt: true,
    },
    orderBy: { ticketNumber: "asc" },
  });

  type ActivityDraft = {
    ticketId: string;
    actorUserId: string;
    actionType: TicketActivityType;
    fromStatus: TicketStatus | null;
    toStatus: TicketStatus | null;
    note: string | null;
    createdAt: Date;
  };

  const activities: ActivityDraft[] = [];

  for (let index = 0; index < tickets.length; index += 1) {
    const ticket = tickets[index]!;
    let cursor = ticket.createdAt;

    activities.push({
      ticketId: ticket.id,
      actorUserId: ticket.createdById,
      actionType: TicketActivityType.created,
      fromStatus: null,
      toStatus: TicketStatus.created,
      note: null,
      createdAt: cursor,
    });

    if (ticket.assignedAt && ticket.assignedById && ticket.assignedToId) {
      cursor = ticket.assignedAt;
      activities.push({
        ticketId: ticket.id,
        actorUserId: ticket.assignedById,
        actionType: TicketActivityType.assigned,
        fromStatus: TicketStatus.created,
        toStatus: TicketStatus.assigned,
        note: "Assigned to field worker",
        createdAt: cursor,
      });

      if (ticket.status === TicketStatus.in_progress || ticket.status === TicketStatus.blocked) {
        cursor = new Date(cursor.getTime() + 2 * 3_600_000);
        activities.push({
          ticketId: ticket.id,
          actorUserId: ticket.assignedToId,
          actionType: TicketActivityType.status_changed,
          fromStatus: TicketStatus.assigned,
          toStatus: ticket.status,
          note: ticket.status === TicketStatus.blocked ? "Waiting for spare parts" : "Work started",
          createdAt: cursor,
        });
      }
    }

    if (ticket.resolvedAt) {
      const actor = ticket.assignedToId ?? pickAt(workerIds, index);
      activities.push({
        ticketId: ticket.id,
        actorUserId: actor,
        actionType: TicketActivityType.status_changed,
        fromStatus: TicketStatus.in_progress,
        toStatus: TicketStatus.resolved,
        note: "Issue resolved after inspection",
        createdAt: ticket.resolvedAt,
      });
    }

    if (ticket.closedAt) {
      activities.push({
        ticketId: ticket.id,
        actorUserId: pickAt(supervisorIds, index),
        actionType: TicketActivityType.closed,
        fromStatus: TicketStatus.resolved,
        toStatus: TicketStatus.closed,
        note: "Closed after verification",
        createdAt: ticket.closedAt,
      });
    }

    if (ticket.status === TicketStatus.reopened) {
      activities.push({
        ticketId: ticket.id,
        actorUserId: adminId,
        actionType: TicketActivityType.reopened,
        fromStatus: TicketStatus.closed,
        toStatus: TicketStatus.reopened,
        note: "Issue recurred after closure",
        createdAt: new Date((ticket.closedAt ?? ticket.createdAt).getTime() + 4 * 3_600_000),
      });
    }

    if (index % 4 === 0) {
      activities.push({
        ticketId: ticket.id,
        actorUserId: pickAt(supervisorIds, index + 2),
        actionType: TicketActivityType.commented,
        fromStatus: null,
        toStatus: null,
        note: "Follow-up note added by supervisor",
        createdAt: new Date(ticket.createdAt.getTime() + (index % 12 + 1) * 3_600_000),
      });
    }
  }

  for (let offset = 0; offset < activities.length; offset += CONFIG.activityBatchSize) {
    const batch = activities.slice(offset, offset + CONFIG.activityBatchSize);
    await prisma.ticketActivityLog.createMany({ data: batch });
    console.log(
      `Inserted activity logs ${offset + 1}-${offset + batch.length} of ${activities.length}`,
    );
  }
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  console.log("Populating demo dataset...");

  const roleIdByCode = await ensureRolesAndCategories();
  await clearTransactionalData();

  const users = await createUsers(roleIdByCode);
  const buses = await createBuses();
  const categories = await prisma.issueCategory.findMany({
    where: { name: { in: [...ISSUE_CATEGORIES] } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  await createTickets({
    buses,
    categories,
    ...users,
  });
  await createActivityLogs(users);

  const [ticketCount, busCount, userCount, activityCount] = await Promise.all([
    prisma.ticket.count(),
    prisma.bus.count(),
    prisma.user.count(),
    prisma.ticketActivityLog.count(),
  ]);

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log("");
  console.log("Demo dataset ready.");
  console.log(`Users: ${userCount} (admin1 / supervisor1-${CONFIG.supervisorCount} / worker1-${CONFIG.workerCount})`);
  console.log(`Passwords: admin123 / supervisor123 / worker123`);
  console.log(`Buses: ${busCount}`);
  console.log(`Tickets: ${ticketCount}`);
  console.log(`Activity logs: ${activityCount}`);
  console.log(`Completed in ${elapsedSec}s`);
}

main()
  .catch((error) => {
    console.error("Failed to populate demo data", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
