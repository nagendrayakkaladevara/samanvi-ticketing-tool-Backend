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

const helperListSelect = {
  id: true,
  helperIdNumber: true,
  nickName: true,
  aadharName: true,
  mobileNumber: true,
  alternateNumber: true,
  emergencyMobile: true,
  aadharNumber: true,
  reference: true,
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
} satisfies Prisma.HelperSelect;

const helperDetailSelect = {
  ...helperListSelect,
  aadharCardFront: true,
  aadharCardBack: true,
  upiScanner: true,
} satisfies Prisma.HelperSelect;

const createHelperSchema = z.object({
  nickName: z.string().trim().min(1).max(120),
  aadharName: z.string().trim().min(1).max(120),
  mobileNumber: mobileNumberSchema,
  alternateNumber: optionalMobileNumberSchema,
  emergencyMobile: optionalMobileNumberSchema,
  aadharNumber: aadharNumberSchema,
  reference: z.string().trim().min(1).max(120),
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

const updateHelperSchema = createHelperSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

function serializeHelperListItem(
  helper: Prisma.HelperGetPayload<{ select: typeof helperListSelect }>,
) {
  return {
    ...helper,
    dateOfJoining: formatDdMmYyyy(helper.dateOfJoining)!,
    dateOfLeaving: formatDdMmYyyy(helper.dateOfLeaving),
  };
}

function serializeHelperDetail(
  helper: Prisma.HelperGetPayload<{ select: typeof helperDetailSelect }>,
) {
  return {
    ...serializeHelperListItem(helper),
    aadharCardFront: encodeBase64Document(helper.aadharCardFront)!,
    aadharCardBack: encodeBase64Document(helper.aadharCardBack)!,
    upiScanner: encodeBase64Document(helper.upiScanner),
  };
}

function buildHelperWriteData(
  data: z.infer<typeof createHelperSchema>,
): Omit<Prisma.HelperCreateInput, "helperIdNumber"> {
  return {
    nickName: data.nickName,
    aadharName: data.aadharName,
    mobileNumber: data.mobileNumber,
    alternateNumber: data.alternateNumber ?? null,
    emergencyMobile: data.emergencyMobile ?? null,
    aadharNumber: data.aadharNumber,
    reference: data.reference,
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

function buildHelperUpdateData(
  data: z.infer<typeof updateHelperSchema>,
): Prisma.HelperUpdateInput {
  const updateData: Prisma.HelperUpdateInput = {};

  if (data.nickName !== undefined) updateData.nickName = data.nickName;
  if (data.aadharName !== undefined) updateData.aadharName = data.aadharName;
  if (data.mobileNumber !== undefined) updateData.mobileNumber = data.mobileNumber;
  if (data.alternateNumber !== undefined) {
    updateData.alternateNumber = data.alternateNumber ?? null;
  }
  if (data.emergencyMobile !== undefined) {
    updateData.emergencyMobile = data.emergencyMobile ?? null;
  }
  if (data.aadharNumber !== undefined) updateData.aadharNumber = data.aadharNumber;
  if (data.reference !== undefined) updateData.reference = data.reference;
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

const helpersRouter = Router();

helpersRouter.use(requireAuth);

helpersRouter.get(
  "/helpers",
  asyncHandler(async (req, res) => {
    const parsedQuery = paginationQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      throw badRequest("Invalid query params", { issues: parsedQuery.error.issues });
    }

    const { page, limit } = parsedQuery.data;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.helper.findMany({
        orderBy: { helperIdNumber: "asc" },
        skip,
        take: limit,
        select: helperListSelect,
      }),
      prisma.helper.count(),
    ]);

    res.status(200).json({
      success: true,
      data: { items: items.map(serializeHelperListItem) },
      meta: paginationMeta(page, limit, total),
    });
  }),
);

helpersRouter.get(
  "/helpers/:helperId",
  asyncHandler(async (req, res) => {
    const helperId = req.params.helperId;
    if (!helperId || Array.isArray(helperId)) {
      throw badRequest("Invalid helper id");
    }

    const helper = await prisma.helper.findUnique({
      where: { id: helperId },
      select: helperDetailSelect,
    });
    if (!helper) {
      throw notFound("Helper not found");
    }

    res.status(200).json({ success: true, data: serializeHelperDetail(helper) });
  }),
);

helpersRouter.post(
  "/helpers",
  requireFeature("manage_master"),
  asyncHandler(async (req, res) => {
    const parsedBody = createHelperSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid helper payload", {
        issues: parsedBody.error.issues,
      });
    }

    try {
      const helper = await prisma.$transaction(async (tx) => {
        const helperIdNumber = await generateSequentialCode("H", async () => {
          const latest = await tx.helper.findFirst({
            orderBy: { helperIdNumber: "desc" },
            select: { helperIdNumber: true },
          });
          return latest?.helperIdNumber ?? null;
        });

        return tx.helper.create({
          data: {
            ...buildHelperWriteData(parsedBody.data),
            helperIdNumber,
          },
          select: helperDetailSelect,
        });
      });

      res.status(201).json({ success: true, data: serializeHelperDetail(helper) });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw conflict("Helper with duplicate unique field already exists");
      }
      throw error;
    }
  }),
);

helpersRouter.patch(
  "/helpers/:helperId",
  requireFeature("manage_master"),
  asyncHandler(async (req, res) => {
    const helperId = req.params.helperId;
    if (!helperId || Array.isArray(helperId)) {
      throw badRequest("Invalid helper id");
    }

    const parsedBody = updateHelperSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw badRequest("Invalid helper payload", {
        issues: parsedBody.error.issues,
      });
    }

    const existing = await prisma.helper.findUnique({
      where: { id: helperId },
      select: { id: true },
    });
    if (!existing) {
      throw notFound("Helper not found");
    }

    try {
      const helper = await prisma.helper.update({
        where: { id: helperId },
        data: buildHelperUpdateData(parsedBody.data),
        select: helperDetailSelect,
      });

      res.status(200).json({ success: true, data: serializeHelperDetail(helper) });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw conflict("Helper with duplicate unique field already exists");
      }
      throw error;
    }
  }),
);

helpersRouter.delete(
  "/helpers/:helperId",
  requireFeature("manage_master"),
  asyncHandler(async (req, res) => {
    const helperId = req.params.helperId;
    if (!helperId || Array.isArray(helperId)) {
      throw badRequest("Invalid helper id");
    }

    const existing = await prisma.helper.findUnique({
      where: { id: helperId },
      select: { id: true },
    });
    if (!existing) {
      throw notFound("Helper not found");
    }

    await prisma.helper.delete({ where: { id: helperId } });

    res.status(200).json({ success: true, data: { id: helperId } });
  }),
);

export { helpersRouter };
