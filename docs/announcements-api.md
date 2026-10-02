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

The response fields blobUrl and downloadUrl remain available for compatibility and now contain permanent R2 public URLs. Mobile playback and offline caching use the same API fields. No database migration is required.

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

Existing Vercel-hosted audio is not automatically copied. Keep its storage available until the objects have been copied to R2 and their database storageKey/blobUrl/downloadUrl fields updated, or replaced through new R2 uploads. DELETE still archives records without deleting stored files. Review and remove abandoned objects periodically to avoid accumulating storage.

References: [R2 SDK configuration](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/), [CORS](https://developers.cloudflare.com/r2/buckets/cors/), [public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/), [pricing](https://developers.cloudflare.com/r2/pricing/).
