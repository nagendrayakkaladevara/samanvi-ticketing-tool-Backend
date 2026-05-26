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
  optionalShortStringSchema,
  paginationMeta,
  paginationQuerySchema,
  parseDdMmYyyy,
} from "../lib/master";
import { requireAuth, requireFeature } from "../middleware/auth";

const officeStaffListSelect = {
  id: true,
  staffIdNumber: true,
  designation: true,
  nickName: true,
  aadharName: true,
  mobileNumber: true,
  alternativeMobile: true,
  emergencyContact: true,
  aadharNumber: true,
  referenceName: true,
  accountHolderName: true,
  accountNumber: true,
  bankName: true,
  branchName: true,
  ifscCode: true,
  upiId: true,
  dateOfJoining: true,
  dateOfLeaving: true,
  remarks: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.OfficeStaffSelect;

const officeStaffDetailSelect = {
  ...officeStaffListSelect,
  aadharCardFront: true,
  aadharCardBack: true,
  upiScanner: true,
} satisfies Prisma.OfficeStaffSelect;

const createOfficeStaffSchema = z.object({
  designation: z.string().trim().min(1).max(120),
  nickName: z.string().trim().min(1).max(120),
  aadharName: z.string().trim().min(1).max(120),
  mobileNumber: mobileNumberSchema,
  alternativeMobile: optionalMobileNumberSchema,
  emergencyContact: optionalMobileNumberSchema,
  aadharNumber: aadharNumberSchema,
  referenceName: z.string().trim().min(1).max(120),
  accountHolderName: z.string().trim().min(1).max(120),
  accountNumber: z.string().trim().min(1).max(30),
  bankName: z.string().trim().min(1).max(120),
  branchName: z.string().trim().min(1).max(120),
  ifscCode: ifscCodeSchema,
  upiId: optionalShortStringSchema,
  dateOfJoining: ddMmYyyySchema,
  dateOfLeaving: nullableDdMmYyyySchema,
  remarks: optionalRemarksSchema,
  aadharCardFront: base64DocumentSchema,
  aadharCardBack: base64DocumentSchema,
  upiScanner: optionalBase64DocumentSchema,
});

const updateOfficeStaffSchema = createOfficeStaffSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

function serializeOfficeStaffListItem(
  staff: Prisma.OfficeStaffGetPayload<{ select: typeof officeStaffListSelect }>,
) {
  return {
    ...staff,
    dateOfJoining: formatDdMmYyyy(staff.dateOfJoining)!,
    dateOfLeaving: formatDdMmYyyy(staff.dateOfLeaving),
  };
}

function serializeOfficeStaffDetail(
  staff: Prisma.OfficeStaffGetPayload<{ select: typeof officeStaffDetailSelect }>,
) {
  return {
    ...serializeOfficeStaffListItem(staff),
    aadharCardFront: encodeBase64Document(staff.aadharCardFront)!,
    aadharCardBack: encodeBase64Document(staff.aadharCardBack)!,
    upiScanner: encodeBase64Document(staff.upiScanner),
  };
}

function buildOfficeStaffWriteData(
  data: z.infer<typeof createOfficeStaffSchema>,
): Omit<Prisma.OfficeStaffCreateInput, "staffIdNumber"> {
  return {
    designation: data.designation,
    nickName: data.nickName,
    aadharName: data.aadharName,
    mobileNumber: data.mobileNumber,
    alternativeMobile: data.alternativeMobile ?? null,
    emergencyContact: data.emergencyContact ?? null,
    aadharNumber: data.aadharNumber,
    referenceName: data.referenceName,
    accountHolderName: data.accountHolderName,
    accountNumber: data.accountNumber,
    bankName: data.bankName,
    branchName: data.branchName,
    ifscCode: data.ifscCode,
    upiId: data.upiId ?? null,
    dateOfJoining: parseDdMmYyyy(data.dateOfJoining),
    dateOfLeaving: data.dateOfLeaving ? parseDdMmYyyy(data.dateOfLeaving) : null,
    remarks: data.remarks ?? null,
    aadharCardFront: decodeBase64Document(data.aadharCardFront),
    aadharCardBack: decodeBase64Document(data.aadharCardBack),
    upiScanner: data.upiScanner ? decodeBase64Document(data.upiScanner) : null,
  };
}

function buildOfficeStaffUpdateData(
  data: z.infer<typeof updateOfficeStaffSchema>,
): Prisma.OfficeStaffUpdateInput {
  const updateData: Prisma.OfficeStaffUpdateInput = {};

  if (data.designation !== undefined) updateData.designation = data.designation;
  if (data.nickName !== undefined) updateData.nickName = data.nickName;
  if (data.aadharName !== undefined) updateData.aadharName = data.aadharName;
  if (data.mobileNumber !== undefined) updateData.mobileNumber = data.mobileNumber;
  if (data.alternativeMobile !== undefined) {
    updateData.alternativeMobile = data.alternativeMobile ?? null;
  }
  if (data.emergencyContact !== undefined) {
    updateData.emergencyContact = data.emergencyContact ?? null;
  }
  if (data.aadharNumber !== undefined) updateData.aadharNumber = data.aadharNumber;
  if (data.referenceName !== undefined) updateData.referenceName = data.referenceName;
  if (data.accountHolderName !== undefined) {
    updateData.accountHolderName = data.accountHolderName;
  }
  if (data.accountNumber !== undefined) updateData.accountNumber = data.accountNumber;
  if (data.bankName !== undefined) updateData.bankName = data.bankName;
  if (data.branchName !== undefined) updateData.branchName = data.branchName;
  if (data.ifscCode !== undefined) updateData.ifscCode = data.ifscCode;
  if (data.upiId !== undefined) updateData.upiId = data.upiId ?? null;
  if (data.dateOfJoining !== undefined) {
    updateData.dateOfJoining = parseDdMmYyyy(data.dateOfJoining);
  }
  if (data.dateOfLeaving !== undefined) {
    updateData.dateOfLeaving = data.dateOfLeaving
      ? parseDdMmYyyy(data.dateOfLeaving)
      : null;
  }
  if (data.remarks !== undefined) updateData.remarks = data.remarks ?? null;
  if (data.aadharCardFront !== undefined) {
    updateData.aadharCardFront = decodeBase64Document(data.aadharCardFront);
  }
  if (data.aadharCardBack !== undefined) {
    updateData.aadharCardBack = decodeBase64Document(data.aadharCardBack);
  }
  if (data.upiScanner !== undefined) {
    updateData.upiScanner = data.upiScanner
      ? decodeBase64Document(data.upiScanner)
      : null;
  }

  return updateData;
}

const officeStaffRouter = Router();

officeStaffRouter.use(requireAuth);

officeStaffRouter.get(
  "/office-staff",
  asyncHandler(async (req, res) => {
    const parsedQuery = paginationQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      throw badRequest("Invalid query params", { issues: parsedQuery.error.issues });
    }

    const { page, limit } = parsedQuery.data;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.officeStaff.findMany({
        orderBy: { staffIdNumber: "asc" },
        skip,
        take: limit,
        select: officeStaffListSelect,
      }),
      prisma.officeStaff.count(),
    ]);

    res.status(200).json({
      success: true,
      data: { items: items.map(serializeOfficeStaffListItem) },
      meta: paginationMeta(page, limit, total),
    });
  }),
);

