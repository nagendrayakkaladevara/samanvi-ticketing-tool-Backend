import {
  Prisma,
  RepairJobActivityType,
  RepairJobPriority,
  RepairJobStatus,
  RoleCode,
} from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../core/http/async-handler";
import { badRequest, forbidden, notFound } from "../core/errors/http-errors";
import {
  allowedRepairJobStatusTransitions,
  assertAssignableOfficeStaff,
  generateRepairJobIdNumber,
  processDueRepeatJobs,
  repairJobNotDeletedWhere,
} from "../lib/garage";
import { normalizeBusNumber, paginationMeta, paginationQuerySchema } from "../lib/master";
import { prisma } from "../lib/prisma";
import { requireAuth, requireFeature } from "../middleware/auth";

const isoDateStringSchema = z.string().datetime();

const repairJobActivityLogSelect = {
  id: true,
  actionType: true,
  fromStatus: true,
  toStatus: true,
  note: true,
  createdAt: true,
  actor: {
    select: {
      id: true,
      username: true,
      displayName: true,
    },
  },
} satisfies Prisma.RepairJobActivityLogSelect;

const repairJobSelect = {
  id: true,
  jobIdNumber: true,
  odometerReading: true,
  priority: true,
  description: true,
  status: true,
  closedAt: true,
  isRepeatJob: true,
  previousJobId: true,
  repeatScheduledFor: true,
  repeatProcessedAt: true,
  createdAt: true,
  updatedAt: true,
  bus: {
    select: {
      id: true,
      busNumber: true,
    },
  },
  repairCategory: {
    select: {
      id: true,
      name: true,
      level: true,
    },
  },
  reportedDriver: {
    select: {
      id: true,
      driverIdNumber: true,
      dlName: true,
    },
  },
  assignedToOfficeStaff: {
    select: {
      id: true,
      staffIdNumber: true,
      nickName: true,
      aadharName: true,
      designation: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      username: true,
      displayName: true,
    },
  },
  previousJob: {
    select: {
      id: true,
      jobIdNumber: true,
    },
  },
  parts: {
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      quantity: true,
      unitPrice: true,
      createdAt: true,
      repairPart: {
        select: {
          id: true,
          partName: true,
        },
      },
      addedBy: {
        select: {
          id: true,
          username: true,
          displayName: true,
        },
      },
    },
  },
  activityLogs: {
    orderBy: [{ createdAt: "desc" }],
    select: repairJobActivityLogSelect,
  },
} satisfies Prisma.RepairJobSelect;

type RepairJobRecord = Prisma.RepairJobGetPayload<{
  select: typeof repairJobSelect;
}>;

function serializeRepairJob(job: RepairJobRecord) {
  return {
    ...job,
    parts: job.parts.map((part) => ({
      ...part,
      unitPrice: part.unitPrice.toString(),
    })),
  };
}

const createRepairJobSchema = z.object({
  busNumber: z.string().trim().min(1).max(50),
  odometerReading: z.coerce.number().int().nonnegative(),
  repairCategoryId: z.string().trim().min(1),
  priority: z.nativeEnum(RepairJobPriority),
  reportedDriverId: z.string().trim().min(1).optional(),
  assignedToOfficeStaffId: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1),
  status: z.nativeEnum(RepairJobStatus).optional(),
});

const jobListQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(RepairJobStatus).optional(),
  priority: z.nativeEnum(RepairJobPriority).optional(),
  assignedToOfficeStaffId: z.string().trim().min(1).optional(),
  busId: z.string().trim().min(1).optional(),
  isRepeatJob: z.coerce.boolean().optional(),
});

const updateRepairJobSchema = z
  .object({
    odometerReading: z.coerce.number().int().nonnegative().optional(),
    repairCategoryId: z.string().trim().min(1).optional(),
    priority: z.nativeEnum(RepairJobPriority).optional(),
    reportedDriverId: z.string().trim().min(1).nullable().optional(),
    assignedToOfficeStaffId: z.string().trim().min(1).nullable().optional(),
    description: z.string().trim().min(1).optional(),
    status: z.nativeEnum(RepairJobStatus).optional(),
    note: z.string().trim().min(1).max(2_000).optional(),
    scheduleRepeatFor: isoDateStringSchema.optional(),
  })
  .refine(
    (value) =>
      value.odometerReading !== undefined ||
      value.repairCategoryId !== undefined ||
      value.priority !== undefined ||
      value.reportedDriverId !== undefined ||
      value.assignedToOfficeStaffId !== undefined ||
      value.description !== undefined ||
      value.status !== undefined ||
      value.scheduleRepeatFor !== undefined,
    { message: "At least one field must be provided" },
  );

