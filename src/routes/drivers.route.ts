import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../core/http/async-handler";
import { badRequest, conflict, notFound } from "../core/errors/http-errors";
import { prisma } from "../lib/prisma";
import {
  aadharNumberSchema,
  base64DocumentSchema,
  ddMmYyyySchema,
  decodeBase64Document,
  encodeBase64Document,
  formatDdMmYyyy,
  generateSequentialCode,
  ifscCodeSchema,
  mobileNumberSchema,
  nullableDdMmYyyySchema,
  optionalBase64DocumentSchema,
  optionalMobileNumberSchema,
  optionalRemarksSchema,
  optionalUpiIdSchema,
  paginationMeta,
  paginationQuerySchema,
  parseDdMmYyyy,
} from "../lib/master";
import { requireAuth, requireFeature } from "../middleware/auth";

const driverListSelect = {
  id: true,
  driverIdNumber: true,
  aadharName: true,
  dlName: true,
  dateOfBirth: true,
  mobileNumber: true,
  alternateMobile: true,
  emergencyNumber: true,
  aadharNumber: true,
  dlNumber: true,
  accountHolderName: true,
  accountNumber: true,
  bankName: true,
  branchName: true,
  ifscCode: true,
  upiId: true,
  dlIssueDate: true,
  dlExpiryDate: true,
  transportIssueDate: true,
  transportValidFrom: true,
  transportValidTo: true,
  dateOfJoining: true,
  dateOfLeaving: true,
  referenceName: true,
  remarks: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DriverSelect;

const driverDetailSelect = {
  ...driverListSelect,
  aadharCardFront: true,
  aadharCardBack: true,
  dlFront: true,
  dlBack: true,
  upiScanner: true,
} satisfies Prisma.DriverSelect;

const createDriverSchema = z.object({
  aadharName: z.string().trim().min(1).max(120),
  dlName: z.string().trim().min(1).max(120),
  dateOfBirth: ddMmYyyySchema,
  mobileNumber: mobileNumberSchema,
  alternateMobile: optionalMobileNumberSchema,
  emergencyNumber: optionalMobileNumberSchema,
  aadharNumber: aadharNumberSchema,
  dlNumber: z.string().trim().min(1).max(30),
  accountHolderName: z.string().trim().min(1).max(120),
  accountNumber: z.string().trim().min(1).max(30),
  bankName: z.string().trim().min(1).max(120),
  branchName: z.string().trim().min(1).max(120),
  ifscCode: ifscCodeSchema,
  upiId: optionalUpiIdSchema,
  dlIssueDate: ddMmYyyySchema,
  dlExpiryDate: ddMmYyyySchema,
  transportIssueDate: ddMmYyyySchema,
  transportValidFrom: ddMmYyyySchema,
  transportValidTo: ddMmYyyySchema,
  dateOfJoining: ddMmYyyySchema,
  dateOfLeaving: nullableDdMmYyyySchema,
  referenceName: z.string().trim().min(1).max(120),
  remarks: optionalRemarksSchema,
  aadharCardFront: base64DocumentSchema,
  aadharCardBack: base64DocumentSchema,
  dlFront: base64DocumentSchema,
  dlBack: base64DocumentSchema,
  upiScanner: optionalBase64DocumentSchema,
});

const updateDriverSchema = createDriverSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

function serializeDriverListItem(
  driver: Prisma.DriverGetPayload<{ select: typeof driverListSelect }>,
) {
  return {
    ...driver,
    dateOfBirth: formatDdMmYyyy(driver.dateOfBirth)!,
    dlIssueDate: formatDdMmYyyy(driver.dlIssueDate)!,
    dlExpiryDate: formatDdMmYyyy(driver.dlExpiryDate)!,
    transportIssueDate: formatDdMmYyyy(driver.transportIssueDate)!,
    transportValidFrom: formatDdMmYyyy(driver.transportValidFrom)!,
    transportValidTo: formatDdMmYyyy(driver.transportValidTo)!,
    dateOfJoining: formatDdMmYyyy(driver.dateOfJoining)!,
    dateOfLeaving: formatDdMmYyyy(driver.dateOfLeaving),
  };
}

function serializeDriverDetail(
  driver: Prisma.DriverGetPayload<{ select: typeof driverDetailSelect }>,
) {
  return {
    ...serializeDriverListItem(driver),
    aadharCardFront: encodeBase64Document(driver.aadharCardFront)!,
    aadharCardBack: encodeBase64Document(driver.aadharCardBack)!,
    dlFront: encodeBase64Document(driver.dlFront)!,
    dlBack: encodeBase64Document(driver.dlBack)!,
    upiScanner: encodeBase64Document(driver.upiScanner),
  };
}

function buildDriverWriteData(
  data: z.infer<typeof createDriverSchema>,
): Omit<Prisma.DriverCreateInput, "driverIdNumber"> {
  return {
    aadharName: data.aadharName,
    dlName: data.dlName,
    dateOfBirth: parseDdMmYyyy(data.dateOfBirth),
    mobileNumber: data.mobileNumber,
    alternateMobile: data.alternateMobile ?? null,
    emergencyNumber: data.emergencyNumber ?? null,
    aadharNumber: data.aadharNumber,
    dlNumber: data.dlNumber,
    accountHolderName: data.accountHolderName,
    accountNumber: data.accountNumber,
    bankName: data.bankName,
    branchName: data.branchName,
    ifscCode: data.ifscCode,
    upiId: data.upiId ?? null,
    dlIssueDate: parseDdMmYyyy(data.dlIssueDate),
    dlExpiryDate: parseDdMmYyyy(data.dlExpiryDate),
    transportIssueDate: parseDdMmYyyy(data.transportIssueDate),
    transportValidFrom: parseDdMmYyyy(data.transportValidFrom),
    transportValidTo: parseDdMmYyyy(data.transportValidTo),
    dateOfJoining: parseDdMmYyyy(data.dateOfJoining),
    dateOfLeaving: data.dateOfLeaving ? parseDdMmYyyy(data.dateOfLeaving) : null,
    referenceName: data.referenceName,
    remarks: data.remarks ?? null,
    aadharCardFront: decodeBase64Document(data.aadharCardFront),
    aadharCardBack: decodeBase64Document(data.aadharCardBack),
    dlFront: decodeBase64Document(data.dlFront),
    dlBack: decodeBase64Document(data.dlBack),
    upiScanner: data.upiScanner ? decodeBase64Document(data.upiScanner) : null,
  };
}

function buildDriverUpdateData(
  data: z.infer<typeof updateDriverSchema>,
): Prisma.DriverUpdateInput {
  const updateData: Prisma.DriverUpdateInput = {};

  if (data.aadharName !== undefined) updateData.aadharName = data.aadharName;
  if (data.dlName !== undefined) updateData.dlName = data.dlName;
  if (data.dateOfBirth !== undefined) {
    updateData.dateOfBirth = parseDdMmYyyy(data.dateOfBirth);
  }
  if (data.mobileNumber !== undefined) updateData.mobileNumber = data.mobileNumber;
  if (data.alternateMobile !== undefined) {
    updateData.alternateMobile = data.alternateMobile ?? null;
  }
  if (data.emergencyNumber !== undefined) {
    updateData.emergencyNumber = data.emergencyNumber ?? null;
  }
  if (data.aadharNumber !== undefined) updateData.aadharNumber = data.aadharNumber;
  if (data.dlNumber !== undefined) updateData.dlNumber = data.dlNumber;
  if (data.accountHolderName !== undefined) {
    updateData.accountHolderName = data.accountHolderName;
  }
  if (data.accountNumber !== undefined) updateData.accountNumber = data.accountNumber;
  if (data.bankName !== undefined) updateData.bankName = data.bankName;
  if (data.branchName !== undefined) updateData.branchName = data.branchName;
  if (data.ifscCode !== undefined) updateData.ifscCode = data.ifscCode;
  if (data.upiId !== undefined) updateData.upiId = data.upiId ?? null;
  if (data.dlIssueDate !== undefined) {
    updateData.dlIssueDate = parseDdMmYyyy(data.dlIssueDate);
  }
  if (data.dlExpiryDate !== undefined) {
    updateData.dlExpiryDate = parseDdMmYyyy(data.dlExpiryDate);
  }
  if (data.transportIssueDate !== undefined) {
    updateData.transportIssueDate = parseDdMmYyyy(data.transportIssueDate);
  }
  if (data.transportValidFrom !== undefined) {
    updateData.transportValidFrom = parseDdMmYyyy(data.transportValidFrom);
  }
  if (data.transportValidTo !== undefined) {
    updateData.transportValidTo = parseDdMmYyyy(data.transportValidTo);
  }
  if (data.dateOfJoining !== undefined) {
    updateData.dateOfJoining = parseDdMmYyyy(data.dateOfJoining);
  }
  if (data.dateOfLeaving !== undefined) {
    updateData.dateOfLeaving = data.dateOfLeaving
      ? parseDdMmYyyy(data.dateOfLeaving)
      : null;
  }
  if (data.referenceName !== undefined) updateData.referenceName = data.referenceName;
  if (data.remarks !== undefined) updateData.remarks = data.remarks ?? null;
  if (data.aadharCardFront !== undefined) {
    updateData.aadharCardFront = decodeBase64Document(data.aadharCardFront);
  }
  if (data.aadharCardBack !== undefined) {
    updateData.aadharCardBack = decodeBase64Document(data.aadharCardBack);
  }
  if (data.dlFront !== undefined) updateData.dlFront = decodeBase64Document(data.dlFront);
  if (data.dlBack !== undefined) updateData.dlBack = decodeBase64Document(data.dlBack);
  if (data.upiScanner !== undefined) {
    updateData.upiScanner = data.upiScanner
      ? decodeBase64Document(data.upiScanner)
      : null;
  }

  return updateData;
}

const driversRouter = Router();

driversRouter.use(requireAuth);

driversRouter.get(
  "/drivers",
  asyncHandler(async (req, res) => {
    const parsedQuery = paginationQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      throw badRequest("Invalid query params", { issues: parsedQuery.error.issues });
    }

    const { page, limit } = parsedQuery.data;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.driver.findMany({
        orderBy: { driverIdNumber: "asc" },
        skip,
        take: limit,
        select: driverListSelect,
      }),
      prisma.driver.count(),
    ]);

    res.status(200).json({
      success: true,
      data: { items: items.map(serializeDriverListItem) },
      meta: paginationMeta(page, limit, total),
    });
  }),
);