officeStaffRouter.get(
  "/office-staff/:staffId",
  asyncHandler(async (req, res) => {
    const staffId = req.params.staffId;
    if (!staffId || Array.isArray(staffId)) {
      throw badRequest("Invalid office staff id");
    }

    const staff = await prisma.officeStaff.findUnique({
      where: { id: staffId },
      select: officeStaffDetailSelect,
    });
    if (!staff) {
      throw notFound("Office staff not found");
    }

    res.status(200).json({ success: true, data: serializeOfficeStaffDetail(staff) });
  }),
);

officeStaffRouter.post(
  "/office-staff",
  requireFeature("manage_master"),
  asyncHandler(async (req, res) => {
    const parsedBody = createOfficeStaffSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid office staff payload", {
        issues: parsedBody.error.issues,
      });
    }

    try {
      const staff = await prisma.$transaction(async (tx) => {
        const staffIdNumber = await generateSequentialCode("S", async () => {
          const latest = await tx.officeStaff.findFirst({
            orderBy: { staffIdNumber: "desc" },
            select: { staffIdNumber: true },
          });
          return latest?.staffIdNumber ?? null;
        });

        return tx.officeStaff.create({
          data: {
            ...buildOfficeStaffWriteData(parsedBody.data),
            staffIdNumber,
          },
          select: officeStaffDetailSelect,
        });
      });

      res.status(201).json({ success: true, data: serializeOfficeStaffDetail(staff) });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw conflict("Office staff with duplicate unique field already exists");
      }
      throw error;
    }
  }),
);

officeStaffRouter.patch(
  "/office-staff/:staffId",
  requireFeature("manage_master"),
  asyncHandler(async (req, res) => {
    const staffId = req.params.staffId;
    if (!staffId || Array.isArray(staffId)) {
      throw badRequest("Invalid office staff id");
    }

    const parsedBody = updateOfficeStaffSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid office staff payload", {
        issues: parsedBody.error.issues,
      });
    }

    const existing = await prisma.officeStaff.findUnique({
      where: { id: staffId },
      select: { id: true },
    });
    if (!existing) {
      throw notFound("Office staff not found");
    }

    try {
      const staff = await prisma.officeStaff.update({
        where: { id: staffId },
        data: buildOfficeStaffUpdateData(parsedBody.data),
        select: officeStaffDetailSelect,
      });

      res.status(200).json({ success: true, data: serializeOfficeStaffDetail(staff) });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw conflict("Office staff with duplicate unique field already exists");
      }
      throw error;
    }
  }),
);

officeStaffRouter.delete(
  "/office-staff/:staffId",
  requireFeature("manage_master"),
  asyncHandler(async (req, res) => {
    const staffId = req.params.staffId;
    if (!staffId || Array.isArray(staffId)) {
      throw badRequest("Invalid office staff id");
    }

    const existing = await prisma.officeStaff.findUnique({
      where: { id: staffId },
      select: { id: true },
    });
    if (!existing) {
      throw notFound("Office staff not found");
    }

    await prisma.officeStaff.delete({ where: { id: staffId } });

    res.status(200).json({ success: true, data: { id: staffId } });
  }),
);

export { officeStaffRouter };