const addRepairJobPartSchema = z.object({
  repairPartId: z.string().trim().min(1),
  quantity: z.coerce.number().int().min(1).default(1),
});

const createRepairJobCommentSchema = z.object({
  note: z.string().trim().min(1).max(2_000),
});

function repairJobStatusActivityType(
  toStatus: RepairJobStatus,
): RepairJobActivityType {
  if (toStatus === RepairJobStatus.closed) {
    return RepairJobActivityType.closed;
  }
  if (toStatus === RepairJobStatus.cancelled) {
    return RepairJobActivityType.cancelled;
  }
  return RepairJobActivityType.status_changed;
}

const jobsRouter = Router();

jobsRouter.use(requireAuth);

function assertJobId(jobId: string | string[] | undefined): string {
  if (!jobId || Array.isArray(jobId)) {
    throw badRequest("Invalid repair job id");
  }
  return jobId;
}

async function findVisibleRepairJobOrThrow(jobId: string) {
  const job = await prisma.repairJob.findFirst({
    where: { id: jobId, ...repairJobNotDeletedWhere },
    select: repairJobSelect,
  });

  if (!job) {
    throw notFound("Repair job not found");
  }

  return job;
}

async function resolveBusId(busNumber: string): Promise<string> {
  const bus = await prisma.bus.findUnique({
    where: { busNumber: normalizeBusNumber(busNumber) },
    select: { id: true },
  });
  if (!bus) {
    throw notFound("Bus not found");
  }
  return bus.id;
}

jobsRouter.get(
  "/jobs",
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw badRequest("Authenticated user context is required");
    }

    await processDueRepeatJobs();

    const parsedQuery = jobListQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      throw badRequest("Invalid repair jobs query params", {
        issues: parsedQuery.error.issues,
      });
    }

    const { page, limit, status, priority, assignedToOfficeStaffId, busId, isRepeatJob } =
      parsedQuery.data;
    const skip = (page - 1) * limit;

    const where: Prisma.RepairJobWhereInput = {
      ...repairJobNotDeletedWhere,
    };

    if (assignedToOfficeStaffId) {
      where.assignedToOfficeStaffId = assignedToOfficeStaffId;
    }

    if (status) {
      where.status = status;
    }
    if (priority) {
      where.priority = priority;
    }
    if (busId) {
      where.busId = busId;
    }
    if (isRepeatJob !== undefined) {
      where.isRepeatJob = isRepeatJob;
    }

    const [items, total] = await Promise.all([
      prisma.repairJob.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: "desc" }],
        select: repairJobSelect,
      }),
      prisma.repairJob.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: { items: items.map(serializeRepairJob) },
      meta: paginationMeta(page, limit, total),
    });
  }),
);

const myJobsQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(RepairJobStatus).optional(),
  priority: z.nativeEnum(RepairJobPriority).optional(),
  busId: z.string().trim().min(1).optional(),
  isRepeatJob: z.coerce.boolean().optional(),
  assignedToOfficeStaffId: z.string().trim().min(1),
});