driversRouter.get(
  "/drivers/:driverId",
  asyncHandler(async (req, res) => {
    const driverId = req.params.driverId;
    if (!driverId || Array.isArray(driverId)) {
      throw badRequest("Invalid driver id");
    }

    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      select: driverDetailSelect,
    });
    if (!driver) {
      throw notFound("Driver not found");
    }

    res.status(200).json({ success: true, data: serializeDriverDetail(driver) });
  }),
);

driversRouter.post(
  "/drivers",
  requireFeature("manage_master"),
  asyncHandler(async (req, res) => {
    const parsedBody = createDriverSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid driver payload", {
        issues: parsedBody.error.issues,
      });
    }

    try {
      const driver = await prisma.$transaction(async (tx) => {
        const driverIdNumber = await generateSequentialCode("D", async () => {
          const latest = await tx.driver.findFirst({
            orderBy: { driverIdNumber: "desc" },
            select: { driverIdNumber: true },
          });
          return latest?.driverIdNumber ?? null;
        });

        return tx.driver.create({
          data: {
            ...buildDriverWriteData(parsedBody.data),
            driverIdNumber,
          },
          select: driverDetailSelect,
        });
      });

      res.status(201).json({ success: true, data: serializeDriverDetail(driver) });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw conflict("Driver with duplicate unique field already exists");
      }
      throw error;
    }
  }),
);

