# Phase 9 — White-Labeled Mobile Apps & Authenticated Scan Channel

**Depends on:** Phase 1 (identity foundation), Phase 2 (scan-and-earn CRUD + the existing guest-scan flow, FR-16), Phase 8 (shares its consumer-identity model so guest-scan and mobile-app accounts are the same underlying account)
**Unlocks:** Nothing else — this completes the scan-and-earn consumer experience alongside Phase 5's credit metering (no functional dependency between the two: Phase 5 gates *batch creation*, this phase concerns *scanning itself*, which was never credit-gated)
**Master reference:** `./PRD.md` §6.12, §6.13 (added in PRD v3)

## Goal

Give scan-and-earn Application Owners a second, authenticated scan channel — a fully separate, independently-branded mobile app, published under their own app-store account — where a registered consumer's UPI is on file and scanning requires no repeated data entry.

## In Scope

### Functional Requirements
- **FR-44:** Finalize Channel 1 (guest/web scan, already functional since Phase 1/2 via FR-16): the consumer verifies phone+OTP (creating/reusing their Application-scoped account, per Phase 8's identity model, for history purposes only), then enters a UPI ID **fresh, every single time** — never read from or written back to any stored profile.
- **FR-45:** Channel 2 — Mobile App scan: the consumer registers once inside the Application's own dedicated app (the same unified phone+OTP flow from Phase 8) and adds their UPI ID as part of their profile during or after registration. Once logged in, scanning inside the app resolves identity from the active session — no phone/OTP/UPI re-entry per scan — and cashback auto-transfers to the profile's stored UPI.
- **FR-46:** Every scan/cashback record is tagged with its originating channel (`guest_web` / `mobile_app`); a Consumer's unified history (FR-36) shows both regardless of which channel produced which entry.
- **FR-47:** A Consumer who has only ever used the guest/web channel and later installs the Application's mobile app logs in with the same phone number and sees their prior guest-scan history already present.
- **FR-48:** A scan-and-earn (or hybrid) Application Owner may commission a fully separate, independently-branded, independently-compiled mobile app (iOS and/or Android), published under their own app-store developer account(s) — not a shared, runtime-reskinned app.
- **FR-49:** Scan4Earn provides the branding-configuration surface (app name, icon, splash screen, colour scheme, bundle/package identifier) and a build pipeline that produces a signed, submittable binary per Application on request.
- **FR-50:** The underlying app functionality is identical across every Application's app (registration, login, profile, UPI management, scan, history, points/cashback balance, redemption requests) — one shared codebase; only the build configuration forks per client, never the code.

### Data Model Changes
- **DR-22:** `scans` and `cashback_transactions` gain a `scan_channel` column (`guest_web` / `mobile_app`).
- **DR-23:** New `application_mobile_apps` table: `application_id`, `platform`, `bundle_id`, `app_store_listing_url`, `branding_config` (JSONB), `build_status`, `last_built_at`, `version`.

### Non-Functional Requirements
- **NFR-12:** Because FR-48 commits to fully separate compiled apps per Application, every shared-codebase update requires a rebuild-and-resubmit cycle per Application, indefinitely — track this as ongoing release-management workload, not a one-time build cost.

### Resolved Decisions Landing Here
- **RD-10:** Each Application gets a fully separate, independently compiled and published mobile app under its own app-store developer account — not a single shared, runtime-reskinned app. Accepted with the understanding that this carries ongoing per-Application release overhead (NFR-12).
- **RD-11:** Guest/web scan UPI is always re-entered fresh; never read from or written to a stored profile — the mobile-app channel is the only path where UPI is remembered.
- **RD-13 (scan-and-earn half):** A Consumer's account is the same regardless of whether it was first created via guest scan or mobile-app registration — history unifies across channels within one Application.

## Explicitly Out of Scope (deferred)
- Over-the-air app updates (CodePush-style) — explicitly out of scope for the whole product (master PRD Non-goals); every release goes through the normal app-store review cycle.
- A shared/runtime-reskinned app alternative was considered and explicitly rejected (RD-10) — do not build it as a "cheaper" substitute without re-confirming with the product owner, since the fully-separate-apps model was a deliberate, informed choice, not a default.

## Rollout Note

This is the most operationally expensive phase in the whole roadmap, by design (per RD-10). Each new Application Owner who wants a mobile app means: branding intake, a build, and a full app-store submission/review cycle — repeated again for every future codebase update. Plan release cadence and support capacity accordingly before marketing this as a standard offering to every scan-and-earn client; consider whether it should be gated as a premium/opt-in add-on (the base guest/web scan channel from Phase 1/2 already delivers a complete scan-and-earn experience without this phase at all).

## Definition of Done
- [ ] Guest/web scan (Channel 1) is verified to never read or persist a UPI ID beyond the single transaction it was entered for.
- [ ] A test Application's mobile app can be branded (name/icon/splash/colors) and built into a signed binary via the pipeline.
- [ ] A consumer registered in the mobile app has their UPI stored on profile and can scan without re-entering phone/OTP/UPI on subsequent scans.
- [ ] A consumer who used guest/web first, then installs and logs into the mobile app with the same phone number, sees their prior scan history already present.
- [ ] Every scan/cashback record correctly tags its `scan_channel`.
- [ ] Two different Applications' mobile apps are verified to be genuinely separate binaries/store listings, not a shared app with a theme switch.
