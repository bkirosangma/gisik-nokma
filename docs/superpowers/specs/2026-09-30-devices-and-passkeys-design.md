# Signed-in devices and passkeys, grouped and identifiable — design

**Status:** spec for owner review. Written 2026-09-30 by the planner; the design was approved in chat the same evening (*"devices design yes too"*).
**Base:** `origin/release/2026-09-30`. Citations are lines read on that tree (or the dev database's live columns, read 2026-09-30); the plan re-reads each.
**Target branch:** `release/2026-09-30`.

## 1. The request

Owner, 2026-09-30: *"the sign-in and devices. either group them by device. make sure you have some way of uniquely identifying a device (there are too many entries. and how many of them are actually active?). and clean up the test data as well. same with the authenticator."*

**Measured (dev database, 2026-09-30 ~21:30 IST, before cleanup):** the e2e owner had **831** sessions — **239** unexpired — from only **5** distinct user agents and **2** IPs; the e2e accountant 320; the same owner had **21** passkeys, all one AAGUID (the test runner's virtual authenticator), created 18–24 Sep. Every unexpired session was "used" in the last 7 days (test churn). Expired sessions are never deleted.
**Cleanup done (dev only, 2026-09-30):** 809 expired sessions, 337 duplicate unexpired sessions (all but the newest per person + user agent + IP) and 20 test passkeys deleted; the e2e owner now has 4 sessions and 1 passkey. Production was not touched (the owner's account there has 3 sessions).

**Why the list is unreadable today:** Account → "Sign-in and devices" (`packages/app-core/src/account/sessions-section.tsx:55-110`) lists every session row; a row's only label is `deviceLabelOf(userAgent)` → "Chrome on macOS" (`apps/web/src/account/account-clients.ts:90-96`), so two machines with the same browser are indistinguishable, and "Last active" is the only activity signal. A better-auth `session` row carries `id, expiresAt, token, createdAt, updatedAt, ipAddress, userAgent, userId` — nothing that names a device. The Passkeys section (`passkeys-section.tsx:105`) lists every passkey; a `passkey` row has `id, name, publicKey, userId, credentialID, counter, deviceType, backedUp, transports, createdAt, aaguid` — no last-used time.

## 2. Decisions (owner-approved design, 2026-09-30)

| # | Decision |
|---|---|
| V1 | **A stable device id.** On every successful sign-in the server ensures a long-lived random device cookie `gn_device` (httpOnly, Secure, SameSite=Lax, 1 year, first-party to the web origin) and records its value on the new session (a `deviceId` column on `session`, better-auth additional field). A browser keeps its id across sign-out and sign-in; clearing site data makes it a new device, which is correct. The mobile and desktop apps send a stored per-install id (header or sign-in body) instead of the cookie. |
| V2 | **Group by device.** Account → Sign-in and devices shows ONE row per device: "<browser> on <os>", a short tag from its id (4 characters, e.g. `· 7F3K`) so two same-browser machines differ, "This device" on the current one, **Active now** / "Last active <relative>", "First signed in <date>", and the number of sign-ins it holds. |
| V3 | **Active = unexpired AND used within 30 days.** Active devices first; the rest collapse under **Inactive (N)**. Expired sessions are never shown. |
| V4 | **Actions:** "Sign out this device" (revokes every session with that device id); "Sign out all other devices" at the top. The existing note about history staying attributed stays. |
| V5 | **Older sessions** (created before V1, no device id) group by user agent + IP under "Older sign-ins" and age out as they expire. |
| V6 | **Housekeeping:** expired sessions are deleted daily by the server's existing scheduled-job mechanism (the plan finds it — the purge engine / backup worker precedent). |
| V7 | **Passkeys, the same way:** each passkey shows its provider from its AAGUID (a small built-in table: iCloud Keychain, Google Password Manager, Windows Hello, 1Password, Bitwarden, Dashlane, Chrome on Mac …; unknown → "Security key or other"), its name, "Added <date>", and **Last used** — a new `lastUsedAt` column stamped on every successful passkey sign-in. Passkeys from the same provider are grouped under it. A passkey never used, or unused for **90 days**, is flagged "Not used recently" with Remove. |
| V8 | **Test hygiene:** whatever creates sessions and passkeys against the dev database in automated runs (e2e specs, the controller's browser passes) cleans up after itself, so the dev tables do not refill; the plan finds the sources. |

## 3. Data

- `session.deviceId text NULL` (+ index on `(userId, deviceId)`); NULL for pre-existing rows (V5).
- `passkey.lastUsedAt timestamptz NULL`.
- One additive migration; safe for the old code while it applies. better-auth must know the new session field (its `session.additionalFields`) so its adapter reads/writes it.

## 4. Behaviour details

- **Device tag:** first 4 chars of a base32 rendering of `sha256(deviceId)` — never the raw id (the cookie value is a credential-adjacent identifier and is not shown or logged).
- **Relative times:** "Active now" if used in the last 5 minutes; otherwise "2 hours ago", "3 days ago", then a date.
- **Sign out this device** on the CURRENT device is not offered (the account menu's Sign out does that); on another device it revokes all its sessions in one server call.
- **Counts:** the section heading reads "Sign-in and devices · <active> active".
- **Passkey provider table** lives in one module with a test pinning each known AAGUID to its label; an unknown AAGUID never shows a raw UUID.

## 5. Security

- `gn_device` is httpOnly (script cannot read or forge it into another session), Secure in production, and carries no authority: it only GROUPS sessions; revoking still acts on session tokens.
- The device id is never returned raw to the client or written to logs (the tag is a one-way digest).
- "Sign out this device" is scoped to the caller's own sessions (another person's device id grants nothing) — a case with a named mutation.
- `lastUsedAt` is an observation, never an authorisation input.

## 6. Testing

Unit/route cases for: the cookie is set once and reused on the next sign-in; a new session records it; grouping (two sessions, one device → one row; two devices, same user agent → two rows with different tags); active/inactive split at 30 days; expired sessions hidden and deleted by the daily job; Sign out this device revokes exactly that device's sessions and only the caller's; older sessions grouped by user agent + IP; passkey provider labels from AAGUID; `lastUsedAt` stamped on sign-in; "Not used recently" at 90 days. Each with a control and a named mutation. Browser 🧪 on the dev stack: two browsers signed in as the same person show two devices; the current one is marked; signing the other out removes it.

## 7. Out of scope

Naming a device yourself (the automatic label + tag is enough for now); location from IP; push "new sign-in" notifications; production data cleanup (not requested — production has 3 sessions).
