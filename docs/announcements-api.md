# Announcement Management API

Administrative endpoints use the existing ticketing JWT and announcement permission keys. Mobile endpoints use the separate mobile-driver authentication system documented in `mobile-driver-auth.md`.

Base paths:

- Admin: `/api/v1/announcements`
- Mobile: `/api/v1/mobile/announcements`

## Audio categories

- `stop_announcement`: may be assigned to routes.
- `common_audio`: select one ready file each for Dinner Break and Toilet Break in Mobile settings.
- `welcome_note`: every ready welcome note is available in the mobile selection list.

The API and database both reject route assignments that do not reference a ready `stop_announcement`.

## Direct audio upload

Audio is uploaded directly from the frontend to Cloudflare R2. The API issues a presigned PUT URL valid for five minutes. After the PUT succeeds, the same authenticated user calls the completion endpoint. The backend checks the actual object size and content type before marking the audio ready. Completion is safe to retry.

Replace the frontend Vercel Blob SDK upload with this flow (apiBaseUrl includes /api/v1):

```ts
const headers = {
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
};
const response = await fetch(`${apiBaseUrl}/announcements/audios/upload`, {
  method: "POST", headers,
  body: JSON.stringify({
    title, description, category: "stop_announcement",
    fileName: file.name, mimeType: file.type, sizeBytes: file.size, durationMs,
  }),
});
if (!response.ok) throw new Error("Could not start audio upload");
const { data } = await response.json();
const uploaded = await fetch(data.uploadUrl, {
  method: data.method, headers: data.headers, body: file,
});
if (!uploaded.ok) throw new Error("R2 audio upload failed");
const completed = await fetch(
  `${apiBaseUrl}/announcements/audios/${data.audioId}/upload-complete`,
  { method: "POST", headers },
);
if (!completed.ok) throw new Error("Audio upload verification failed");
const audio = (await completed.json()).data;
```

Send the file itself as the PUT body, without FormData or the backend Authorization header. The browser sets Content-Length from the file; it must match sizeBytes. The signed If-None-Match header prevents overwriting an uploaded object. If the URL expires before upload, start a new upload. Failed or abandoned uploads remain uploading and cannot be assigned to routes.

The admin response fields blobUrl and downloadUrl contain permanent R2 public URLs. Mobile endpoints expose the selected URL as `audioUrl` for streaming.

Allowed formats are MP3, MP4/M4A, AAC, WAV and OGG. The default maximum size is 50 MiB and can be configured using `AUDIO_MAX_SIZE_BYTES`.

## Admin endpoints

| Method | Endpoint | Permission |
|---|---|---|
| `GET` | `/announcements/audios` | `announcements:audios:view` |
| `GET` | `/announcements/audios/:audioId` | `announcements:audios:view` |
| `GET` | `/announcements/audios/:audioId/usage` | `announcements:audios:view` |
| `POST` | `/announcements/audios/upload` | `announcements:audios:upload` |
| `POST` | `/announcements/audios/:audioId/upload-complete` | `announcements:audios:upload` |
| `PATCH` | `/announcements/audios/:audioId` | `announcements:audios:edit` |
| `DELETE` | `/announcements/audios/:audioId` | `announcements:audios:delete` |
| `POST` | `/announcements/audios/:audioId/restore` | `announcements:audios:delete` |
| `DELETE` | `/announcements/audios/:audioId/permanent` | `announcements:audios:delete` |
| `PUT` | `/announcements/audios/:audioId/break-mapping` | `announcements:settings:edit` |
| `GET` | `/announcements/routes` | `announcements:routes:view` |
| `POST` | `/announcements/routes` | `announcements:routes:create` |
| `GET` | `/announcements/routes/:routeId` | `announcements:routes:view` |
| `PATCH` | `/announcements/routes/:routeId` | `announcements:routes:edit` |
| `PUT` | `/announcements/routes/:routeId/audios` | `announcements:routes:assign_audio` |
| `DELETE` | `/announcements/routes/:routeId` | `announcements:routes:delete` |
| `GET` | `/announcements/settings` | `announcements:settings:edit` |
| `PUT` | `/announcements/settings` | `announcements:settings:edit` |

### Map audio to Dinner Break / Toilet Break

`PUT /announcements/audios/:audioId/break-mapping` accepts `{ "target": "dinner_break" }`, `toilet_break`, `both`, or `none`. Only existing Common audio is eligible. Assigning requires a verified, ready asset with an HTTPS playback URL; `none` can clear a stale assignment. The response is the same settings object returned by `/settings`.

The frontend's Dinner Break and Toilet Break upload options still submit `category: common_audio`, then call this endpoint **after** upload verification. A mapping failure does not remove the ready file; it can be retried without re-uploading. Existing Common audio can be mapped directly without another upload.

