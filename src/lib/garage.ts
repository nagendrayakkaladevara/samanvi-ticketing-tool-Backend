import {
  Prisma,
  RepairJobActivityType,
  RepairJobStatus,
} from "@prisma/client";
import { prisma } from "./prisma";

export const MAX_REPAIR_CATEGORY_DEPTH = 5;

const REPAIR_JOB_ID_PREFIX = "J";

export async function generateRepairJobIdNumber(
  tx: Prisma.TransactionClient = prisma,
): Promise<string> {
  const latest = await tx.repairJob.findFirst({
    where: { jobIdNumber: { startsWith: REPAIR_JOB_ID_PREFIX } },
    orderBy: { jobIdNumber: "desc" },
    select: { jobIdNumber: true },
  });

  const latestNumber = latest
    ? Number.parseInt(latest.jobIdNumber.slice(REPAIR_JOB_ID_PREFIX.length), 10)
    : 0;
  const nextNumber = latestNumber + 1;

  if (nextNumber > 9999) {
    throw new Error("Repair job ID capacity reached (9999)");
  }

  return `${REPAIR_JOB_ID_PREFIX}${String(nextNumber).padStart(2, "0")}`;
}

export type RepairCategoryTreeNode = {
  id: string;
  name: string;
  level: number;
  parentId: string | null;
  children: RepairCategoryTreeNode[];
  createdAt: Date;
  updatedAt: Date;
};

export function buildRepairCategoryTree(
  categories: Array<{
    id: string;
    name: string;
    level: number;
    parentId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>,
): RepairCategoryTreeNode[] {
  const byId = new Map<string, RepairCategoryTreeNode>();

  for (const category of categories) {
    byId.set(category.id, { ...category, children: [] });
  }

  const roots: RepairCategoryTreeNode[] = [];

  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (nodes: RepairCategoryTreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const node of nodes) {
      sortNodes(node.children);
    }
  };

  sortNodes(roots);
  return roots;
}

export const repairJobNotDeletedWhere: Prisma.RepairJobWhereInput = {
  deletedAt: null,
};

export type RepairJobPartActivityMetadata = {
  repairJobPartId: string;
  repairPartId: string;
  partName: string;
  quantity: number;
  unitPrice: string;
};

export type RepairJobRepeatScheduledMetadata = {
  scheduledFor: string;
};

export type RepairJobRepeatCreatedMetadata = {
  relatedJobId: string;
  relatedJobIdNumber: string;
};

export type RepairJobRepeatSourceMetadata = {
  previousJobId: string;
  previousJobIdNumber: string;
  isRepeatJob: true;
};

export async function processDueRepeatJobs(
  tx: Prisma.TransactionClient = prisma,
): Promise<number> {
  const now = new Date();
  const dueJobs = await tx.repairJob.findMany({
    where: {
      deletedAt: null,
      repeatScheduledFor: { lte: now },
      repeatProcessedAt: null,
    },
    select: {
      id: true,
      jobIdNumber: true,
      busId: true,
      odometerReading: true,
      repairCategoryId: true,
      priority: true,
      reportedDriverId: true,
      assignedToOfficeStaffId: true,
      description: true,
      createdById: true,
    },
  });

  let createdCount = 0;

  for (const source of dueJobs) {
    const jobIdNumber = await generateRepairJobIdNumber(tx);
    const initialStatus = source.assignedToOfficeStaffId
      ? RepairJobStatus.assigned
      : RepairJobStatus.created;

    const repeatJob = await tx.repairJob.create({
      data: {
        jobIdNumber,
        busId: source.busId,
        odometerReading: source.odometerReading,
        repairCategoryId: source.repairCategoryId,
        priority: source.priority,
        reportedDriverId: source.reportedDriverId,
        assignedToOfficeStaffId: source.assignedToOfficeStaffId,
        description: source.description,
        status: initialStatus,
        createdById: source.createdById,
        isRepeatJob: true,
        previousJobId: source.id,
      },
      select: { id: true, jobIdNumber: true },
    });

    await tx.repairJobActivityLog.create({
      data: {
        repairJobId: source.id,
        actorUserId: source.createdById,
        actionType: RepairJobActivityType.repeat_created,
        metadata: {
          relatedJobId: repeatJob.id,
          relatedJobIdNumber: repeatJob.jobIdNumber,
        } satisfies RepairJobRepeatCreatedMetadata,
      },
    });

    await tx.repairJobActivityLog.create({
      data: {
        repairJobId: repeatJob.id,
        actorUserId: source.createdById,
        actionType: RepairJobActivityType.created,
        toStatus: initialStatus,
        metadata: {
          previousJobId: source.id,
          previousJobIdNumber: source.jobIdNumber,
          isRepeatJob: true,
        } satisfies RepairJobRepeatSourceMetadata,
      },
    });

    await tx.repairJob.update({
      where: { id: source.id },
      data: { repeatProcessedAt: now },
    });

    createdCount += 1;
  }

  return createdCount;
}

export const allowedRepairJobStatusTransitions: Record<
  RepairJobStatus,
  readonly RepairJobStatus[]
> = {
  [RepairJobStatus.created]: [RepairJobStatus.assigned, RepairJobStatus.cancelled],
  [RepairJobStatus.assigned]: [
    RepairJobStatus.in_progress,
    RepairJobStatus.on_hold,
    RepairJobStatus.cancelled,
  ],
  [RepairJobStatus.in_progress]: [
    RepairJobStatus.on_hold,
    RepairJobStatus.completed,
    RepairJobStatus.cancelled,
  ],
  [RepairJobStatus.on_hold]: [
    RepairJobStatus.in_progress,
    RepairJobStatus.assigned,
    RepairJobStatus.cancelled,
  ],
  [RepairJobStatus.completed]: [RepairJobStatus.closed],
  [RepairJobStatus.closed]: [],
  [RepairJobStatus.cancelled]: [],
};

export async function assertAssignableOfficeStaff(officeStaffId: string): Promise<void> {
  const staff = await prisma.officeStaff.findUnique({
    where: { id: officeStaffId },
    select: { id: true, dateOfLeaving: true },
  });
  if (!staff) {
    throw new Error("Office staff not found");
  }
  if (staff.dateOfLeaving) {
    throw new Error("Cannot assign repair job to office staff who has left");
  }
}
