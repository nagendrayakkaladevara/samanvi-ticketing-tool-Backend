# Announcement Management API

Administrative endpoints use the existing ticketing JWT and announcement permission keys. Mobile endpoints currently expose only published announcement content and intentionally remain unauthenticated until the announcement-app login design is finalized.

Base paths:

- Admin: `/api/v1/announcements`
- Mobile: `/api/v1/mobile/announcements`

## Audio categories

- `stop_announcement`: may be assigned to routes.
- `common_audio`: global audio returned by the mobile bootstrap endpoint.
- `welcome_note`: global audio; one ready welcome note may be selected in settings.

The API and database both reject route assignments that do not reference a ready `stop_announcement`.

## Direct audio upload

Audio is uploaded directly from the frontend to Vercel Blob. The Express API creates the database record and issues a restricted client token; the Blob callback marks the record as `ready`.

Install `@vercel/blob` in the frontend and call:

```ts
import { upload } from "@vercel/blob/client";

const blob = await upload(`announcements/${file.name}`, file, {
  access: "public",
  handleUploadUrl: `${apiBaseUrl}/announcements/audios/upload`,
  headers: { Authorization: `Bearer ${accessToken}` },
  clientPayload: JSON.stringify({
    title,
    description,
    category: "stop_announcement",
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    durationMs,
  }),
});
```

Allowed formats are MP3, MP4/M4A, AAC, WAV and OGG. The default maximum size is 50 MiB and can be configured using `AUDIO_MAX_SIZE_BYTES`.

## Admin endpoints

| Method | Endpoint | Permission |
|---|---|---|
| `GET` | `/announcements/audios` | `announcements:audios:view` |
| `GET` | `/announcements/audios/:audioId` | `announcements:audios:view` |
| `GET` | `/announcements/audios/:audioId/usage` | `announcements:audios:view` |
| `POST` | `/announcements/audios/upload` | `announcements:audios:upload` |
| `PATCH` | `/announcements/audios/:audioId` | `announcements:audios:edit` |
| `DELETE` | `/announcements/audios/:audioId` | `announcements:audios:delete` |
| `GET` | `/announcements/routes` | `announcements:routes:view` |
| `POST` | `/announcements/routes` | `announcements:routes:create` |
| `GET` | `/announcements/routes/:routeId` | `announcements:routes:view` |
| `PATCH` | `/announcements/routes/:routeId` | `announcements:routes:edit` |
| `PUT` | `/announcements/routes/:routeId/audios` | `announcements:routes:assign_audio` |
| `DELETE` | `/announcements/routes/:routeId` | `announcements:routes:delete` |
| `GET` | `/announcements/settings` | `announcements:settings:edit` |
| `PUT` | `/announcements/settings` | `announcements:settings:edit` |

### Create a route

```json
{
  "routeCode": "RJY-HYD-01",
  "name": "Rajahmundry to Hyderabad",
  "origin": "Rajahmundry",
  "destination": "Hyderabad",
  "description": "Night service"
}
```

Routes begin in `draft`. A route cannot be published until it contains at least one announcement.

### Assign and reorder route audio

`PUT /announcements/routes/:routeId/audios`

```json
{
  "expectedVersion": 3,
  "items": [
    { "audioId": "audio-id-1", "stopLabel": "Rajahmundry" },
    { "audioId": "audio-id-2", "stopLabel": "Vijayawada" }
  ]
}
```

The array order becomes the playback order. The operation replaces the complete route playlist in one serializable transaction. If `expectedVersion` is stale, the API returns `409 Conflict`.

### Select the active welcome note

`PUT /announcements/settings`

```json
{
  "activeWelcomeAudioId": "welcome-audio-id"
}
```

Use `null` to remove the active welcome note.

## Mobile endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/mobile/announcements/bootstrap` | Active welcome note, common audio and published routes |
| `GET` | `/mobile/announcements/routes` | Search published routes |
| `GET` | `/mobile/announcements/routes/:routeId/manifest` | Ordered audio manifest for one route |

The manifest includes route `version`, audio timestamps and optional SHA-256 checksums so the mobile app can maintain an offline cache.

## Environment variables

```env
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_token
AUDIO_MAX_SIZE_BYTES=52428800
```

Provision a Vercel Blob store for the backend project so `BLOB_READ_WRITE_TOKEN` is injected in preview and production environments.
