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

export const TICKET_LIST_AGGREGATE_STATUSES = [
  "open",
  "closed",
  "unassigned",
  "overdue",
  "at_risk",
] as const;

export type TicketListAggregateStatus = (typeof TICKET_LIST_AGGREGATE_STATUSES)[number];

export type TicketListStatusFilter = TicketStatus | TicketListAggregateStatus;

function isOpenStatus(status: TicketStatus): status is (typeof OPEN_STATUSES)[number] {
  return (OPEN_STATUSES as readonly TicketStatus[]).includes(status);
}

export function openTicketStatusesFilter(): Prisma.EnumTicketStatusFilter {
  return { in: [...OPEN_STATUSES] };
}

function openTicketsWhere(
  scopeWhere: Prisma.TicketWhereInput,
  windowRange?: Prisma.DateTimeFilter,
): Prisma.TicketWhereInput {
  const openStatuses = openTicketStatusesFilter();
  if (!windowRange) {
    return { ...scopeWhere, status: openStatuses };
  }

  return openCreatedInWindowWhere(scopeWhere, windowRange, openStatuses);
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

/** Ticket list filter for `status` query param (single status or dashboard aggregate). */
export function buildTicketListStatusWhere(
  status: TicketListStatusFilter,
  scopeWhere: Prisma.TicketWhereInput,
  options?: { days?: number; now?: Date },
): Prisma.TicketWhereInput {
  const now = options?.now ?? new Date();
  const windowRange =
    options?.days !== undefined
      ? computeUtcWindow(options.days, now).windowRange
      : undefined;

  switch (status) {
    case "open":
      return openTicketsWhere(scopeWhere, windowRange);

    case "closed":
      if (windowRange) {
        return buildClosedInWindowWhere(scopeWhere, windowRange);
      }
      return { ...scopeWhere, status: TicketStatus.closed };

    case "unassigned":
      return {
        ...openTicketsWhere(scopeWhere, windowRange),
        assignedToId: null,
      };

    case "overdue":
      return {
        ...openTicketsWhere(scopeWhere, windowRange),
        slaDueAt: { lt: now },
      };

    case "at_risk":
      return {
        ...openTicketsWhere(scopeWhere, windowRange),
        slaDueAt: { gte: now, lte: addUtcDays(now, 1) },
      };

    default:
      if (windowRange) {
        return {
          ...scopeWhere,
          ...buildTicketListStatusDaysWhere(status, windowRange),
        };
      }
      return { ...scopeWhere, status };
  }
}