driversRouter.patch(
  "/drivers/:driverId",
  requireFeature("manage_master"),
  asyncHandler(async (req, res) => {
    const driverId = req.params.driverId;
    if (!driverId || Array.isArray(driverId)) {
      throw badRequest("Invalid driver id");
    }

    const parsedBody = updateDriverSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid driver payload", {
        issues: parsedBody.error.issues,
      });
    }

    const existing = await prisma.driver.findUnique({
      where: { id: driverId },
      select: { id: true },
    });
    if (!existing) {
      throw notFound("Driver not found");
    }

    try {
      const driver = await prisma.driver.update({
        where: { id: driverId },
        data: buildDriverUpdateData(parsedBody.data),
        select: driverDetailSelect,
      });

      res.status(200).json({ success: true, data: serializeDriverDetail(driver) });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw conflict("Driver with duplicate unique field already exists");
      }
      throw error;
    }
  }),
);

driversRouter.delete(
  "/drivers/:driverId",
  requireFeature("manage_master"),
  asyncHandler(async (req, res) => {
    const driverId = req.params.driverId;
    if (!driverId || Array.isArray(driverId)) {
      throw badRequest("Invalid driver id");
    }

    const existing = await prisma.driver.findUnique({
      where: { id: driverId },
      select: { id: true },
    });
    if (!existing) {
      throw notFound("Driver not found");
    }

    await prisma.driver.delete({ where: { id: driverId } });

    res.status(200).json({ success: true, data: { id: driverId } });
  }),
);

export { driversRouter };