jobsRouter.get(
  "/jobs/my",
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw badRequest("Authenticated user context is required");
    }

    await processDueRepeatJobs();

    const parsedQuery = myJobsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      throw badRequest("Invalid repair jobs query params", {
        issues: parsedQuery.error.issues,
      });
    }

    const { page, limit, status, priority, busId, isRepeatJob, assignedToOfficeStaffId } =
      parsedQuery.data;
    const skip = (page - 1) * limit;

    const staff = await prisma.officeStaff.findUnique({
      where: { id: assignedToOfficeStaffId },
      select: { id: true },
    });
    if (!staff) {
      throw notFound("Office staff not found");
    }

    const where: Prisma.RepairJobWhereInput = {
      ...repairJobNotDeletedWhere,
      assignedToOfficeStaffId,
    };

    if (status) {
      where.status = status;
    }
    if (priority) {
      where.priority = priority;
    }
    if (busId) {
      where.busId = busId;
    }
    if (isRepeatJob !== undefined) {
      where.isRepeatJob = isRepeatJob;
    }

    const [items, total] = await Promise.all([
      prisma.repairJob.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: "desc" }],
        select: repairJobSelect,
      }),
      prisma.repairJob.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: { items: items.map(serializeRepairJob) },
      meta: paginationMeta(page, limit, total),
    });
  }),
);

jobsRouter.get(
  "/jobs/:jobId",
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw badRequest("Authenticated user context is required");
    }

    await processDueRepeatJobs();

    const jobId = assertJobId(req.params.jobId);
    const job = await findVisibleRepairJobOrThrow(jobId);

    res.status(200).json({ success: true, data: serializeRepairJob(job) });
  }),
);

jobsRouter.post(
  "/jobs",
  requireFeature("create_garage_job"),
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw badRequest("Authenticated user context is required");
    }

    const parsedBody = createRepairJobSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid repair job payload", {
        issues: parsedBody.error.issues,
      });
    }

    const busId = await resolveBusId(parsedBody.data.busNumber);

    const category = await prisma.repairCategory.findUnique({
      where: { id: parsedBody.data.repairCategoryId },
      select: { id: true },
    });
    if (!category) {
      throw notFound("Repair category not found");
    }
    const categoryChildCount = await prisma.repairCategory.count({
      where: { parentId: parsedBody.data.repairCategoryId },
    });
    if (categoryChildCount > 0) {
      throw badRequest("Repair category must be a leaf node (no subcategories)");
    }

    if (parsedBody.data.reportedDriverId) {
      const driver = await prisma.driver.findUnique({
        where: { id: parsedBody.data.reportedDriverId },
        select: { id: true },
      });
      if (!driver) {
        throw notFound("Reported driver not found");
      }
    }

    if (parsedBody.data.assignedToOfficeStaffId) {
      try {
        await assertAssignableOfficeStaff(parsedBody.data.assignedToOfficeStaffId);
      } catch (error) {
        throw badRequest(
          error instanceof Error ? error.message : "Invalid office staff assignee",
        );
      }
    }

    const initialStatus =
      parsedBody.data.status ??
      (parsedBody.data.assignedToOfficeStaffId
        ? RepairJobStatus.assigned
        : RepairJobStatus.created);

    const job = await prisma.$transaction(async (tx) => {
      const jobIdNumber = await generateRepairJobIdNumber(tx);

      const createdJob = await tx.repairJob.create({
        data: {
          jobIdNumber,
          busId,
          odometerReading: parsedBody.data.odometerReading,
          repairCategoryId: parsedBody.data.repairCategoryId,
          priority: parsedBody.data.priority,
          reportedDriverId: parsedBody.data.reportedDriverId ?? null,
          assignedToOfficeStaffId: parsedBody.data.assignedToOfficeStaffId ?? null,
          description: parsedBody.data.description,
          status: initialStatus,
          createdById: req.user!.sub,
        },
        select: { id: true },
      });

      await tx.repairJobActivityLog.create({
        data: {
          repairJobId: createdJob.id,
          actorUserId: req.user!.sub,
          actionType: RepairJobActivityType.created,
          toStatus: initialStatus,
        },
      });

      return tx.repairJob.findUniqueOrThrow({
        where: { id: createdJob.id },
        select: repairJobSelect,
      });
    });

    res.status(201).json({ success: true, data: serializeRepairJob(job) });
  }),
);

