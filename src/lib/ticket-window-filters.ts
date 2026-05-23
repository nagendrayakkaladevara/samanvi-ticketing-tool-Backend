import { Prisma, TicketStatus } from "@prisma/client";

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addUtcDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

export function utcWindowRange(windowStart: Date, now: Date): Prisma.DateTimeFilter {
  return { gte: windowStart, lte: now };
}

export function computeUtcWindow(days: number, now: Date = new Date()) {
  const windowStart = addUtcDays(startOfUtcDay(now), -Math.max(days - 1, 0));
  return {
    days,
    windowStart,
    windowRange: utcWindowRange(windowStart, now),
    now,
  };
}

const OPEN_STATUSES = [
  TicketStatus.created,
  TicketStatus.assigned,
  TicketStatus.in_progress,
  TicketStatus.blocked,
  TicketStatus.reopened,
] as const;

function isOpenStatus(status: TicketStatus): status is (typeof OPEN_STATUSES)[number] {
  return (OPEN_STATUSES as readonly TicketStatus[]).includes(status);
}

/** Open tickets created within the UTC window (excludes older backlog). */
export function openCreatedInWindowWhere(
  scopeWhere: Prisma.TicketWhereInput,
  windowRange: Prisma.DateTimeFilter,
  openStatuses: Prisma.EnumTicketStatusFilter,
): Prisma.TicketWhereInput {
  return {
    ...scopeWhere,
    status: openStatuses,
    createdAt: windowRange,
  };
}

/** Closed tickets resolved or closed within the UTC window. */
export function buildClosedInWindowWhere(
  scopeWhere: Prisma.TicketWhereInput,
  windowRange: Prisma.DateTimeFilter,
): Prisma.TicketWhereInput {
  return {
    ...scopeWhere,
    status: TicketStatus.closed,
    OR: [{ closedAt: windowRange }, { resolvedAt: windowRange }],
  };
}

/** Per-status date filter for ticket list when `days` is combined with `status`. */
export function buildTicketListStatusDaysWhere(
  status: TicketStatus,
  windowRange: Prisma.DateTimeFilter,
): Prisma.TicketWhereInput {
  if (status === TicketStatus.closed) {
    return buildClosedInWindowWhere({}, windowRange);
  }

  if (status === TicketStatus.resolved) {
    return {
      status: TicketStatus.resolved,
      resolvedAt: windowRange,
    };
  }

  if (isOpenStatus(status)) {
    return {
      status,
      createdAt: windowRange,
    };
  }

  return { status };
}
