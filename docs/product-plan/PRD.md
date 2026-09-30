# Scan4Earn — Product Requirements Document

**Status:** Final
**Owner:** Sumant Mishra
**Source of truth for product model:** `product-plan/ideal-application-flow.html`

---

## 1. Summary

Scan4Earn is a multi-tenant **Application-provisioning platform**, and at its core, a **BaaS (Backend-as-a-Service)**: Scan4Earn itself never ships the surface a real consumer shops or scans on — it ships the backend and the APIs behind it. A **Tenant** (a reseller/agency) onboards client businesses and provisions an **Application** for each one — either an **ecommerce store** or a **scan-and-earn campaign** or **both**. Every Application has exactly one owner login: the external business that actually runs it. **Tenant Admin** should have option to add product templates, which applications can use. While creating application, tenant admin assigns template to the application and as per the fileds added in template, dynamic form will be created in the application dashbaord for adding products. One application will not have more then one template. The template can be created by either of **Tenants** or **Applications**. This temaplates are editable only until the products are not added. Once the product is added with respect to any template, that will not be editable.

**The BaaS relationship, explicitly:** the moment a Tenant Admin provisions an Application, Scan4Earn generates the full set of backend APIs that Application is entitled to, scoped by its `app_type` — ecommerce APIs (consumer auth, catalog, cart, checkout, orders, addresses — §6.11), scan-and-earn APIs (scan verification, consumer auth, UPI/profile, scan history, cashback — §6.12), or both for `HYBRID`. The Application Owner's job — end to end — is to integrate those APIs into **their own consumer-facing surface**: a website for an ecommerce Application, and/or a mobile app for a scan-and-earn Application (either the fully white-labeled app Scan4Earn builds for them per §6.13, or their own separately-built client consuming the same APIs). Scan4Earn hosts none of that consumer-facing surface itself — the only exceptions are the permanent guest-scan landing page (FR-16, unbranded infrastructure that exists purely so a printed QR code always resolves to *something*) and the Application Owner's own operational dashboard (§6.5/§6.7), which is for the business, not for its consumers.

**The website (or app) is entirely the Application Owner's own.** Scan4Earn places zero constraint on its framework, design, hosting, or UX — the relationship is API-only. Whatever the business already has, or wants to build, is what integrates; Scan4Earn never dictates how the storefront looks or where it's hosted. This is precisely what makes the BaaS value proposition real: the business doesn't need to build or maintain a catalog/inventory engine, an order state machine, payment collection and reconciliation, consumer OTP authentication, fraud-safe coupon/scan logic, or cashback payout mechanics — Scan4Earn owns all of that behind the API. All the business manages is the look, feel, and content of its own customer-facing surface; everything behind "place order" or "scan this code" is Scan4Earn's problem, not theirs.

The defining product rule: **operational business data (add products, view products, orders, inventory, stock, scans, cashback, coupon burn-down) exists only inside an Application's own dashboard.** Neither the Super Admin nor the Tenant Admin has any screen — aggregated or otherwise — that shows this data. Their dashboards are provisioning and billing consoles only.

---

## 2. Problem Statement

Businesses that want to run an online store or a QR-based reward campaign need backend infrastructure (catalog, inventory, orders, coupon/scan tracking, payouts) without building it themselves. Agencies/resellers want to package and sell this infrastructure to multiple client businesses under one commercial relationship with the platform, without taking on operational responsibility — or liability — for how each client runs their own store or campaign.

Today's codebase conflates these concerns: a "verification app" is owned and staffed by tenant-internal people, dealers exist as a distinct scanning role, and admin-tier screens leak or partially leak operational data. This PRD defines the target model that resolves both problems.

---

## 3. Goals

- G1: A reseller (Tenant) can onboard a client business and provision an Application for it in a self-service flow, with no engineering involvement.
- G2: An Application always has exactly one owner account — the client business — and that account is the only login that can ever see or act on that Application's operational data.
- G3: Super Admin and Tenant Admin dashboards contain zero business-operational data, by construction (not by UI hiding).
- G4: Support both Application types — ecommerce and scan-and-earn, or both at once (hybrid) — on one shared platform, billing, and domain-routing model, with a single dashboard shell whose menus are switched by feature flag rather than separate portals.
- G5: Consumers interact with Applications directly (scan, buy) with no intermediary role required.
- G6: Every Tenant and every Application has a real, enforced payment lifecycle. Provisioning without payment leaves the entity fully inert — never a "trust me, I'll pay later" state.
- G7: Consumers transact (buy or scan) using a single unified phone+OTP identity per Application — no separate signup form, whether they arrive via guest checkout, a guest QR scan, or the Application's own dedicated mobile app.
- G8: An Application Owner's consumer-facing website is entirely their own — Scan4Earn imposes no framework, design, or hosting constraint on it. The relationship is API-only: the business manages the look/feel/content of its own site; Scan4Earn owns everything behind the API call (catalog/inventory, order state, payment collection, consumer auth, fraud-safe scan/coupon logic, cashback payouts) so the business doesn't have to build or run any of it.

### Non-goals (this version)

- Tenant Admin acting as support/impersonation into an Application (flagged as future work, not in scope now).
- Multi-user access within a single Application (one owner login per Application is the v1 rule).
- Any dealer, field-agent, or assisted-scanning role — explicitly removed from the product.
- Recurring auto-charge billing (auto-debiting a saved card/UPI mandate) — v1 is fixed-term, pay-to-renew only, not automatic recurring charges.
- Refunds, chargebacks, partial-period proration, and payment dispute handling — not covered in this version.
- Overage billing when a Tenant exceeds its plan's Application ceiling — the platform blocks creation of the next Application and prompts an upgrade; it never auto-charges for an extra slot.

