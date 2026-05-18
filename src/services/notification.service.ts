import {
  NotificationType,
  RoleCode,
  type TicketStatus,
} from "@prisma/client";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { prisma } from "../lib/prisma";
import { dispatchTicketNotificationEmail } from "./email.service";

const MESSAGE_MAX_LENGTH = 500;
const NOTE_SNIPPET_MAX_LENGTH = 200;

export type NotifyTicketEventInput = {
  type: NotificationType;
  ticketId: string;
  actorUserId: string;
  activityLogId?: string;
  note?: string;
  fromStatus?: TicketStatus;
  toStatus?: TicketStatus;
  assigneeDisplayName?: string;
};

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1)}…`;
}

function toDisplayStatus(status: TicketStatus): string {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTicketLabel(ticketNumber: number, title: string): string {
  return `#${ticketNumber} — ${title}`;
}

function buildTicketUrl(ticketNumber: number): string | null {
  if (!env.appPublicUrl) {
    return null;
  }
  const base = env.appPublicUrl.replace(/\/$/, "");
  return `${base}/tickets/${ticketNumber}`;
}

async function resolveRecipientIds(
  ticket: {
    createdById: string;
    assignedToId: string | null;
    assignedById: string | null;
  },
  actorUserId: string,
): Promise<string[]> {
  const stakeholderIds = [
    ticket.createdById,
    ticket.assignedToId,
    ticket.assignedById,
  ].filter((id): id is string => Boolean(id));

  const supervisorsAndAdmins = await prisma.user.findMany({
    where: {
      isActive: true,
      role: {
        code: {
          in: [RoleCode.admin, RoleCode.supervisor],
        },
      },
    },
    select: { id: true },
  });

  const recipientIds = new Set<string>([
    ...stakeholderIds,
    ...supervisorsAndAdmins.map((user) => user.id),
  ]);
  recipientIds.delete(actorUserId);

  return [...recipientIds];
}

type NotificationContent = {
  title: string;
  message: string;
  emailSubject: string;
};

function buildNotificationContent(
  input: NotifyTicketEventInput,
  ticket: { ticketNumber: number; title: string },
  actorDisplayName: string,
): NotificationContent {
  const ticketLabel = formatTicketLabel(ticket.ticketNumber, ticket.title);
  const noteSnippet = input.note
    ? truncateText(input.note, NOTE_SNIPPET_MAX_LENGTH)
    : undefined;

  switch (input.type) {
    case NotificationType.ticket_created:
      return {
        title: `New ticket ${ticketLabel}`,
        message: truncateText(
          `${actorDisplayName} created ticket ${ticketLabel}.`,
          MESSAGE_MAX_LENGTH,
        ),
        emailSubject: `New ticket ${ticketLabel}`,
      };
    case NotificationType.ticket_assigned: {
      const assignee = input.assigneeDisplayName ?? "a worker";
      const base = `${actorDisplayName} assigned ${ticketLabel} to ${assignee}.`;
      return {
        title: `Ticket assigned ${ticketLabel}`,
        message: truncateText(
          noteSnippet ? `${base} Note: ${noteSnippet}` : base,
          MESSAGE_MAX_LENGTH,
        ),
        emailSubject: `Ticket assigned ${ticketLabel}`,
      };
    }
    case NotificationType.ticket_status_changed: {
      const fromLabel = input.fromStatus ? toDisplayStatus(input.fromStatus) : "Unknown";
      const toLabel = input.toStatus ? toDisplayStatus(input.toStatus) : "Unknown";
      const base = `${actorDisplayName} changed ${ticketLabel} from ${fromLabel} to ${toLabel}.`;
      return {
        title: `Status updated on ${ticketLabel}`,
        message: truncateText(
          noteSnippet ? `${base} Note: ${noteSnippet}` : base,
          MESSAGE_MAX_LENGTH,
        ),
        emailSubject: `Status updated on ${ticketLabel}`,
      };
    }
    case NotificationType.ticket_closed: {
      const base = `${actorDisplayName} closed ${ticketLabel}.`;
      return {
        title: `Ticket closed ${ticketLabel}`,
        message: truncateText(
          noteSnippet ? `${base} Note: ${noteSnippet}` : base,
          MESSAGE_MAX_LENGTH,
        ),
        emailSubject: `Ticket closed ${ticketLabel}`,
      };
    }
    case NotificationType.ticket_reopened: {
      const base = `${actorDisplayName} reopened ${ticketLabel}.`;
      return {
        title: `Ticket reopened ${ticketLabel}`,
        message: truncateText(
          noteSnippet ? `${base} Note: ${noteSnippet}` : base,
          MESSAGE_MAX_LENGTH,
        ),
        emailSubject: `Ticket reopened ${ticketLabel}`,
      };
    }
    case NotificationType.ticket_commented: {
      const base = `${actorDisplayName} commented on ${ticketLabel}.`;
      return {
        title: `New comment on ${ticketLabel}`,
        message: truncateText(
          noteSnippet ? `${base} "${noteSnippet}"` : base,
          MESSAGE_MAX_LENGTH,
        ),
        emailSubject: `New comment on ${ticketLabel}`,
      };
    }
    default: {
      const exhaustiveCheck: never = input.type;
      throw new Error(`Unsupported notification type: ${exhaustiveCheck}`);
    }
  }
}

function buildEmailBodies(
  content: NotificationContent,
  ticketUrl: string | null,
): { text: string; html: string } {
  const linkLine = ticketUrl ? `\n\nView ticket: ${ticketUrl}` : "";
  const text = `${content.message}${linkLine}`;

  const linkHtml = ticketUrl
    ? `<p><a href="${ticketUrl}">View ticket</a></p>`
    : "";

  const html = `<p>${content.message}</p>${linkHtml}`;

  return { text, html };
}

export async function notifyTicketEvent(input: NotifyTicketEventInput): Promise<void> {
  const [ticket, actor] = await Promise.all([
    prisma.ticket.findUnique({
      where: { id: input.ticketId },
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        createdById: true,
        assignedToId: true,
        assignedById: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: input.actorUserId },
      select: { displayName: true },
    }),
  ]);

  if (!ticket) {
    return;
  }

  const actorDisplayName = actor?.displayName ?? "Someone";
  const recipientIds = await resolveRecipientIds(ticket, input.actorUserId);

  if (recipientIds.length === 0) {
    return;
  }

  const content = buildNotificationContent(input, ticket, actorDisplayName);
  const ticketUrl = buildTicketUrl(ticket.ticketNumber);
  const emailBodies = buildEmailBodies(content, ticketUrl);

  await prisma.notification.createMany({
    data: recipientIds.map((userId) => ({
      userId,
      type: input.type,
      title: content.title,
      message: content.message,
      ticketId: ticket.id,
      activityLogId: input.activityLogId,
    })),
  });

  const recipients = await prisma.user.findMany({
    where: {
      id: { in: recipientIds },
      email: { not: null },
      isActive: true,
    },
    select: { email: true },
  });

  for (const recipient of recipients) {
    if (!recipient.email) {
      continue;
    }

    dispatchTicketNotificationEmail({
      to: recipient.email,
      subject: content.emailSubject,
      text: emailBodies.text,
      html: emailBodies.html,
    });
  }
}

export function dispatchNotifyTicketEvent(input: NotifyTicketEventInput): void {
  void notifyTicketEvent(input).catch((error) => {
    logger.error({ err: error, ticketId: input.ticketId }, "Failed to create ticket notifications");
  });
}
