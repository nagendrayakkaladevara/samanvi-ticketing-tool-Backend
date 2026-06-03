import { LinkedEmployeeType, Prisma } from "@prisma/client";
import { conflict, notFound } from "../core/errors/http-errors";
import { prisma } from "./prisma";

export const LINKED_EMPLOYEE_TYPES = [
  "driver",
  "helper",
  "office_staff",
] as const satisfies readonly LinkedEmployeeType[];

export type LinkableEmployeeItem = {
  id: string;
  name: string;
  employeeId: string;
  employeeType: LinkedEmployeeType;
};

const activeEmployeeFilter = { dateOfLeaving: null };

export function formatEmployeeDropdownLabel(name: string, employeeId: string): string {
  return `${name} - ${employeeId}`;
}

function driverDisplayName(aadharName: string): string {
  return aadharName;
}

function helperDisplayName(aadharName: string, nickName: string): string {
  return aadharName || nickName;
}

function officeStaffDisplayName(aadharName: string, nickName: string): string {
  return aadharName || nickName;
}

export async function listLinkableEmployees(
  excludeUserId?: string,
): Promise<LinkableEmployeeItem[]> {
  const [linkedDriverIds, linkedHelperIds, linkedOfficeStaffIds] = await Promise.all([
    prisma.user.findMany({
      where: {
        linkedDriverId: { not: null },
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { linkedDriverId: true },
    }),
    prisma.user.findMany({
      where: {
        linkedHelperId: { not: null },
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { linkedHelperId: true },
    }),
    prisma.user.findMany({
      where: {
        linkedOfficeStaffId: { not: null },
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { linkedOfficeStaffId: true },
    }),
  ]);

  const takenDriverIds = new Set(
    linkedDriverIds.map((row) => row.linkedDriverId).filter((id): id is string => id !== null),
  );
  const takenHelperIds = new Set(
    linkedHelperIds.map((row) => row.linkedHelperId).filter((id): id is string => id !== null),
  );
  const takenOfficeStaffIds = new Set(
    linkedOfficeStaffIds
      .map((row) => row.linkedOfficeStaffId)
      .filter((id): id is string => id !== null),
  );

  const [drivers, helpers, officeStaff] = await Promise.all([
    prisma.driver.findMany({
      where: {
        ...activeEmployeeFilter,
        id: { notIn: [...takenDriverIds] },
      },
      orderBy: { aadharName: "asc" },
      select: { id: true, aadharName: true, driverIdNumber: true },
    }),
    prisma.helper.findMany({
      where: {
        ...activeEmployeeFilter,
        id: { notIn: [...takenHelperIds] },
      },
      orderBy: { aadharName: "asc" },
      select: { id: true, aadharName: true, nickName: true, helperIdNumber: true },
    }),
    prisma.officeStaff.findMany({
      where: {
        ...activeEmployeeFilter,
        id: { notIn: [...takenOfficeStaffIds] },
      },
      orderBy: { aadharName: "asc" },
      select: { id: true, aadharName: true, nickName: true, staffIdNumber: true },
    }),
  ]);

  const items: LinkableEmployeeItem[] = [
    ...drivers.map((driver) => {
      const name = driverDisplayName(driver.aadharName);
      return {
        id: driver.id,
        name: formatEmployeeDropdownLabel(name, driver.driverIdNumber),
        employeeId: driver.driverIdNumber,
        employeeType: LinkedEmployeeType.driver,
      };
    }),
    ...helpers.map((helper) => {
      const name = helperDisplayName(helper.aadharName, helper.nickName);
      return {
        id: helper.id,
        name: formatEmployeeDropdownLabel(name, helper.helperIdNumber),
        employeeId: helper.helperIdNumber,
        employeeType: LinkedEmployeeType.helper,
      };
    }),
    ...officeStaff.map((staff) => {
      const name = officeStaffDisplayName(staff.aadharName, staff.nickName);
      return {
        id: staff.id,
        name: formatEmployeeDropdownLabel(name, staff.staffIdNumber),
        employeeId: staff.staffIdNumber,
        employeeType: LinkedEmployeeType.office_staff,
      };
    }),
  ];

  items.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));

  return items;
}

export type ResolvedEmployeeLink = {
  linkedEmployeeType: LinkedEmployeeType;
  linkedDriverId: string | null;
  linkedHelperId: string | null;
  linkedOfficeStaffId: string | null;
  display: {
    id: string;
    name: string;
    employeeId: string;
    employeeType: LinkedEmployeeType;
  };
};

export async function resolveEmployeeLink(
  employeeType: LinkedEmployeeType,
  employeeId: string,
  options?: { excludeUserId?: string },
): Promise<ResolvedEmployeeLink> {
  const excludeUserId = options?.excludeUserId;

  const existingLink = await prisma.user.findFirst({
    where: {
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      OR: [
        { linkedDriverId: employeeId },
        { linkedHelperId: employeeId },
        { linkedOfficeStaffId: employeeId },
      ],
    },
    select: { id: true },
  });

  if (existingLink) {
    throw conflict("This employee is already linked to another application user");
  }

  if (employeeType === LinkedEmployeeType.driver) {
    const driver = await prisma.driver.findUnique({
      where: { id: employeeId },
      select: { id: true, aadharName: true, driverIdNumber: true, dateOfLeaving: true },
    });
    if (!driver) {
      throw notFound("Driver not found");
    }
    if (driver.dateOfLeaving) {
      throw conflict("Cannot link an employee who has left");
    }
    const displayName = driverDisplayName(driver.aadharName);
    return {
      linkedEmployeeType: LinkedEmployeeType.driver,
      linkedDriverId: driver.id,
      linkedHelperId: null,
      linkedOfficeStaffId: null,
      display: {
        id: driver.id,
        name: formatEmployeeDropdownLabel(displayName, driver.driverIdNumber),
        employeeId: driver.driverIdNumber,
        employeeType: LinkedEmployeeType.driver,
      },
    };
  }

  if (employeeType === LinkedEmployeeType.helper) {
    const helper = await prisma.helper.findUnique({
      where: { id: employeeId },
      select: { id: true, aadharName: true, nickName: true, helperIdNumber: true, dateOfLeaving: true },
    });
    if (!helper) {
      throw notFound("Helper not found");
    }
    if (helper.dateOfLeaving) {
      throw conflict("Cannot link an employee who has left");
    }
    const displayName = helperDisplayName(helper.aadharName, helper.nickName);
    return {
      linkedEmployeeType: LinkedEmployeeType.helper,
      linkedDriverId: null,
      linkedHelperId: helper.id,
      linkedOfficeStaffId: null,
      display: {
        id: helper.id,
        name: formatEmployeeDropdownLabel(displayName, helper.helperIdNumber),
        employeeId: helper.helperIdNumber,
        employeeType: LinkedEmployeeType.helper,
      },
    };
  }

  const staff = await prisma.officeStaff.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      aadharName: true,
      nickName: true,
      staffIdNumber: true,
      dateOfLeaving: true,
    },
  });
  if (!staff) {
    throw notFound("Office staff not found");
  }
  if (staff.dateOfLeaving) {
    throw conflict("Cannot link an employee who has left");
  }
  const displayName = officeStaffDisplayName(staff.aadharName, staff.nickName);
  return {
    linkedEmployeeType: LinkedEmployeeType.office_staff,
    linkedDriverId: null,
    linkedHelperId: null,
    linkedOfficeStaffId: staff.id,
    display: {
      id: staff.id,
      name: formatEmployeeDropdownLabel(displayName, staff.staffIdNumber),
      employeeId: staff.staffIdNumber,
      employeeType: LinkedEmployeeType.office_staff,
    },
  };
}