Mapping replaces the chosen button's audio, not the stored file. Moving the same audio to a different button removes its previous assignment; mappings of other files and the Records URL are preserved. `both` explicitly assigns the same file to both buttons. `none` removes only this file's assignments. Changes are transactional with an audio row lock and serializable isolation; concurrent changes may return `409` for retry. The existing Mobile settings permission is required (upload permission alone is not enough).

This uses the existing `AnnouncementSettings` fields and mobile quick-announcement response. No new database migration is required. Old mobile clients receive the mapped audio on their next catalog refresh; updated clients also check the latest mapping before every quick-announcement tap.

### Delete and restore audio

- `DELETE /announcements/audios/:audioId` moves unused audio to **Recently deleted**. The database still uses `status: archived`; the record and stored file are retained. Repeating DELETE does not overwrite the previous status or deletion time.
- Audio referenced by routes or mobile settings cannot be deleted (`409`). Remove those references first.
- `GET /announcements/audios` excludes deleted audio by default. Use `?status=archived` for Recently deleted, ordered by deletion time (newest first). Search, category and pagination work in both lists.
- `POST /announcements/audios/:audioId/restore` restores the status held before deletion and returns the audio asset. Ready audio becomes usable again; uploading/failed audio does **not** become ready without verification. This uses the existing `announcements:audios:delete` permission; no new grants are required.
- Deleted audio cannot be edited or completed through the upload-complete endpoint. Restore it first. There is no automatic expiry.
- `DELETE /announcements/audios/:audioId/permanent` irreversibly removes an unused archived asset and its R2 object. It requires the existing delete permission. Storage failure retains the database record for retry. An unfinished upload must wait until its five-minute upload link expires before permanent deletion. No additional migration is required.
- Apply migration `20261009120000_audio_delete_restore` before deploying the backend (`npm run prisma:deploy`). It adds `archivedFromStatus` and backfills previously archived audio: completed URL-bearing assets become ready on restore, unfinished R2 uploads remain uploading, and other incomplete assets remain failed.

### Create a route

```json
{
  "routeCode": "RJY-HYD-01",
  "name": "Rajahmundry to Hyderabad",
  "origin": "Rajahmundry",
  "destination": "Hyderabad",
  "via": "Vijayawada",
  "busType": "AC",
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

### Configure quick announcements and records

`PUT /announcements/settings`

```json
{
  "dinnerBreakAudioId": "common-dinner-audio-id",
  "toiletBreakAudioId": "common-toilet-audio-id",
  "recordsDriveUrl": "https://drive.google.com/drive/folders/your-folder-id"
}
```

All fields support partial updates; use `null` to clear a setting. Break audios must be ready common audios. The Records URL must be an HTTPS `drive.google.com` URL. Welcome Note lists all ready welcome-note audios; no single active welcome selection is used.

## Mobile endpoints

All mobile announcement endpoints require a valid mobile-driver bearer token. Admin application tokens are not accepted.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/mobile/announcements/bootstrap` | `routes`, `quickAnnouncements`, `recordsDriveUrl`, `maxPinnedRoutes: 3` |
| `GET` | `/mobile/announcements/routes` | Search published routes |
| `GET` | `/mobile/announcements/routes/:routeId/announcements` | Route card plus `announcements` in ascending `sequence` order |
| `GET` | `/mobile/announcements/quick-announcements` | `MULTIPLE` welcome audios and `SINGLE` Dinner/Toilet audios |
| `GET` | `/mobile/announcements/config` | Current `recordsDriveUrl` (nullable) |
| `GET` | `/mobile/announcements/audios/:audioId` | Resolve a currently available audio before streaming |
| `GET` | `/mobile/users/me/pinned-routes` | Authenticated driver's published pinned route cards |
| `POST` | `/mobile/users/me/pinned-routes/:routeId` | Pin a published route; idempotent |
| `DELETE` | `/mobile/users/me/pinned-routes/:routeId` | Unpin a route; idempotent |

All responses use `{ "success": true, "data": ... }` and `Cache-Control: private, no-store`. Route cards contain `id` (internal identifier used in URLs), `routeId` (display code), `startLocation`, `endLocation`, `via`, `busType` (`AC` or `Non-AC`), `isPinned`, and additive `version`. Announcement entries contain `id`, `title`, `audioUrl`, `sequence`, and media metadata. The stored route assignment position is the sequence; the mobile app does not infer or reorder it.

### Pinned offline sync (mobile 2.1+)

`POST /mobile/announcements/sync` requires a mobile bearer token and JSON `{}` or `{ "revision": "<previous 64-character SHA-256>" }`.

