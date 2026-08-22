# Google-Only Auth, Open to Everyone — Design Spec

Date: 2026-08-22
Status: Approved (pending spec review)

## Goal

Pingo was built as an ADGIPS-only platform. It is opening to everyone. That
means one authentication path — Google — and the removal of the two mechanisms
that existed to prove someone was a student.

Three connected changes:

1. Drop the `@adgitmdelhi.ac.in` restriction.
2. Remove manual email/password signup and signin, and the ID-card flow that
   fed into it.
3. Fix the defects in the Google login path, which is now the only way in.

## Non-Goals

- No replacement for the abuse gate the college domain provided (see Risks).
- No "verified student" badge. Repurposing ID-card upload as an optional badge
  was considered and deferred to its own spec.
- No changes to matchmaking, WebRTC, chat, or moderation mechanics. The
  moderation *policy wording* changes; its behaviour does not.
- No account-recovery path for locked-out users.

## Decision: existing password accounts lose access

Both `/signup` and `/login` are removed outright. Anyone holding a password
account — an `@adgitmdelhi.ac.in` email, or an ID-card-derived user ID — can no
longer sign in.

This is deliberate and was chosen over two alternatives: keeping login while
removing signup, and auto-linking password accounts to Google by matching
email. Auto-linking would not have helped ID-card accounts in any case, because
their identifier is an enrolment number rather than an email, so they have no
Google account to match against.

**This is a one-way door.** Once the routes are gone those users cannot be
recovered except by owning a Google account on the same address.

## Current auth surface

Three paths exist today:

| Path | Identifier | Credential |
|------|-----------|------------|
| Google | email from Google | Google ID token |
| Manual | `@adgitmdelhi.ac.in` email | password |
| ID card | 11-digit enrolment number | password |

The ID-card path posts an image to `/api/auth/image-login`, which OCRs it with
Tesseract, extracts an enrolment number, and hands it to `/signup` as the
`email` field. It exists solely to prove college membership.

After this change only the first row remains.

## Backend removals

From `backend/routes/auth.js`:
- the `POST /signup` handler
- the `POST /login` handler
- `isValidEmailOrUserID` — the domain gate

`normalize` is **kept**: its two existing callers go, but the Google route
gains a caller when it starts normalizing the email (see below), so the same
helper stays rather than a second one appearing.

Files deleted:
- `backend/routes/imageAuth.js` and its mount in `server.js`
- `backend/config/auth.js` — contains a second `verifyCollegeEmail` gate and is
  already dead code; nothing imports it

From `backend/models/User.js`:
- `comparePassword` and the bcrypt pre-save hashing hook lose their only caller
  with `/login` gone
- `password` becomes a plain optional `{ type: String }`. The field is kept, not
  dropped, so existing documents remain readable; nothing writes it any more.

Dependencies removed from `backend/package.json`: `tesseract.js`, `multer`,
`bcrypt`. Each must be confirmed to have no other importer before removal.

Removing `/api/auth/image-login` also closes an unauthenticated endpoint that
ran OCR on arbitrary uploads — a cheap way for anyone to consume server CPU.

## Google route hardening

Four defects in `POST /google-login`, all currently live:

**`withVideo: withVideo || true`** is always `true`, because `false || true`
is `true`. A user who opts out of video is given it anyway. Becomes `?? true`.

**The email is not normalized.** The password path lowercased and trimmed; this
path does not. A Google payload differing only in case creates a second account
for the same person. The email is normalized before lookup and before save.

**`email_verified` is never checked.** The Google payload carries it, and for
federated Workspace accounts it can be false. An unverified address is rejected
rather than trusted.

**Linking does not set `isGoogleUser`.** When an existing account gains a
`googleId`, `isGoogleUser` stays false, which contradicts the model's own
password-required rule. It is set to true on link.

The JWT payload additionally carries `name`, so the socket layer can show a
display name without a database round trip.

## Display name

