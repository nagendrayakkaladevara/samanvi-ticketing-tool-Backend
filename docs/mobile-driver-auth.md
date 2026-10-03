# Mobile driver authentication

Mobile driver identities are deliberately separate from admin application users. Admin accounts continue to use `/api/v1/auth/login`; driver accounts use `/api/v1/mobile/auth/*`. The token secrets, database records, middleware, and audiences are separate.

## Mobile endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/mobile/auth/login` | Authenticate and register or validate the device |
| POST | `/api/v1/mobile/auth/refresh` | Rotate a refresh token |
| POST | `/api/v1/mobile/auth/logout` | Revoke the current session |
| GET | `/api/v1/mobile/auth/me` | Validate the session and return the profile |

Login accepts `username`, `password`, and a `device` object containing `installationId` plus optional platform, device, OS, and app-version metadata. The installation identifier is HMAC-hashed before storage. The first successful login creates the binding. A different identifier receives `DEVICE_ALREADY_REGISTERED`.

Access tokens are short-lived JWTs with the `samanvi-driver-mobile` audience. Every protected request also checks the database session, account status, deletion status, and current device binding. Refresh tokens are random opaque values, stored only as SHA-256 hashes and rotated at refresh.

## Admin endpoints

These endpoints require the existing admin bearer token and the corresponding `announcements:mobile_users:*` permission.

| Method | Endpoint |
|---|---|
| GET/POST | `/api/v1/announcements/mobile-users` |
| GET/PATCH | `/api/v1/announcements/mobile-users/:userId` |
| PATCH | `/api/v1/announcements/mobile-users/:userId/status` |
| POST | `/api/v1/announcements/mobile-users/:userId/reset-device` |
| DELETE | `/api/v1/announcements/mobile-users/:userId` |

Deactivation, password changes, device reset, and soft deletion revoke active sessions. Device reset also removes the binding so the next valid login can register a new phone.

## Required environment variables

```env
MOBILE_JWT_SECRET=<independent random secret, minimum 32 characters>
MOBILE_DEVICE_PEPPER=<independent random secret, minimum 32 characters>
MOBILE_ACCESS_TOKEN_EXPIRES_IN=10m
MOBILE_REFRESH_TOKEN_DAYS=30
MOBILE_SESSION_ABSOLUTE_DAYS=90
```
