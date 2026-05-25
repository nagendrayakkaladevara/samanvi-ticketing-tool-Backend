import { z } from "zod";

type PrismaBytes = Uint8Array<ArrayBuffer>;

const DD_MM_YYYY_REGEX = /^(0[1-9]|[12]\d|3[01])-(0[1-9]|1[0-2])-\d{4}$/;

export const ddMmYyyySchema = z
  .string()
  .trim()
  .regex(DD_MM_YYYY_REGEX, "Date must be in dd-mm-yyyy format");

export const optionalDdMmYyyySchema = ddMmYyyySchema.optional();

function emptyToUndefined<T>(value: T): T | undefined {
  if (value === "" || value === null) {
    return undefined;
  }
  return value;
}

export const nullableDdMmYyyySchema = z.preprocess(
  (value) => (value === "" ? null : value),
  ddMmYyyySchema.nullable().optional(),
);

export function parseDdMmYyyy(value: string): Date {
  const [day, month, year] = value.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day));
}

export function formatDdMmYyyy(value: Date | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const day = String(value.getUTCDate()).padStart(2, "0");
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const year = value.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export function paginationMeta(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(Math.ceil(total / limit), 1),
  };
}

export const base64DocumentSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => {
    try {
      return Buffer.from(value, "base64").length > 0;
    } catch {
      return false;
    }
  }, "Document must be a valid base64 string");

export const optionalBase64DocumentSchema = z.preprocess(
  emptyToUndefined,
  base64DocumentSchema.optional(),
);

export function decodeBase64Document(value: string): PrismaBytes {
  const buf = Buffer.from(value, "base64");
  return new Uint8Array(buf) as PrismaBytes;
}

export function encodeBase64Document(
  value: Uint8Array | Buffer | null | undefined,
): string | null {
  if (!value || value.length === 0) {
    return null;
  }
  return Buffer.from(value).toString("base64");
}

export async function generateSequentialCode(
  prefix: string,
  findLatest: () => Promise<string | null>,
): Promise<string> {
  const latest = await findLatest();
  const latestNumber = latest ? Number.parseInt(latest.slice(prefix.length), 10) : 0;
  const nextNumber = latestNumber + 1;

  if (nextNumber > 9999) {
    throw new Error(`${prefix} ID capacity reached (9999)`);
  }

  return `${prefix}${String(nextNumber).padStart(4, "0")}`;
}

export function normalizeBusNumber(busNumber: string): string {
  return busNumber.trim().toUpperCase();
}

export const mobileNumberSchema = z
  .string()
  .trim()
  .regex(/^\d{10}$/, "Mobile number must be exactly 10 digits");

export const optionalMobileNumberSchema = z.preprocess(
  emptyToUndefined,
  mobileNumberSchema.optional(),
);

export const optionalUpiIdSchema = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(1).max(120).optional(),
);

export const optionalRemarksSchema = z.preprocess(
  emptyToUndefined,
  z.string().trim().max(500).optional(),
);

export const aadharNumberSchema = z
  .string()
  .trim()
  .regex(/^\d{12}$/, "Aadhar number must be exactly 12 digits");

export const ifscCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "IFSC code must be valid");

export const decimalAmountSchema = z.coerce.number().nonnegative();