- Returns `revision`, `unchanged`, ISO `serverTime`, and `offlineUntil` exactly 30 days later.
- On a changed/first response (`unchanged: false`), also returns `catalog` (bootstrap shape) and `pinnedRoutes` (the complete array of route-announcement responses for this user's published pins, maximum three). Absence communicates removal/unpublishing/unpinning.
- An unchanged response omits both manifests; authorization and database checks still run. The client throttles/deduplicates sync to reduce calls.
- A repeatable-read transaction produces the snapshot; revisions include user identity so another driver's revision cannot reuse personalized data.
- Playable audio includes numeric `sizeBytes`, `contentRevision`, and nullable `checksumSha256`. Content identity incorporates the immutable storage key/URL, ETag, size, MIME type and supplied checksum, excluding labels/timestamps. Metadata edits do not require media downloads.
- Only successful sync renews offline access. Token refresh and pin mutations alone do not. Removed files/account restrictions take effect when the client learns them; a disconnected device can retain previously authorized content until its 30-day expiry.
- Existing GET endpoints and admin publishing/upload/mapping contracts remain available. No additional Prisma migration or environment variable is required.

Quick groups always include `welcome-note`, `dinner-break`, and `toilet-break`. MULTIPLE contains `audios`; SINGLE contains `audioUrl` plus an `audio` object with id/title/media metadata. Unconfigured or unavailable SINGLE audio is `null`, and an empty MULTIPLE has `audios: []`.

Pins belong to the authenticated mobile driver, never a caller-supplied user ID. A fourth pin returns HTTP 409 with `code: PIN_LIMIT_REACHED`. A per-user row lock serializes mutations, and unique slots 1–3 with a database CHECK constraint enforce the limit even under concurrent requests. Unpublished routes are hidden and their slots are reclaimed on the next pin operation.

## Deploying the online-only architecture

1. Run `npm run prisma:generate`, then `npm run prisma:deploy` against the target database before deploying this backend.
2. Deploy the admin frontend and review route Via/bus type. Existing routes receive an empty Via and `Non-AC` during migration; set the actual bus type in the editor.
3. Select the Dinner and Toilet common audios and set the Records Google Drive folder under Audio App → Mobile settings.
4. Deploy the matching mobile build. Its API contract replaces the previous manifest/bootstrap format. The old active-welcome database column is retained for data preservation but is no longer used by this API.

## Environment variables

```env
R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<R2 S3 access key>
R2_SECRET_ACCESS_KEY=<R2 S3 secret key>
R2_BUCKET_NAME=announcement-audio
R2_PUBLIC_BASE_URL=https://audio.example.com
AUDIO_MAX_SIZE_BYTES=52428800
```

Create a Standard R2 bucket and an Object Read & Write API token scoped to that bucket. Configure the five R2 variables in backend development, preview and production environments. Use the bucket's S3 endpoint (including a jurisdiction prefix where applicable). Never expose the credentials to the frontend.

Connect a public custom domain to the bucket and set R2_PUBLIC_BASE_URL to that domain for permanent mobile playback URLs. The r2.dev public URL may be used for development; Cloudflare recommends a custom domain for production. Public access is intentional, matching the existing public announcement delivery.

Configure bucket CORS with the actual frontend origins, for example:

```json
[
  {
    "AllowedOrigins": ["http://localhost:5173", "https://app.example.com"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type", "If-None-Match", "Range"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range"],
    "MaxAgeSeconds": 3600
  }
]
```

Existing Vercel-hosted audio is not automatically copied. Keep its storage available until the objects have been copied to R2 and their database storageKey/blobUrl/downloadUrl fields updated, or replaced through new R2 uploads. DELETE moves records to Recently deleted without deleting stored files. Keep those files available for restoration; any separate storage cleanup must avoid recoverable audio.

### Importing the legacy staging catalog

The dedicated announcement importer reads the legacy route definitions and audio folder without running the destructive general-purpose database seed. It imports the active `ST-A02`, `ST-A04`, `ST-VH02`, and `ST-12` routes, all Welcome Notes, and the Dinner/Washroom clips. Objects use deterministic R2 keys and database rows are upserted, so a failed run can be retried. Existing assignments for those four route codes are replaced; unrelated routes and application data are untouched.

Validate the source first:

```powershell
$env:ANNOUNCEMENT_AUDIO_SOURCE_DIR='D:\ReactProject\samanvibusroutevoiceappExpo\assets\audio'
npm run seed:announcements:dry-run
```

For a staging/dev import, configure `DATABASE_URL` (or `DIRECT_URL`), the five `R2_*` variables, and an existing admin username, then explicitly allow writes:

```powershell
$env:ANNOUNCEMENT_SEED_ADMIN_USERNAME='admin1'
$env:ALLOW_ANNOUNCEMENT_SEED='true'
npm run seed:announcements
```

Production execution is blocked unless `ALLOW_PRODUCTION_ANNOUNCEMENT_SEED=true` is additionally supplied. The importer does not create users or set a Records URL unless `ANNOUNCEMENT_RECORDS_DRIVE_URL` is provided when the settings row is first created.

References: [R2 SDK configuration](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/), [CORS](https://developers.cloudflare.com/r2/buckets/cors/), [public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/), [pricing](https://developers.cloudflare.com/r2/pricing/).
