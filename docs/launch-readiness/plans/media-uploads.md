# Plan — Feed photo and video uploads (E3, E4, E9)

**Decision (2026-09-29).**
- The feed gets **first-party** photo and video uploads, handled the way Instagram does:
  - every file is stored by us;
  - every file is re-encoded and stripped of metadata;
  - every file is served from our own domain.
- Viewers' devices never contact third-party hosts, so their IP addresses are not leaked.
- External image URLs are removed from the API.

## Today

- `POST /api/community/posts` accepts up to 10 arbitrary `media_urls` (`server/src/schemas/community.schemas.ts:6`). `PostCard` renders the first one from whatever host it points at (`client/src/components/PostCard.tsx:210`).
- Support tickets accept up to 5 `attachment_urls` the same way (`server/src/schemas/support.schemas.ts:22`).
- `expo-image-picker` is installed but never used. The composer is text-only.

## Permissions (resolves the "remove unused permissions" item)

| Permission | Keep? | Why |
| --- | --- | --- |
| Photo and video library (Android `READ_MEDIA_*`, `READ/WRITE_EXTERNAL_STORAGE`; iOS `NSPhotoLibraryUsageDescription`) | **No** | Use the system photo picker. On Android 13+ (and older, via Google Play services) `expo-image-picker` uses it with no permission. On iOS 14+ `PHPicker` needs no library permission. Play's Photo and Video Permissions policy only allows broad media access for apps whose core feature needs it, so an occasional-upload feed must use the picker. |
| Camera (`CAMERA`, `NSCameraUsageDescription`) | **Only if** in-app capture ships | Needed for "take a photo" inside the app. Write a specific purpose string: "Take photos and videos to share in your feed." |
| Microphone (`RECORD_AUDIO`, `NSMicrophoneUsageDescription`) | **Only if** in-app video capture ships | Needed for recorded video with sound. Write a specific purpose string. Not needed to play videos. |
| `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, iOS `UIBackgroundModes: audio` | **No** | Feed videos play while the app is open. Nothing plays in the background. |
| iOS `UIBackgroundModes: fetch` | **No** | No background fetch exists. |

Block the others with `android.blockedPermissions` and the image-picker plugin options (`photosPermission: false` where supported). Re-check the generated manifest and Info.plist after `expo prebuild --clean`.

## Architecture

```
client (picker/camera)
  ── compress/resize on device (expo-image-manipulator), strip what we can
  ── POST /api/media/uploads  → { uploadId, signedPutUrl, expiresAt }   (auth, rate-limited, size/type declared)
  ── PUT file → Supabase Storage bucket `media-staging` (private, ap-south-1)
  ── POST /api/media/uploads/:id/complete
worker `media.process`
  ── verify magic bytes + size + dimensions/duration limits
  ── CSAM hash check (Cloudflare CSAM Scanning Tool or equivalent) → block + preserve + report path ⚖️
  ── re-encode (sharp for images → WebP/AVIF + JPEG fallback; ffmpeg for video → H.264/AAC MP4)
     with ALL metadata dropped: EXIF, XMP, IPTC, GPS, maker notes, MP4/QuickTime ©xyz location atoms
  ── generate sizes (thumb, feed, full) + blurhash
  ── write to `media-public` (post visible to all) or keep private (signed URLs)
  ── delete staging object; mark media row `ready`
post create
  ── `media_ids[]` (owned by the author, status `ready`) instead of URLs
clients
  ── load only `https://media.throttlebase.in/...` (CDN in front of Storage); random, unguessable object keys
```

### Tables (additive migration)

- `media_assets`:
  - identity and ownership: `id`, `owner_id`;
  - file facts: `kind` (image/video), `status` (pending / processing / ready / rejected / removed), `bytes`, `width`, `height`, `duration_ms`, `blurhash`;
  - storage: `storage_keys` (jsonb of variants);
  - lifecycle: `created_at`, `removed_at`, `removal_reason`, `legal_hold_until`.
- `post_media`: `post_id`, `media_id`, `position`.

## Rules

- **No external URLs.** Drop `media_urls` and `attachment_urls` from the request schemas.
  - Migrate existing rows: re-host them through the pipeline once, or drop them. Production has only test data, so dropping is fine. Ask before a destructive migration, as spec rule 3 requires.
- **Links in captions are plain text.** Don't show automatic link previews. If previews are ever added, fetch them server-side and cache them, so viewers never hit the target.
- **Private or followers-only posts** use short-lived signed URLs (for example 10 min), never public objects.
- **Limits:**
  - images ≤ 20 MB before processing, ≤ 10 per post;
  - video ≤ 60 s and ≤ 100 MB before processing, 1 per post at first.
- **Moderation hooks** (E3):
  - every media item is reportable with its post;
  - takedown sets `removed_at`, hides the item immediately, and preserves the original for 180 days (IT Rules), then purges it;
  - non-consensual intimate images come down within 2 hours of a complaint. ⚖️
- **Deletion:** deleting a post or account removes every variant and the staging original, and purges the CDN cache ([account-deletion.md](account-deletion.md)).
- **No face recognition or content-based profiling.**

## Phasing

1. Images: picker, pipeline, CDN, `media_ids`; remove `media_urls`.
2. Reporting and takedown for media, as part of E3.
3. Video: ffmpeg worker, duration and size caps, poster frame.
4. In-app camera capture, adding the camera permission and, for video, the microphone.

## Test

- Unit: schema rejects URLs; ownership check on `media_ids`; size and type limits.
- Pipeline fixtures:
  - a JPEG with GPS EXIF → output has no EXIF;
  - an iPhone HEIC with location → no location;
  - a MOV with a `©xyz` atom → no location atom.

  Assert with `exiftool` in CI.
- Integration: upload → complete → process → post shows the CDN URL; deleted post → objects gone.
- Device: the picker opens with no permission prompt on Android 13+ and iOS.

## Docs to update

- `data-inventory.md`: §1.3 (`media_assets`), §2 (Supabase Storage, CDN), §3 (permissions), §6.
- `store-forms.md`: photos and videos as user content.