---

## 4. Users & Roles

| Role | Who | Logs in at | Owns |
|---|---|---|---|
| **Super Admin** | Platform owner | `scan4earn.com` | The whole platform |
| **Tenant Admin** | Reseller/agency (e.g. Vertex Retail Partners) | Tenant subdomain or custom domain | Nothing operational — provisions and bills |
| **Application Owner** | The external client business (e.g. Mr. Pal / Pals Paint, Meera / Sumukham) — the company side of the Application, with its own dashboard and API keys | The Application's own path or custom domain | Full operational control of the Application(s) it owns |
| **Consumer** | End customer/shopper (e.g. Priya) | Public scan link / storefront | Their own orders/points/cashback within one Application |

There is no Dealer role and no App Viewer role. One Application = one owner login.

**Clarifying the Application Owner relationship:** an Application's dashboard and its API are two faces of the same thing. The Application Owner integrates their API keys into their **own public website or app** (e.g. `www.palspaint.com`) — that is where real consumers actually browse a catalog, place an order, or trigger a scan. The dashboard is simply where that same owner logs in to see the result of that public traffic: an order a shopper just placed on `www.palspaint.com` is written straight to, and only ever visible on, Pals Paint Store's own dashboard. No consumer ever transacts on `scan4earn.com` itself (aside from the permanent QR-scan landing page) — they always transact on the Application Owner's own branded site, which is simply wired to Scan4Earn as its backend.

---

## 5. Core Concepts

