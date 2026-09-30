# Phase 7 — Dashboards, Analytics & Reporting Polish

**Depends on:** Phases 1–6 (needs real traffic — orders, scans, payments, domains — actually flowing to have anything meaningful to visualize)
**Unlocks:** Nothing further — this is the final polish layer of the v1 roadmap
**Master reference:** `../../PRD.md` §6.5

## Goal

Upgrade the basic numbers/tables shipped in earlier phases into the full, decision-useful dashboards described in the product blueprint — charts, exports, heatmaps, and a genuinely self-service API reference.

## In Scope

### Functional Requirements
- **FR-15 (rich):** Full dashboard experience for both Application types, beyond Phase 2's basic tables.
- **FR-19 (rich):** Super Admin's platform-wide dashboard gains a fully fleshed-out per-Tenant health list (Application count, subscription status, last payment) alongside the counts shipped in Phase 1/3.
- **FR-20 (rich):** Tenant Admin dashboard's Application list and billing views get final polish — sorting, filtering, search — on top of the columns added incrementally in Phases 3, 4, and 5.
- **FR-21 (rich):** Ecommerce Application dashboard adds: revenue-over-time chart, order-status funnel, top-products table, stock-movement log, webhook-delivery health panel, and CSV export — on top of the plain order/customer/low-stock numbers Phase 2 already ships.
- **FR-22 (rich):** Scan-and-earn Application dashboard adds: scans-over-time chart, geo heatmap (lat/long already captured at scan time), top-batches table, and failed-payout queue — on top of the plain scan/cashback/points numbers Phase 2 already ships.
- **FR-22a (finalize):** The Billing menu item (subscription status from Phase 4, credit balance/ledger from Phase 5) gets its final layout and history views.
- **FR-30 (extended):** `/api-docs` grows from Phase 2's filtered endpoint list into the full self-service reference: a Swagger-style endpoint explorer with method badges and request/response schemas, a **try-it-out console** that fires real sandbox calls using the Application's own credentials, copy-paste code samples (curl, JavaScript/fetch) with the key and base URL pre-substituted, and a webhook event catalog with payload schemas, a signature-verification sample, and a "send test event" button.

## Explicitly Out of Scope
- Nothing new is deferred *from* here — this is the last phase in the v1 roadmap. Anything not listed above (recurring billing, refunds, multi-seat Applications, Tenant-lapse cascading) remains out of scope for the whole product per the master PRD's Non-goals section, not just this phase.

## Rollout Note

This phase is pure enhancement — nothing it ships is required for Phases 1–6 to be safe or functional in production. It can be sequenced flexibly (e.g., ecommerce charts before scan-and-earn charts, or vice versa) based on which Application type your first real customers are using.

## Definition of Done
- [ ] Ecommerce dashboard: revenue-over-time chart, order funnel, top products, stock-movement log, webhook health, and CSV export all verified against real order data.
- [ ] Scan-and-earn dashboard: scans-over-time chart, geo heatmap, top-batches table, and failed-payout queue verified against real scan data.
- [ ] Super Admin's per-Tenant health list is sortable/filterable and reflects live subscription/last-payment status.
- [ ] `/api-docs` try-it-out console successfully fires a real sandbox call using the viewing Application's own live credentials.
- [ ] Webhook event catalog's "send test event" button delivers a correctly-signed sample payload to a configured test endpoint.