jobsRouter.patch(
  "/jobs/:jobId",
  requireFeature("manage_garage_job"),
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw badRequest("Authenticated user context is required");
    }

    const jobId = assertJobId(req.params.jobId);
    const parsedBody = updateRepairJobSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid repair job update payload", {
        issues: parsedBody.error.issues,
      });
    }

    const existing = await findVisibleRepairJobOrThrow(jobId);

    if (parsedBody.data.repairCategoryId) {
      const category = await prisma.repairCategory.findUnique({
        where: { id: parsedBody.data.repairCategoryId },
        select: { id: true },
      });
      if (!category) {
        throw notFound("Repair category not found");
      }
      const categoryChildCount = await prisma.repairCategory.count({
        where: { parentId: parsedBody.data.repairCategoryId },
      });
      if (categoryChildCount > 0) {
        throw badRequest("Repair category must be a leaf node (no subcategories)");
      }
    }

    if (parsedBody.data.reportedDriverId) {
      const driver = await prisma.driver.findUnique({
        where: { id: parsedBody.data.reportedDriverId },
        select: { id: true },
      });
      if (!driver) {
        throw notFound("Reported driver not found");
      }
    }

    if (parsedBody.data.assignedToOfficeStaffId) {
      try {
        await assertAssignableOfficeStaff(parsedBody.data.assignedToOfficeStaffId);
      } catch (error) {
        throw badRequest(
          error instanceof Error ? error.message : "Invalid office staff assignee",
        );
      }
    }

    if (parsedBody.data.status !== undefined) {
      const allowed = allowedRepairJobStatusTransitions[existing.status];
      if (!allowed.includes(parsedBody.data.status)) {
        throw badRequest(
          `Cannot transition repair job from ${existing.status} to ${parsedBody.data.status}`,
        );
      }
    }

    if (
      parsedBody.data.status === RepairJobStatus.completed &&
      !parsedBody.data.note
    ) {
      throw badRequest(
        "A note is required before changing status to Completed. Please add a short completion note and try again.",
      );
    }

    if (
      parsedBody.data.status === RepairJobStatus.on_hold &&
      !parsedBody.data.note
    ) {
      throw badRequest(
        "A note is required before changing status to On Hold. Please explain why the job is on hold and try again.",
      );
    }

    if (parsedBody.data.scheduleRepeatFor) {
      const scheduledDate = new Date(parsedBody.data.scheduleRepeatFor);
      if (scheduledDate.getTime() <= Date.now()) {
        throw badRequest("Repeat job must be scheduled for a future date");
      }
    }

    const updateData: Prisma.RepairJobUpdateInput = {};

    if (parsedBody.data.odometerReading !== undefined) {
      updateData.odometerReading = parsedBody.data.odometerReading;
    }
    if (parsedBody.data.repairCategoryId !== undefined) {
      updateData.repairCategory = { connect: { id: parsedBody.data.repairCategoryId } };
    }
    if (parsedBody.data.priority !== undefined) {
      updateData.priority = parsedBody.data.priority;
    }
    if (parsedBody.data.reportedDriverId !== undefined) {
      updateData.reportedDriver = parsedBody.data.reportedDriverId
        ? { connect: { id: parsedBody.data.reportedDriverId } }
        : { disconnect: true };
    }
    if (parsedBody.data.assignedToOfficeStaffId !== undefined) {
      updateData.assignedToOfficeStaff = parsedBody.data.assignedToOfficeStaffId
        ? { connect: { id: parsedBody.data.assignedToOfficeStaffId } }
        : { disconnect: true };
    }
    if (parsedBody.data.description !== undefined) {
      updateData.description = parsedBody.data.description;
    }
    if (parsedBody.data.status !== undefined) {
      updateData.status = parsedBody.data.status;
      if (parsedBody.data.status === RepairJobStatus.closed) {
        updateData.closedAt = new Date();
      }
    }
    if (parsedBody.data.scheduleRepeatFor !== undefined) {
      updateData.repeatScheduledFor = new Date(parsedBody.data.scheduleRepeatFor);
      updateData.repeatProcessedAt = null;
    }

    const job = await prisma.$transaction(async (tx) => {
      await tx.repairJob.update({
        where: { id: existing.id },
        data: updateData,
      });

      if (parsedBody.data.status !== undefined) {
        await tx.repairJobActivityLog.create({
          data: {
            repairJobId: existing.id,
            actorUserId: req.user!.sub,
            actionType: repairJobStatusActivityType(parsedBody.data.status),
            fromStatus: existing.status,
            toStatus: parsedBody.data.status,
            note: parsedBody.data.note,
          },
        });
      }

      return tx.repairJob.findUniqueOrThrow({
        where: { id: existing.id },
        select: repairJobSelect,
      });
    });

    res.status(200).json({ success: true, data: serializeRepairJob(job) });
  }),
);