- **Tenant**: A reseller account. Has a subdomain (`{slug}.scan4earn.com`), a credit balance, a subscription record, and a list of Applications it has provisioned.
- **Application** (replaces "verification app" in all user-facing surfaces, backend and databases): One unit of product sold to one client business. Has a `type` (`ECOMMERCE` or `SCAN_AND_EARN`), its own branding, API keys, and exactly one `owner_user_id`.
- **Application Owner**: The user account bound to `applications.owner_user_id`. Set once via an owner-invite flow when the Tenant provisions the Application; reassignment requires the current owner's consent.
- **Consumer/Customer**: Scoped per Application (`UNIQUE(application_id, phone/email)`), not platform-wide.
- **Subscription Plan**: A Super-Admin-managed, configurable catalog entry (name, flat price-per-month, max Applications allowed, active/inactive) that a Tenant subscribes to. Governs how many Applications a Tenant may provision — not a per-Application price.
- **Tenant Subscription**: One Tenant's active (or past) subscription to a Plan for a chosen duration in months. Total payable = plan price × duration.
- **Application Subscription**: A Tenant-configured, per-Application billing record — the Tenant Admin sets a custom price-per-month and a duration (in months) individually for each Application at creation time. The Application Owner must pay this amount to activate, and again to renew, the Application. Applies uniformly regardless of `app_type`.
- **Credit**: The metering unit that gates scan-and-earn actions (coupon batch creation) only — ecommerce Applications never touch the credit system. Exists at three cascading ledger levels: Super Admin (sells credits) → Tenant (`tenant_credit_balance`) → Application (`application_credit_balance`, new).
- **`app_type` feature flag**: `ECOMMERCE` / `SCAN_AND_EARN` / `HYBRID`, set by the Tenant Admin when provisioning an Application to match what was actually sold to the client. Drives which menu items and API endpoint groups appear in one single, shared Application dashboard shell — there is never a separate ecommerce portal vs. scan-and-earn portal.
- **Consumer identity (OTP-unified)**: A Consumer's account is created implicitly the first time they verify an OTP against a phone number, scoped per Application (`UNIQUE(application_id, phone)`). There is no separate sign-up form or password anywhere in the product for Consumers — phone + OTP is both registration and login, for ecommerce checkout and for scan-and-earn alike.
- **Scan channel**: Every scan-and-earn reward event is tagged with the channel it came through — `guest_web` (any camera, the permanent public landing page, no app) or `mobile_app` (the Application's own dedicated, separately-published app). The two channels differ only in whether the UPI ID is entered fresh every time (`guest_web`, always) or read from a stored profile (`mobile_app`, set once at registration).
- **Application payment sub-account**: For ecommerce (or hybrid) Applications, a per-Application payment-gateway sub-account (e.g. a Razorpay Route linked account) that the Application Owner completes KYC/onboarding for before checkout can accept live payments. Shopper payments settle directly here — never through Scan4Earn's own platform account, and never through the Tenant's account. Entirely separate from the platform's internal Tenant/Application billing (§6.8) and from the Super Admin's own cashback-payout account (§6.8 Layer 3 settlement note).
- **White-labeled mobile app**: A scan-and-earn (or hybrid) Application Owner may commission their own fully separate, independently-branded, independently-compiled and published mobile app (iOS/Android), built from a shared Scan4Earn app template but published under the Application Owner's own app-store developer account — not a shared, runtime-reskinned app.

---

## 6. Functional Requirements

### 6.1 Super Admin

- FR-1: Create/suspend Tenants; set Tenant subdomain slug and Application limit.
- FR-2: Approve/reject Tenant credit requests; maintain the platform-wide credit ledger.
- FR-3: Manage global feature flags and the product-template library.
- FR-4: View platform-wide counts: total Tenants, total Applications (by type), active subscriptions, credits sold, pending credit requests, and a per-Tenant health list (Application count, subscription status, last payment).
- FR-5 (hard constraint): No Super Admin screen or API response may contain a row from an Application-grain table (orders, products, scans, cashback, stock, coupons). Aggregates shown must come from pre-aggregated rollup tables, never a live join into Application-grain data.
- FR-4a: Manage a configurable catalog of subscription plans (create, edit, deactivate) — each with a name, flat price-per-month, and a maximum-Applications ceiling (nullable = unlimited). Seed with Plan 1 (₹2,000/mo, up to 3 Applications), Plan 2 (₹5,500/mo, up to 10 Applications), Plan 3 (₹50,000/mo, unlimited Applications) — all three are ordinary catalog rows, not hardcoded; Super Admin can add, edit, or retire plans at any time without a deploy.
- FR-4b: Configure the platform-wide credit exchange rate (INR per credit) used when a Tenant purchases credits from the Super Admin. Rate changes only affect future purchases, never retroactively re-price an already-approved request.
- FR-4c: Approve Tenant credit-purchase requests. Approval is automatic upon confirmed payment (see §6.8/NFR-7) — no separate manual click — crediting `tenant_credit_balance` by the requested amount.

### 6.2 Tenant Admin

- FR-6: Onboard a client business and provision an Application for it, choosing `type` (ecommerce / scan-and-earn), name, and branding. Provisioning immediately generates that Application's API key(s) and its entire backend API surface, scoped by `app_type` (see FR-28–FR-30, §6.11, §6.12) — this is the BaaS deliverable the Application Owner receives and integrates into their own consumer-facing website and/or mobile app (§1).
- FR-7: Send an owner-invite (email + OTP) to the client business; the Application has no functioning owner until this invite is accepted. The invite expires after **14 days** if unaccepted — the Application then reverts to an unowned/inert state and its slot/credits are freed for re-provisioning (see RD-2).
- FR-8: Request credits for the Tenant; view the Tenant's own credit balance and burn rate.
- FR-9: View an administrative list of its Applications: name, client, type, status, owner, credits consumed, subscription tier. No drill-in to operational detail exists from this list.
- FR-10 (hard constraint): Same as FR-5, scoped to the Tenant's own Applications — a Tenant Admin session must be rejected (403) by any Application-scoped operational route, even for Applications it provisioned itself.
- FR-6a: Subscribe the Tenant itself to a Plan for a chosen duration (in months); total payable = plan price-per-month × duration; pay via gateway checkout. On confirmed payment the Tenant's active plan updates and its max-Applications ceiling is enforced from that point. Provisioning an Application beyond the plan's ceiling is blocked with an upgrade prompt — no overage billing in v1 (see Non-goals).
- FR-6b: When provisioning an Application (FR-6), also set that Application's own billing terms: a custom price-per-month (numeric input) and a duration in months (1/3/6/9/12). This becomes the Application's first billing cycle — the Application is created in an inert, unpaid state until its owner pays this amount (see §6.9 Activation & Deactivation).
- FR-6c: Optionally set the Tenant's own credit resale rate (INR per credit) for reselling credits to its own Applications; if unset, falls back to the current platform-wide rate.
- FR-6d: Approve or reject an Application's credit-purchase request. Approval is automatic upon the Application Owner's confirmed payment, but is only ever possible if the Tenant's own `tenant_credit_balance` currently holds at least the requested amount — the platform refuses to even generate a payable order for the Application if the Tenant lacks sufficient balance, surfacing "Tenant does not have enough credits to sell" rather than accepting a payment it cannot fulfil.
- FR-6e: A product template (formalizing the rule already stated in §1) may be created by either a Tenant Admin (available to all its Applications) or an Application Owner (a custom template for that Application alone) — never by Super Admin as tenant-facing business configuration. One Application uses exactly one template at a time. A template is freely editable until the first product referencing it is created; from that point it is permanently locked — no further field additions, removals, or type changes, regardless of who created it.

### 6.3 Application Owner

- FR-11: Accept an owner-invite (within the 14-day window) and set up OTP login; becomes the sole account bound to `owner_user_id` for that Application, permanently — no delegation or additional logins are ever added for this Application (see RD-1).
- FR-12 (Ecommerce Applications): Manage product catalog (templates, variants, images, stock), categories, tags; view and transition order status (pending → confirmed → processing → shipped → delivered); view inventory and stock-movement history; manage coupons/discounts scoped to the store; manage API keys and webhooks; view an embedded, pre-filled API reference for the Application.
- FR-13 (Scan-and-earn Applications): Create coupon batches (reward type, quantity, expiry) — but only once `application_credit_balance` holds enough credits to cover the batch. The Application Owner must first request credits from their Tenant (FR-11d) and have that request approved (i.e. paid — see §6.8 Layer 3) before any coupon batch can be created; there is no path to create a coupon batch against a zero or insufficient balance. A batch can be created for any quantity up to the Application's currently available balance — the required credits are debited from `application_credit_balance` automatically and atomically at batch-creation time (no separate "confirm debit" step, no bypass path); generate non-enumerable QR codes; manage the draft → printed → active lifecycle; view scan history, cashback/points ledger, and pending redemptions; approve/reject redemption requests.
- FR-14: An owner who owns more than one Application (e.g. Mr. Pal owns both Paint Coupons and Pals Paint Store) can switch between them from one login, but each remains independently scoped — no cross-Application data ever appears combined.
- FR-15: Full dashboards per type — see §6.5.
- FR-11a: On first login (after accepting the owner-invite), land directly on a single Activate & Pay page showing this Application's price-per-month × duration = total payable, with a gateway checkout button. No other page in the Application is reachable until payment is confirmed.
- FR-11b (Ecommerce or Hybrid Applications only): after activation, an Ecommerce menu (Products, Inventory, Orders, Customers) appears inside the shared Application dashboard shell.
- FR-11c (Scan-and-earn or Hybrid Applications only): after activation, a Scan &amp; Earn menu (Batches, Coupons, Scans, Redemptions, Cashback, Credit Balance) appears inside the same shared dashboard shell — never a separate app or portal switch.
- FR-11d: Request additional credits from the owning Tenant (amount only, in credits) to fund future coupon batches. The platform computes total payable using the Tenant's resale rate (or the platform default) and generates a gateway checkout; on confirmed payment the request is auto-approved, `application_credit_balance` is credited, and `tenant_credit_balance` is simultaneously debited by the same amount.
- FR-11e: View the Application's own credit balance and full credit transaction ledger (requests, payments, batch debits) — scoped to this Application only, never combined with a sibling Application even if the same owner runs more than one.
- FR-11f: Renew the Application's subscription, before or after expiry, via the same Activate & Pay flow; renewal extends `end_date` by the paid duration from whichever is later (the current `end_date` if renewing early, or the payment date if renewing after a lapse).

### 6.4 Consumer

- FR-16: Scan a QR code directly (no assisted/dealer scanning path exists) → land on a branded page resolved from the coupon's Application → OTP → reward (points or UPI cashback).
- FR-16a: If the Application a scan or storefront request resolves to is not currently in `active` billing status, the consumer-facing response is a branded "temporarily unavailable" page, never a raw 404/500 — the same rule the Production Rulebook already applies to a suspended Tenant, now applied per-Application (see §6.9).
- FR-17: Browse and purchase from an ecommerce Application's storefront via its public API (cart, wishlist, checkout) using the Application's own API key, from the business's own website.
- FR-18: Consumer identity is scoped per Application (`UNIQUE(application_id, phone/email)`) — the same person can hold separate identities across different Applications.

### 6.5 Dashboards (see blueprint for full KPI lists)

- FR-19: Super Admin dashboard — Tenant/Application counts, subscription/billing status, platform credit ledger. No business metrics.
- FR-20: Tenant Admin dashboard — Application list (administrative fields only), credit balance/burn rate, pending invites. No business metrics. Also shows: the Tenant's own plan/subscription status and renewal date, a per-Application billing list (price, duration, status, next renewal date), and pending Application credit requests awaiting approval.
- FR-21: Ecommerce Application dashboard — orders, GMV, AOV, conversion rate, fulfillment queue, low-stock alerts, API success rate, unique customers, revenue-over-time, order funnel, top products, stock-movement log, webhook health, CSV export.
- FR-22: Scan-and-earn Application dashboard — total scans, success rate, cashback paid, points issued, coupon burn-down, pending redemptions, new customers, scans-over-time, geo heatmap, top batches, failed-payout queue.
- FR-22a: Both dashboards above are menu sections of **one shared Application dashboard shell** (see §6.7), each gaining a "Billing" menu item showing this Application's own subscription status, renewal date, and payment history, plus — for scan-and-earn/hybrid Applications only — its credit balance and ledger.

### 6.6 Domains & Routing

- FR-23: Every Tenant and every Application resolves by default under `scan4earn.com` (Tenant via subdomain, Application via path) with zero DNS setup.
- FR-24: A Tenant may map a custom domain to its own reseller portal (Application-scoped domain rows excluded) — administrative content only, same restriction as FR-10 applies regardless of hostname.
- FR-25: An Application Owner may map a custom domain directly to their Application (the expected common case, since each is typically a distinct branded business).
- FR-26: Hostname resolution (custom domain → subdomain → root → 404) is independent from, and always followed by, an identity check: the authenticated user must equal the Application's `owner_user_id` for any Application-scoped operational route to succeed. Host resolution alone is never sufficient authorization.
- FR-27: Printed/physical QR codes always encode the permanent `scan4earn.com/s/:code` URL, never a custom domain — branding is applied at scan time based on current Application config.

### 6.7 Feature Flags & Unified Dashboard

- FR-28: An Application's `app_type` (`ECOMMERCE`, `SCAN_AND_EARN`, or `HYBRID`) is set once by the Tenant Admin at provisioning time, matching what was commercially sold to the client. It is the single source of truth for which menu sections and API endpoint groups are exposed.
- FR-29: There is exactly one Application dashboard shell/codebase. `ECOMMERCE` Applications see only the Ecommerce menu group; `SCAN_AND_EARN` Applications see only the Scan &amp; Earn menu group; `HYBRID` Applications see both, inside the same login, the same navigation shell — never a separate URL, subdomain, or portal per feature.
- FR-30: The embedded API reference (`/api-docs`) filters its endpoint catalog the same way — an `ECOMMERCE` Application never sees scan/coupon endpoints documented, and vice versa; a `HYBRID` Application sees both groups.

### 6.8 Billing, Subscriptions & Credit Hierarchy

This is the core money-flow model for the whole platform. Three layers, stacked:

**Layer 1 — Super Admin ⇄ Tenant (subscription plan, governs how many Applications a Tenant may create):**
1. Super Admin maintains the configurable plan catalog (FR-4a).
2. Tenant Admin selects a plan + duration and pays via gateway checkout (FR-6a).
3. Confirmed payment auto-activates the subscription and sets the Tenant's max-Applications ceiling.
4. The ceiling is enforced at Application-creation time; there is no automatic overage charge for exceeding it (see Non-goals) — creation is simply blocked with an upgrade prompt.

**Layer 2 — Tenant ⇄ Application Owner (flat per-Application subscription, governs whether one specific Application works at all):**
1. The Tenant Admin sets a custom price-per-month + duration for each Application individually, at creation time (FR-6b).
2. The Application Owner, once they accept their invite, is shown nothing but the Activate & Pay page until they pay that amount (FR-11a).
3. Confirmed payment activates the Application for the paid period; on expiry without renewal, the Application reverts to the same single-page paywall (FR-11f, see §6.9).
4. This layer applies to every Application regardless of `app_type` — ecommerce, scan-and-earn, and hybrid Applications are all subject to the same flat subscription mechanism.

**Layer 3 — Scan-and-earn only: cascading credit hierarchy (Application ⇄ Tenant ⇄ Super Admin, governs how many coupons/scans an Application may generate):**
This layer exists only for the scan-and-earn half of an Application's activity (coupon batch creation). It is entirely separate from, and stacked on top of, Layer 2 — an Application can be fully "active" on its subscription and still be unable to create a coupon batch because its own credit balance is empty.
1. Super Admin sets the platform-wide credit rate (FR-4b) — the price Tenants pay per credit.
2. Tenant requests N credits from Super Admin (existing `credit_requests` flow, now payment-gated): total payable = N × platform rate. Tenant pays via gateway; on confirmed payment the request is auto-approved and `tenant_credit_balance` is credited by N (FR-4c). Payment confirmation *is* the approval — no separate manual click remains.
3. Tenant optionally sets its own resale rate for its Applications (FR-6c); defaults to the platform rate if unset.
4. Application Owner requests M credits from their own Tenant: total payable = M × the Tenant's resale rate. Before this request can even be paid, the platform checks that the Tenant's own `tenant_credit_balance` currently holds ≥ M — a Tenant can never sell more credit than it has itself bought from the Super Admin (FR-6d). On confirmed payment, `application_credit_balance` is credited by M and `tenant_credit_balance` is simultaneously debited by M (FR-11d) — credits move down the hierarchy; they are never created out of thin air at the Tenant or Application level.
5. Creating a coupon batch debits `application_credit_balance` directly (replaces today's tenant-level debit), with no bypass path (see NFR-3).
6. **Settlement is a separate system from the credit ledger.** When a consumer actually scans a coupon and a cashback/points reward is triggered, the real money paid out via UPI is always disbursed from the **Super Admin's own configured payment/payout account** — unchanged from today's single `RAZORPAY_ACCOUNT_NUMBER` architecture in `paymentGateway.service.js`. Credits are purely an internal entitlement ledger that governs who is allowed to generate how many coupons; they are not a pre-funded escrow that pays for the cashback itself. This distinction must stay explicit in any implementation spec so the two systems are never conflated.

### 6.9 Activation & Deactivation — the single-page paywall

- FR-31: If an Application's Layer 2 subscription is not currently `active` — never-paid, expired, or manually suspended — every route for that Application is replaced by exactly one page/response: "Activate your plan," showing price × duration = total, with a Pay button. This applies to:
  - The Application Owner's dashboard (every URL redirects here).
  - The Application's public storefront/API calls (ecommerce) — requests return a clear, branded "temporarily unavailable" response, never raw order-processing.
  - The Application's scan-and-earn public scan landing — scanning a valid coupon on an inactive Application shows the same branded "temporarily unavailable" page instead of a reward flow.
- FR-32: Renewal follows the same single page, whether renewing early (before expiry) or reactivating after a lapse (FR-11f).
- FR-33 (assumption — flag back if wrong): a Tenant's own Layer 1 plan lapsing does **not** automatically cascade into suspending its already-paid, already-active Applications. Each Application's uptime is governed solely by its own Layer 2 subscription status. A lapsed Tenant plan only blocks that Tenant Admin from provisioning *new* Applications until renewed. Rationale: an Application Owner who has paid on time should not go dark because of a billing hiccup on their reseller's side, which they have no visibility into or control over.

### 6.10 Consumer Authentication & Identity

- FR-34: A Consumer's account is created implicitly on first successful OTP verification against a phone number, scoped per Application (`UNIQUE(application_id, phone)`). There is no separate registration form or password anywhere in the product for Consumers.
- FR-35: The same phone+OTP flow is both "login" and "register" — verifying an OTP for a phone number that already has an account against this Application logs into it; verifying for a new number creates one. Nothing distinguishes a "first-time" flow from a "returning" flow except that the account already exists.
- FR-36: A Consumer's account holds their order history (ecommerce) and scan/cashback history (scan-and-earn) for that Application, viewable after logging in (OTP) — regardless of which channel (guest checkout, guest scan, or the Application's own mobile app) originally created the account.
- FR-37: Consumer identity is never shared across Applications — the same phone number verified against two different Applications produces two entirely separate accounts with no shared history (restates FR-18 in light of FR-34's implicit-creation model).

### 6.11 Ecommerce Checkout, Payments & Order Management

- FR-38: Checkout requires phone number + OTP verification before an order can be placed — there is no fully anonymous order. This OTP step doubles as implicit account creation/login (FR-34/FR-35); the shopper never fills out a separate sign-up form.
- FR-39: A shopper may enter a one-off delivery address inline at checkout, or select/manage saved addresses from their address book once logged in. Address book: list/create/update/delete/set-default, scoped per Application per Consumer account.
- FR-40: Checkout payment is collected by Scan4Earn on behalf of the Application Owner via a per-Application payment-gateway sub-account that the Application Owner completes KYC/onboarding for. Funds settle directly to the Application Owner's own bank account — Scan4Earn's own platform account and the Tenant's account are never in this money path. Until an Application completes this onboarding, its checkout must be disabled or restricted to Cash-on-Delivery (Application Owner's choice, if the Tenant allows COD) — never allowed to silently fail at payment time.
- FR-41: Order payment confirmation follows the same signed-webhook pattern as the platform's own billing (NFR-7/NFR-8) — a payment is only considered complete once the gateway's webhook confirms it, never a client-side callback alone.
- FR-42: A logged-in Consumer can view their own order list, order detail/tracking, and download a generated invoice for any completed order — scoped to their own orders in this Application only.
- FR-43: Order cancellation is allowed only while the order is in an early, cancellable status (before `shipped`); the exact allowed statuses are configurable per Application by its owner.

### 6.12 Scan-and-Earn: Two Scan Channels

- FR-44: **Channel 1 — Guest/Web scan.** Any camera/QR scanner opens the permanent public landing page (FR-16); the consumer verifies phone+OTP (FR-34/FR-35, creating/reusing their Application-scoped account for history purposes only), then enters a UPI ID **fresh, every single time** — never read from, and never written back to, any stored profile — and cashback transfers to that UPI immediately.
- FR-45: **Channel 2 — Mobile App scan.** The consumer registers once inside the Application's own dedicated app (the same unified phone+OTP flow) and adds their UPI ID as part of their profile during or after registration. Once logged in, scanning inside the app resolves identity from the active session — no phone/OTP/UPI re-entry per scan — and cashback auto-transfers to the profile's stored UPI.
- FR-46: Every scan/cashback record is tagged with its originating channel (`guest_web` / `mobile_app`); a Consumer's unified history (FR-36) shows both regardless of which channel produced which entry.
- FR-47: A Consumer who has only ever used the guest/web channel and later installs the Application's mobile app logs in with the same phone number and sees their prior guest-scan history already present — it is the same account; only the channel differs.

### 6.13 White-Labeled Mobile Apps

- FR-48: A scan-and-earn (or hybrid) Application Owner may commission a fully separate, independently-branded, independently-compiled mobile app (iOS and/or Android), built from a shared Scan4Earn app template and published under the Application Owner's own app-store developer account(s) — not a shared, runtime-reskinned app.
- FR-49: Scan4Earn provides the branding-configuration surface (app name, icon, splash screen, colour scheme, bundle/package identifier) and a build pipeline that produces a signed, submittable binary per Application on request.
- FR-50: The underlying app functionality (registration, login, profile, UPI management, scan, history, points/cashback balance, redemption requests) is identical across every Application's app — only branding and store listing differ. One shared codebase; only its build configuration forks per client, never the code itself.

---

## 7. Data Model Requirements

- DR-1: Every business-operational table carries `application_id` (NOT NULL): `products`, `coupons`, `coupon_batches`, `ecommerce_orders`, `scans`, `points_transactions`, `cashback_transactions`, `stock_movements`, `webhooks`, `api_usage_logs`.
- DR-2: Every `applications` row carries exactly one `owner_user_id` (NOT NULL once the owner-invite is accepted; NULL only in the brief pre-acceptance state, during which the Application is fully inert — no scans, no orders, no API calls possible).
- DR-3: Tenant-grain tables (`tenants`, `tenant_credit_balance`, `credit_requests`, `tenant_subscriptions`, `custom_domains`) are the only tables Super Admin/Tenant Admin queries may touch. **Carve-out:** a Tenant Admin may additionally query its own Applications' `application_subscriptions` and `application_credit_requests` rows, but only the administrative/billing columns already listed in FR-20 plus the fields a Tenant Admin needs to actually act on a pending request — price, duration, status, next renewal date, requested amount, rate applied, total payable, requested-at timestamp, request status — never `application_credit_balance`, `application_credit_transactions`, or any order/scan/cashback/inventory table. This is the one intentional, narrow exception to the Application-grain boundary in FR-10/NFR-1, required by FR-6d/FR-20; it is not a general grant of Application-grain access. **`product_templates`** is not purely Tenant-grain: per FR-6e (below), an Application may also own its own custom template row, scoped by `application_id`, visible only to that Application's owner and the provisioning Tenant Admin (read-only for the Tenant Admin, per the existing FR-9/FR-20 administrative-list pattern) — never to Super Admin as business data, and never exposing product-level data alongside it.
- DR-4: Remove `dealers`, `dealer_points`, `dealer_point_transactions` tables entirely. Remove `DEALER` from the `users.role` CHECK constraint.
- DR-5: Collapse `APP_MANAGER`/`APP_VIEWER` into a single `APPLICATION_OWNER` role — one tier, no read-only variant.
- DR-6: Application deletion is soft-delete only — never `SET NULL` or `CASCADE` on financial history (orders, scans, cashback, points).
- DR-7: `custom_domains` table: `hostname` (UNIQUE), `tenant_id` (NOT NULL), `application_id` (NULL = Tenant portal, set = one Application), `is_primary`, `verification_token`, `status`, `ssl_status`.
- DR-8: New `subscription_plans` table: `id`, `name`, `price_per_month` (NUMERIC), `max_applications` (INTEGER, NULL = unlimited), `is_active`, `sort_order`, `created_by`, `created_at`, `updated_at`. Seeded with the three initial plans; fully editable/extensible by Super Admin (FR-4a).
- DR-9: `tenant_subscriptions` gains a `plan_id` FK to `subscription_plans` (the source of truth for new subscriptions going forward — existing free-form `app_count`/`price_per_app_month` rows remain valid historical records, not migrated). `total_amount` = `plan.price_per_month` × `duration_months`.
- DR-10: New `application_subscriptions` table: `id`, `application_id` (NOT NULL), `tenant_id` (NOT NULL), `price_per_month` (NUMERIC, Tenant-set per Application), `duration_months` (1/3/6/9/12), `total_amount`, `currency`, `start_date`, `end_date`, `status` (`pending_payment`/`active`/`expired`/`cancelled`), `payment_status`, `gateway_order_id`, `paid_at`, `created_by`, `created_at`, `updated_at`.
- DR-11: New `platform_credit_rate` config table (singleton row): `id`, `inr_per_credit` (NUMERIC), `updated_by`, `updated_at`.
- DR-12: New `tenant_credit_rate` table: `tenant_id` (UNIQUE, NOT NULL), `inr_per_credit` (NUMERIC, NULL = inherit platform rate), `updated_by`, `updated_at`.
- DR-13: New `application_credit_balance` table, mirroring `tenant_credit_balance` at Application grain: `application_id` (UNIQUE, NOT NULL), `balance`, `total_received`, `total_spent`.
- DR-14: New `application_credit_requests` table, mirroring `credit_requests` at Application grain, plus payment columns: `application_id`, `tenant_id`, `requested_by`, `requested_amount`, `rate_applied`, `total_payable`, `status` (`pending_payment`/`approved`/`rejected`), `gateway_order_id`, `paid_at`, `processed_by`, `processed_at`, `rejection_reason`.
- DR-15: New `application_credit_transactions` table, mirroring `credit_transactions` at Application grain (`CREDIT`/`DEBIT`/`REFUND`, `balance_before`/`balance_after`, `reference_id`/`reference_type`).
- DR-16: Existing `credit_requests` (Tenant ⇄ Super Admin) gains `rate_applied`, `total_payable`, `gateway_order_id`, `paid_at` columns — approval becomes conditional on confirmed payment rather than a standalone manual action.
- DR-17: Coupon-batch credit debit moves from `tenant_credit_balance` to `application_credit_balance` — every coupon-batch-creation code path must be updated to debit the Application's own balance, not its Tenant's.
- DR-18: New `customer_addresses` table: `id`, `application_id`, `customer_user_id` (FK to `users`, role `CUSTOMER`), `label`, `recipient_name`, `phone`, `line1`, `line2`, `city`, `state`, `pincode`, `country`, `is_default`, `created_at`, `updated_at`.
- DR-19: `ecommerce_orders` gains payment + invoice columns: `payment_status` (`pending`/`paid`/`failed`/`cod`), `payment_method`, `gateway_order_id`, `gateway_payment_id`, `paid_at`, `invoice_url`.
- DR-20: New `application_payment_accounts` table: `application_id` (UNIQUE), `gateway` (e.g. `razorpay_route`), `linked_account_id`, `onboarding_status` (`pending`/`verified`/`rejected`), `payouts_enabled`, `created_at`, `updated_at` — the KYC/sub-account record gating FR-40.
- DR-21: `user_upi_details` is rescoped to `application_id` instead of `tenant_id`, aligning it with how `CUSTOMER` users are already scoped (resolves an existing schema inconsistency found during this review: consumers are scoped by `verification_app_id` everywhere else, but this table currently keys on `tenant_id`).
- DR-22: `scans` and `cashback_transactions` gain a `scan_channel` column (`guest_web` / `mobile_app`).
- DR-23: New `application_mobile_apps` table: `id`, `application_id`, `platform` (`ios`/`android`), `bundle_id`, `app_store_listing_url`, `branding_config` (JSONB: name, colours, icon/splash asset refs), `build_status` (`not_built`/`building`/`built`/`failed`), `last_built_at`, `version`, `created_at`, `updated_at`.

---

## 8. Non-Functional Requirements

- NFR-1 (Authorization boundary as architecture, not UI): The FR-5/FR-10 data boundary must be enforced in the authorization middleware layer — any code path that would let a Super Admin or Tenant Admin session query an Application-grain table is a P0 security bug, not a feature gap. This should be covered by an automated check (e.g. a CI lint/test asserting which roles may reach which table-backed endpoints).
- NFR-2 (Session scope): `scope = min(role, host) AND identity = registered owner` for any Application-scoped route — enforced server-side on every request, not only in client-side routing/menus.
- NFR-3 (Credit metering correctness): Every coupon/scan-generating action debits credits, with no bypass path. **Correction (verified against the real codebase during LLD design):** the existing batch-coupon path already debits correctly and atomically today, with proper insufficient-balance rejection — there is no "charges 0" defect. The actual work this NFR requires is redirecting that debit's *source* from `tenant_credit_balance` to `application_credit_balance` (DR-17), not fixing a metering bug.
- NFR-4 (Coupon code entropy): Generated codes must be non-enumerable/random, not sequential. **Correction (verified against the real codebase):** the existing code generator already produces CSPRNG non-enumerable codes — there is no sequential-code defect to fix. This NFR exists to guard against regressing that property, not to correct it.
- NFR-5 (Domain lifecycle): TLS auto-issue/auto-renew with alerting on failure; DNS drift detection; reserved-namespace blocklist for Tenant slugs and `custom_domains` hostnames; Application soft-delete deactivates its domains with a branded 410, not a bare error.
- NFR-6 (Multi-tenancy isolation): Composite FKs / `UNIQUE(id, tenant_id)` constraints prevent an Application under one Tenant from ever referencing data belonging to another Tenant.
- NFR-7 (Payment gateway integration): All four payment surfaces (Tenant→Super Admin subscription, Tenant→Super Admin credit purchase, Application→Tenant subscription, Application→Tenant credit purchase) use the same integration pattern: create a gateway Order/Payment Link, redirect/embed checkout, verify the payment via a **signed webhook** (never trust a client-side "payment done" callback alone), and only flip the corresponding row to active/approved once the webhook signature is verified. This extends the existing Razorpay integration (`paymentGateway.service.js`, currently payout-only) to also cover inbound Orders/Payment Links.
- NFR-8 (Idempotent webhook handling): Webhook handlers must be idempotent — a retried webhook for the same `gateway_order_id` must never double-credit a balance or double-extend a subscription period.
- NFR-9 (Stuck-payment reconciliation): A scheduled job reconciles any `pending_payment` row older than a configurable threshold against the gateway's own order-status API, catching missed webhooks rather than leaving a Tenant/Application stuck in limbo indefinitely.
- NFR-10 (No stored card data): All payment collection happens on the gateway's own hosted checkout; the platform never stores card or bank credentials — only gateway references (`order_id`, `payment_id`).
- NFR-11 (Payment sub-account gating): An Application's checkout must never accept a live payment before its `application_payment_accounts` record reaches `verified`/`payouts_enabled` — enforced server-side, not just hidden in the checkout UI.
- NFR-12 (Mobile app release overhead is real, ongoing cost): Because FR-48 commits to fully separate compiled apps per Application, every shared-codebase update requires a rebuild-and-resubmit cycle per Application, indefinitely. Track this as ongoing release-management workload in planning, not a one-time build.
- NFR-13 (OTP abuse protection): Rate-limiting and abuse protection (per phone number, per Application, per IP) apply uniformly to the unified OTP flow (FR-34/FR-35), since it is now the single front door to creating a Consumer account across both ecommerce checkout and scan-and-earn guest scan.

---

## 9. Out of Scope / Explicitly Removed

- Dealer role, dealer scanning, dealer points/payouts — removed from the product entirely.
- Any Super Admin or Tenant Admin screen, export, or API response containing order/inventory/scan/cashback data, in any aggregated form.
- Multi-seat access to a single Application (shared logins, manager/viewer split) — one owner account per Application.
- Recurring auto-charge billing (auto-debiting a saved card/UPI mandate) — v1 is fixed-term, pay-to-renew only.
- Refunds, chargebacks, partial-period proration, and payment dispute handling.
- Overage billing when a Tenant exceeds its plan's Application ceiling — creation is blocked, never auto-charged.
- Product reviews/ratings — not covered in this version.
- Consumer-facing push/SMS/email notifications beyond the OTP itself and the existing webhook-to-Application-Owner events — not covered in this version.
- Over-the-air updates (e.g. CodePush-style) for the white-labeled mobile apps — every release goes through the normal app-store review cycle; OTA is a possible future optimization, not in scope now.

---

## 10. Resolved Decisions

- **RD-1 (owner delegation):** Strictly one login per Application, permanently. No delegation, no sub-users, no future multi-seat path. `applications.owner_user_id` is a single, non-shareable account for the life of the Application.
- **RD-2 (invite expiry):** An owner-invite expires after a fixed window of **14 days** if not accepted. On expiry, the Application reverts to an unowned/inert state (no scans, no orders, no API calls possible) and frees up the Tenant's provisioning slot/credits. The Tenant Admin can re-send a fresh invite or cancel the Application outright.
- **RD-3 (no support/impersonation, ever):** Super Admin and Tenant Admin have **no impersonation path** into any Application's operational dashboard, under any circumstance — not even with owner consent. If an Application Owner needs support, they must describe the issue or screen-share; the platform itself never grants a path for anyone but the registered owner to view or act on operational data. This closes NFR-1/NFR-2 with no exception clause.
- **RD-4 (plan pricing formula):** Plan price is a flat monthly tier fee; total payable = plan price × duration chosen, independent of how many Applications the Tenant actually uses (up to the plan's ceiling). Not scaled by app count.
- **RD-5 (credit pricing):** Super Admin sets one platform-wide INR-per-credit rate for Tenant purchases; a Tenant may optionally set its own resale rate for its own Applications, defaulting to the platform rate if unset.
- **RD-6 (deactivation scope):** An unpaid/expired Application's paywall blocks everything — owner dashboard, public storefront/API, and the scan landing page — not just the dashboard.
- **RD-7 (payment collection):** Real online gateway checkout (extending the existing Razorpay integration to Orders/Payment Links, currently payout-only) with automatic activation on a verified webhook — no manual "mark as paid" step for any of the four payment surfaces.
- **RD-8 (assumption, flagged for confirmation):** A Tenant-level plan lapse does not cascade to suspend already-active Applications under that Tenant — see FR-33 for rationale. Revisit if this isn't the desired behavior.
- **RD-9 (checkout payment collection):** Scan4Earn collects the shopper's payment via a per-Application gateway sub-account, settling directly to the Application Owner's own account — never through Scan4Earn's or the Tenant's own funds.
- **RD-10 (mobile app model):** Each Application gets a fully separate, independently compiled and published mobile app under its own app-store developer account — not a single shared, runtime-reskinned app. Accepted with the understanding that this carries ongoing per-Application release overhead (NFR-12).
- **RD-11 (guest scan UPI):** Always re-entered fresh at every guest/web scan; never read from or written to a stored profile — the mobile-app channel is the only path where UPI is remembered.
- **RD-12 (ecommerce checkout identity):** No anonymous orders — phone+OTP is required at checkout and doubles as implicit account creation/login; the same account surfaces order history and invoices on a later login.
- **RD-13 (unified consumer identity across channels):** A Consumer's account is the same regardless of whether it was first created via ecommerce checkout, guest scan, or mobile-app registration — always scoped by `(application_id, phone)` — history unifies across channels within one Application.

---

## 11. References

- `product-plan/ideal-application-flow.html` — full interactive product blueprint (roles, routing, worked examples, lifecycle flows, dashboards, data model, production rulebook).
- `scan4earn-database/full_setup.sql`, `scan4earn-database/seeds/001_seed_data.sql` — current schema and seed data (pre-dates this model; migration required for DR-4/DR-5/DR-6).