export const applicationUserEmployeeSelect = {
  linkedEmployeeType: true,
  linkedDriver: {
    select: { id: true, aadharName: true, driverIdNumber: true },
  },
  linkedHelper: {
    select: { id: true, aadharName: true, nickName: true, helperIdNumber: true },
  },
  linkedOfficeStaff: {
    select: { id: true, aadharName: true, nickName: true, staffIdNumber: true },
  },
} satisfies Prisma.UserSelect;

type UserWithEmployeeLink = Prisma.UserGetPayload<{
  select: typeof applicationUserEmployeeSelect;
}>;

export function serializeLinkedEmployee(user: UserWithEmployeeLink) {
  if (!user.linkedEmployeeType) {
    return null;
  }

  if (user.linkedEmployeeType === LinkedEmployeeType.driver && user.linkedDriver) {
    const displayName = driverDisplayName(user.linkedDriver.aadharName);
    return {
      id: user.linkedDriver.id,
      name: formatEmployeeDropdownLabel(displayName, user.linkedDriver.driverIdNumber),
      employeeId: user.linkedDriver.driverIdNumber,
      employeeType: LinkedEmployeeType.driver,
    };
  }

  if (user.linkedEmployeeType === LinkedEmployeeType.helper && user.linkedHelper) {
    const displayName = helperDisplayName(user.linkedHelper.aadharName, user.linkedHelper.nickName);
    return {
      id: user.linkedHelper.id,
      name: formatEmployeeDropdownLabel(displayName, user.linkedHelper.helperIdNumber),
      employeeId: user.linkedHelper.helperIdNumber,
      employeeType: LinkedEmployeeType.helper,
    };
  }

  if (user.linkedEmployeeType === LinkedEmployeeType.office_staff && user.linkedOfficeStaff) {
    const displayName = officeStaffDisplayName(
      user.linkedOfficeStaff.aadharName,
      user.linkedOfficeStaff.nickName,
    );
    return {
      id: user.linkedOfficeStaff.id,
      name: formatEmployeeDropdownLabel(
        displayName,
        user.linkedOfficeStaff.staffIdNumber,
      ),
      employeeId: user.linkedOfficeStaff.staffIdNumber,
      employeeType: LinkedEmployeeType.office_staff,
    };
  }

  return null;
}