jobsRouter.get(
  "/jobs/:jobId/timeline",
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw badRequest("Authenticated user context is required");
    }

    const jobId = assertJobId(req.params.jobId);
    await findVisibleRepairJobOrThrow(jobId);

    const activity = await prisma.repairJobActivityLog.findMany({
      where: { repairJobId: jobId },
      orderBy: [{ createdAt: "asc" }],
      select: repairJobActivityLogSelect,
    });

    res.status(200).json({
      success: true,
      data: {
        jobId,
        items: activity,
      },
    });
  }),
);

jobsRouter.post(
  "/jobs/:jobId/comments",
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw badRequest("Authenticated user context is required");
    }

    const jobId = assertJobId(req.params.jobId);
    const parsedBody = createRepairJobCommentSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid comment payload", {
        issues: parsedBody.error.issues,
      });
    }

    await findVisibleRepairJobOrThrow(jobId);

    const comment = await prisma.repairJobActivityLog.create({
      data: {
        repairJobId: jobId,
        actorUserId: req.user.sub,
        actionType: RepairJobActivityType.commented,
        note: parsedBody.data.note,
      },
      select: repairJobActivityLogSelect,
    });

    res.status(201).json({
      success: true,
      data: comment,
    });
  }),
);

jobsRouter.post(
  "/jobs/:jobId/parts",
  requireFeature("manage_garage_job"),
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw badRequest("Authenticated user context is required");
    }

    const jobId = assertJobId(req.params.jobId);
    const parsedBody = addRepairJobPartSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid repair job part payload", {
        issues: parsedBody.error.issues,
      });
    }

    await findVisibleRepairJobOrThrow(jobId);

    const part = await prisma.repairPart.findUnique({
      where: { id: parsedBody.data.repairPartId },
      select: { id: true, price: true },
    });
    if (!part) {
      throw notFound("Repair part not found");
    }

    await prisma.repairJobPart.create({
      data: {
        repairJobId: jobId,
        repairPartId: part.id,
        quantity: parsedBody.data.quantity,
        unitPrice: part.price,
        addedById: req.user.sub,
      },
    });

    const job = await prisma.repairJob.findUnique({
      where: { id: jobId },
      select: repairJobSelect,
    });

    res.status(201).json({ success: true, data: serializeRepairJob(job!) });
  }),
);

jobsRouter.delete(
  "/jobs/:jobId/parts/:lineId",
  requireFeature("manage_garage_job"),
  asyncHandler(async (req, res) => {
    const jobId = assertJobId(req.params.jobId);
    const lineId = assertJobId(req.params.lineId);

    await findVisibleRepairJobOrThrow(jobId);

    const existingLine = await prisma.repairJobPart.findFirst({
      where: { id: lineId, repairJobId: jobId },
      select: { id: true },
    });
    if (!existingLine) {
      throw notFound("Repair job part not found");
    }

    await prisma.repairJobPart.delete({ where: { id: lineId } });

    const job = await prisma.repairJob.findUnique({
      where: { id: jobId },
      select: repairJobSelect,
    });

    res.json({ success: true, data: serializeRepairJob(job!) });
  }),
);

jobsRouter.delete(
  "/jobs/:jobId",
  requireFeature("manage_garage_job"),
  asyncHandler(async (req, res) => {
    if (!req.user) {
      throw badRequest("Authenticated user context is required");
    }

    const jobId = assertJobId(req.params.jobId);

    if (req.user.roleCode === RoleCode.worker) {
      throw forbidden("Only administrators and supervisors can delete repair jobs");
    }

    const existing = await prisma.repairJob.findFirst({
      where: { id: jobId, ...repairJobNotDeletedWhere },
      select: { id: true },
    });
    if (!existing) {
      throw notFound("Repair job not found");
    }

    await prisma.repairJob.update({
      where: { id: jobId },
      data: { deletedAt: new Date() },
    });

    res.status(200).json({ success: true, data: { id: jobId } });
  }),
);

export { jobsRouter };
