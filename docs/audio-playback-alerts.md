# Repeat-play alerts

Deploy the backend and its Prisma migration before the admin frontend and mobile update. Run `npm run prisma:deploy` against the intended deployment database; the Vercel build already runs migrations. No database migration was applied during development.

- `POST /api/mobile/announcements/playback-alerts`: mobile-driver authentication; `{ eventId: UUID, audioId, playCount: integer >= 4, playedAt: ISO timestamp }`. Driver identity and audio title come from the database. Retry delivery is idempotent per driver and event ID.
- `GET /api/announcements/playback-alerts?page=1`: web authentication and `announcements.mobile_users.view`; 30 alerts per page, total and global unread count.
- `PATCH /api/announcements/playback-alerts/:id/read`: same permission; shared admin acknowledgement, with reader ID and timestamp. Reading a read alert is harmless.

The mobile app retains its existing consecutive-play rule: selecting another audio resets the count, resuming paused audio does not count again, and restarting the app resets the consecutive counter. An accepted fourth or later playback creates an alert after the player starts. Canceling the existing warning creates no alert. Counts are reported by the mobile client, not independently verified server-side telemetry.

Pending alerts are stored separately per account on the device and retried on reconnect, app foreground, or every 30 seconds while online. Delivery retries retain the original event ID and playback time. Alerts cannot be delivered while the app is closed or offline. Uninstalling the app can remove pending alerts.

The bell beside Refresh polls every 15 seconds while the admin page is active. It pulses only when the global unread count is positive (respects reduced-motion preferences). Opening the panel does not automatically mark alerts read. The new alerts are in-app notifications, not email, SMS, or OS push notifications.

Previous/next follow the selected route, welcome-note list, or audio-library list, with no wrapping at the boundaries. Quick single-audio actions have no adjacent tracks. Playback remains subject to the existing speaker and offline-authorization checks.