Chat currently shows the email prefix. With arbitrary Google accounts that is
both less readable and more identifying than what Google already gives us.

The room shows the **first word of the Google profile name** — "Divyansh"
rather than "divyanshraj0408". It reveals less than an email handle, which
carries a surname and digits.

Mechanically:
- `name` is added to the Google JWT payload.
- `socketIdentity.lookupGlobalSender` caches `socket.userName` alongside
  `socket.userEmail`, from the token when present and from the database
  otherwise.
- `displayNameFor` changes signature from `(email)` to `(socket)`, returning
  the first word of the cached name and falling back to the email prefix when
  no name exists.
- Three call sites in `backend/globalchat.js` are updated.

The 1:1 chat is unaffected: it is anonymous and shows no name at all.

## Frontend

`frontend/src/components/Login.jsx` collapses to branding plus the Google
button. Removed: both form flows, the ID-card upload and preview, the generated
user-ID panel, and the state backing them — `isSignup`, `email`, `password`,
`postCardPassword`, `generatedUserId`, `isPostCardSignup`, `isImageLoginSuccess`,
`selectedImage`, and the `fileInputRef`.

With `selectedImage` gone, the Google button's container is no longer
conditionally rendered, so the effect added in commit `0c622c2` reverts to
mounting once. Its cleanup and resize handling stay.

`frontend/src/components/HomePage.jsx` drops "Made exclusive for ADGIPS".

`localStorage` key `collegeEmail` becomes `userEmail`, read across six sites in
`App.jsx`. The new key falls back to reading `collegeEmail` once, so Google
users with a live session are not silently signed out by the rename.

## Copy

`README.md` describes Pingo as "a college-exclusive platform" whose first
feature is "College Email Authentication – Ensures only students from the
college can join". Both become accurate.

`MODERATION_POLICY` in `backend/moderation.js` opens with "a content moderation
classifier for a college student chat room". That sentence frames how the
classifier judges borderline messages, so it is generalised. The six categories
are unchanged.

## Testing

The Google handler cannot be unit-tested as written: token verification, user
lookup, user creation and JWT signing are one function. A pure
`buildUserFieldsFromGooglePayload(payload)` is extracted, returning the fields
to persist, with `verifyIdToken` left at the edge.

Backend (`node:test`), against the extracted function:
- `withVideo: false` survives; omitted `withVideo` defaults to true
- a mixed-case Google email is normalized
- `email_verified: false` is rejected
- linking sets `isGoogleUser` true
- the returned fields never include a password

Plus `displayNameFor`: first word of a name, email-prefix fallback when the
name is missing, and no crash when both are absent.

The existing 44 backend tests must still pass — none of this touches moderation
mechanics, only the policy string.

Manual:
- Sign in with a Google account that has never used Pingo; a user is created.
- Sign in again; the same account is reused, not duplicated.
- Sign in with a **non-ADGIPS** Google account; it is accepted.
- Confirm the public room shows a first name rather than an email prefix.
- Confirm no email or password field appears anywhere on the login page.
- Confirm `POST /api/auth/login`, `/api/auth/signup` and `/api/auth/image-login`
  all return 404.
- Refresh with an existing session and confirm the `collegeEmail` fallback keeps
  the user signed in.

## Risks

**The abuse gate is gone.** The college domain was not only identity, it was
scarcity — abuse carried a real-world cost because accounts were tied to
enrolment. Google accounts are free and unlimited. Nothing in this spec replaces
that, and moderation alone does not substitute for it. Worth a follow-up on
rate limiting per account age, or per IP.

**No way back for existing users.** Stated above; repeated here because it is
the change most likely to be regretted.

## Decisions taken

- Remove both password routes; accept the lockout.
- Remove the ID-card flow entirely, backend and dependencies included.
- Show Google's given name, not the email prefix and not the full name.
- Keep the `password` field in the schema for readability of existing rows.
- Rename the localStorage key, with a one-time fallback read.
