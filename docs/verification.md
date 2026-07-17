# Verification log

## Foundation integration, 16 July 2026

The initial migration was applied to an isolated PostgreSQL cluster on port 5433 with UTF-8 encoding. Seed was executed twice to confirm idempotency.

Verified through the running NestJS API:

- health response is `ok`;
- the development operator resolves 19 permissions;
- organization role creation;
- invitation creation and acceptance;
- membership and role assignment;
- typed attribute definition;
- category and `CategoryAttributeRule` creation;
- product and variant creation;
- `NUMBER_WITH_UNIT` storage in typed columns;
- organization creation with multiple capabilities;
- missing actor context returns HTTP 401;
- cross-organization invitation returns HTTP 403;
- each tested write created matching audit and outbox records.

Observed final smoke values: 2 organizations, 1 product, 1 variant, 2 memberships, 10 audit records and 10 outbox records before the final UI verification.

## Approval, audit and concurrency integration, 16 July 2026

The seed now resolves 21 permissions, including `approval.manage` and `audit.view`. The live API was used to verify:

- product and ApprovalPolicy creation;
- deterministic evaluation of an active KZT amount policy;
- tenant-scoped audit filtering;
- cross-organization ApprovalPolicy access returns HTTP 403;
- two simultaneous product updates using version 1 yield exactly one HTTP 200/version 2 and one HTTP 409;
- two simultaneous ApprovalPolicy updates using version 1 yield exactly one HTTP 200/version 2 and one HTTP 409;
- only successful conditional updates create audit/outbox records.

Observed values after the concurrency smoke: 2 organizations, 2 products, 1 variant, 1 approval policy, 14 audit records, 14 outbox records and 21 permissions.

## Static verification

- Prisma schema validation passed.
- TypeScript typecheck passed for all workspace packages.
- 32 unit/schema tests passed.
- NestJS production build passed.
- Next.js production build passed.
- Admin loading, API error and populated-data states were inspected in Chrome.
- Product, variant, ApprovalPolicy evaluator and audit forms were inspected and the evaluator was exercised in the browser against the live API.

## Supplier data integration, 16 July 2026

A clean `marketplace_verify` database was created from both migrations and seeded twice. The FTS index plus nullable-offer-identity and one-active-price indexes were confirmed in PostgreSQL.

Verified through the live API:

- CSV raw-row persistence, mapping and processing with one accepted and one controlled error row;
- exact GTIN/SKU matching creates one candidate and manual confirmation updates the source item;
- two concurrent creates for the same supplier/variant yield one HTTP 201 and one HTTP 409;
- offer price update creates one active price and one append-only history row;
- publication is accepted only after active price and fresh available inventory exist;
- inventory lot creation preserves expiration and FEFO ordering;
- two concurrent reservations of 7 units against 10 available yield one HTTP 201 and one HTTP 409;
- replaying the winning idempotency key returns the same reservation without another decrement;
- an on-hand sync below the 7 reserved units returns HTTP 409;
- final balance and lot both report 3 available and 7 reserved;
- nine successful writes produced nine audit records and nine outbox records.

The supplier operations UI was inspected in the browser with populated import, offer, publication, balance, lot and reservation states.

`pnpm audit --prod` initially identified patched transitive releases for PostCSS and `uuid`; workspace overrides were applied in `pnpm-workspace.yaml`. The repeated production audit reports no known vulnerabilities, and API tests plus the Next.js production build still pass with the overrides.

## Supplier controls integration, 16 July 2026

A new `marketplace_final` database was built from all three migrations and seeded twice. FTS plus the unique indexes for nullable offer identity, one active base price, one active contract rule and one active recall were present.

- an unmatched import item automatically created a pending ProductCandidate;
- approval atomically created a classified Product and ProductVariant and linked the original supplier item;
- a quantity tier resolved to `TIER`, a buyer contract resolved to `CONTRACT`, and quantity below the tier resolved to `BASE`;
- an overlapping tier range returned HTTP 409;
- the seeded operator resolves 32 permissions;
- manual and scheduled freshness logic marked an old balance `STALE`, changed publication from `PUBLISHED` to `PAUSED`, and removed marketplace visibility;
- critical lot recall captured one affected reservation, set lot availability to zero, and rejected a duplicate active recall;
- resolving the recall left the lot in `UNDER_REVIEW` without restoring inventory;
- moderation, pricing, freshness and recall history were inspected in the admin decision-plane UI, and the pricing action was exercised in the browser.

## Commerce skeleton integration, 16 July 2026

A clean `marketplace_1c_clean` database was created from all five migrations and seeded twice. The seed produced 33 permissions, two published supplier offers with fresh FEFO lots, one demo buyer and the active `MOCK` payment provider. The PostgreSQL FTS index remained present together with the one-active-cart and ledger idempotency indexes.

Verified through the live API and PostgreSQL:

- two offers from different suppliers produced one completed checkout and exactly two supplier orders;
- both warehouse balances and FEFO lots received linked active reservations;
- one order was confirmed fully and one from quantity 2 to quantity 1;
- partial confirmation reduced its reservation from 2 to 1 and returned the difference to inventory;
- payable total changed from 968000 to 723000 minor KZT after supplier decisions;
- allocations preserved `gross = platform fee + supplier net` for both suppliers;
- two parallel mock capture requests returned success while creating exactly one `PaymentAttempt`;
- payment intent and both supplier orders ended in `CAPTURED` / `PAID`;
- capture changed both reservations to `CONSUMED`, reduced on-hand by the accepted quantities and left reserved at zero;
- four ledger entries summed to the captured total of 723000;
- rerunning seed after capture preserved the consumed inventory quantities instead of resetting balances;
- a direct PostgreSQL `UPDATE` of a ledger entry was rejected by the immutability trigger.

The production admin build was exercised in the in-app browser from empty cart through two-offer checkout, partial/full confirmation, payment intent and mock capture. The final UI displayed both allocations and four ledger rows; browser diagnostics reported no errors.

Static verification after 1C: 39 API/schema tests passed, API and admin typechecks passed, and both NestJS and Next.js production builds completed successfully.

## Provider-independent integrations, 16 July 2026

A new `marketplace_2a_verify_20260716` database was created from all six migrations. Both migration deploy and two consecutive seed runs succeeded. The integration migration retained the existing FTS objects and added scope checks, partial uniqueness and queue indexes.

Verified through the production NestJS build and live HTTP API:

- Mock connection creation creates an encrypted provider connection and initial durable test job;
- catalog sync persisted the external raw item;
- external variant and warehouse IDs were mapped through the public integration API;
- global price and inventory bindings protected existing `MANUAL` values and created reconciliation entries;
- higher-priority scoped bindings with explicit `allowOverwriteManual` projected one API price and one API inventory balance;
- projected inventory preserved local reservation and lot invariants while using the lower of external available and locally safe available;
- the successful retry automatically changed both previous mismatches to `RESOLVED`;
- checkout created a synchronous external Mock reservation with status `ACTIVE` before returning success;
- supplier confirmation and payment capture required the external reservation to remain active;
- capture changed payment to `CAPTURED` and the external reservation to `CONSUMED` atomically;
- the payment outbox created an idempotent `ORDER_EXPORT`, which completed as `SUCCEEDED`;
- connection read DTO contained bindings and mappings but did not expose encrypted credentials or token hashes.

Adapter verification covers the official МойСклад API base and Bearer header, retry-after handling for 429, product/modification pagination, sale-price type selection, and flattening warehouse stock with reserve. 1С Agent enrollment, heartbeat, pull claim and completion plus signed/deduplicated webhooks were verified in the preceding integration smoke.

Static verification after 2A: 53 API/schema tests passed before the final workspace run; API, schemas and admin typechecks passed; NestJS and Next.js production builds completed successfully.

## Marketplace completion and hardening, 17 July 2026

- A separate clean `marketplace_final_verify_20260717` database was created; all 13 migrations applied from zero and Prisma reported the schema up to date.
- Seed ran twice without duplicates and produced 5 suppliers, 4 cities, 5 product cards and 10 offers with packaging, lots, delivery and merchant accounts.
- The final production build completed for the NestJS API and all three Next.js applications. Each web application was also started with `next start` from its production build.
- PostgreSQL FTS search returned three glove suppliers across three cities; comparison preserved 100-piece package normalization and sorted prices; checkout split four fresh offers into four supplier orders.
- Freshness policies and a manual inventory override were created, read and cancelled through the API. An expired 15-minute ERP price was correctly rejected and the deterministic checkout test now uses a non-expired import offer.
- Document verification generated and downloaded a real PDF with checksum, completed a mock signature, created version 2 and preserved version 1 as `SUPERSEDED`.
- A supplier credential was verified, a compliance rule evaluated to `PASSED`, three offers were rechecked and three relevant notifications reached `SENT`.
- Redis/BullMQ connected and processed integration, notification and search jobs; queue state confirmed completed jobs.
- Security verification confirmed Helmet headers, `x-request-id`, rate-limit headers, TOTP enrollment, one-use recovery challenge and factor disable. JWT tests verify signed tenant context, stripped spoofed headers and mandatory MFA rejection.
- Standard Vitest execution passes 48 API tests and 30 shared-schema tests. The opt-in PostgreSQL Testcontainers run passes all 49 API tests, including the real scarce-stock concurrency race.
- Native PostgreSQL `BigInt` attribute values are globally serialized as exact decimal strings; direct catalog verification returned all five products without precision loss or HTTP 500.
- Playwright 1.61.1 with Chromium passed all three production E2E scenarios: buyer search/comparison, supplier organization switching/offers and operator assurance controls. The suite waits for network idle and rejects page errors, console errors and every HTTP 5xx response; the final API log contained 213 completed requests and no server error.
- TypeScript checks pass in all eight workspace packages. The production dependency audit reports no known vulnerabilities.
- Docker Compose configuration, Docker daemon connectivity and backup/restore shell syntax validate successfully. The Testcontainers startup timeout is 180 seconds for cold CI image pulls.

## Commercial readiness and EDS agreement, 17 July 2026

- The primary technical plan was updated to v2 and visually rendered as 16 pages. Section 11 defines the marketplace supplier agreement, two-party EDS flow, annual term, renewal, non-renewal and AC-AGR-01..06. The original document is retained as `Dental_Marketplace_Technical_Plan_original.docx`.
- The earlier `marketplace_cert_20260717` checkpoint applied 15 migrations; it has been superseded by the 18-migration certification below.
- Live API verification returned the seeded agreement as `ACTIVE`, both party signatures verified, end date one year after activation and `signing.available=false`. A second initiation returned HTTP 409.
- Commercial gates require an active EDS agreement for offer publication, marketplace visibility and supplier confirmation; refunds, returns and payouts remain available for obligations created under an earlier agreement.
- EDS callback unit tests cover exact raw-body HMAC, stale timestamps, modified payloads and event IDs. The service also enforces replay IDs, immutable checksum, signer BIN and certificate validity.
- Upload tests reject executable/NUL payloads and a generic ZIP renamed as DOCX/XLSX; only the matching OOXML package family can enter quarantine.
- Three dirty Excel structures pass parser verification: supplier title before headers, metadata preamble and offset columns.
- API test result: 63 passed, 1 optional Testcontainers test skipped in the standard run. Shared schemas add 30 passing tests. Typecheck succeeded for every workspace package.
- Playwright passed 6/6 production scenarios: buyer search/comparison; supplier switch/offers; active EDS agreement with no repeat sign action; buyer budgets/support/AI; public landing audience routes; operator assurance.
- `verify:search-commerce`, `verify:document-compliance`, `verify:security` and `docker compose config --quiet` all pass. Readiness reports PostgreSQL and local storage healthy with the intentionally disabled local queue marked `skipped`.
- The final production build succeeds for the API, admin, buyer, supplier and public landing applications.

## Trust, Geo and AI supplement, 17 July 2026

- The earlier trust checkpoint applied 16 migrations; it has been superseded by the 18-migration certification below.
- Migration 16 added product-gap incidents and appeals, private order comments, verified reviews and revisions, trust metric events and snapshots, rating appeals, geo evidence/versioning, delivery performance and persisted recommendation decisions.
- Prisma validation/generation and workspace typechecks passed. Standard tests pass 69 API tests with 1 opt-in Testcontainers test skipped, plus 30 shared-schema tests.
- The live `verify:trust-geo` scenario returned a calculated supplier score of 86.857 with 9 explainable indicators. An unknown supplier returned `INSUFFICIENT_DATA` with no artificial low score.
- Smart commerce returned 3 scenarios for the verified Pavlodar address. Assertions confirmed that organic order is preserved, promotion cannot override critical risk, an unverified warehouse receives no local priority and the full organic result remains visible.
- Changing the buyer address reset geo status to `PENDING`; the next recommendation exposed it as unverified; an operator decision with evidence restored `VERIFIED`.
- The scenario created a product-gap incident idempotently, exposed it only to the impacted tenant/operator, accepted an appeal and restored comparison after an upheld decision without deleting history.
- A real cart and checkout created a supplier order. Only after the order reached `DELIVERED` could the buyer create one verified review. Duplicate review creation returned HTTP 409; the supplier response, review appeal and private participant-only order comment all passed.
- A supplier rating appeal moved the snapshot under review. The operator decision preserved the confirmed event and recomputation restored `CALCULATED`.
- AI safety returned explicit refusals for medical treatment advice and for autonomous price/order actions. Trust/geo/commerce context is exposed only through allowlisted tenant-aware read tools.
- Playwright passed 8/8 production scenarios in 9.1 seconds. The added checks cover Buyer Smart Commerce and Supplier Trust/Geo while retaining search, EDS, owner workspaces, landing and operator assurance coverage.
- Visual QA confirmed no horizontal overflow in the desktop Buyer, Supplier or Admin views and at the 390px Buyer breakpoint. Buyer displayed a verified Pavlodar address and a real recommendation; Supplier displayed 86.9/100 with 9 events and a verified warehouse; Admin displayed 2 open incidents, 1 appeal, 5/5 verified warehouses and 5/5 calculated ratings with no console errors.

## Registration, onboarding and connector readiness, 17 July 2026

- Clean database `marketplace_certification` applied all 18 migrations from zero. Two consecutive real `tsx prisma/seed.ts` runs were idempotent and resulted in 7 organizations, 84 permissions, 5 active annual agreements and 10 offers.
- Shared schemas pass 33 tests; API passes 69 tests with one opt-in Testcontainers test skipped in the standard run.
- Browser QA completed a Cyrillic supplier registration, required legal consents, development identity verification and handoff. The fragment was removed from the URL; tab-scoped session recovery prevents reload from falling back to demo tenants.
- A new supplier progressed through real profile, warehouse and data-source APIs. The progress changed from 1/7 to 4/7 without seeded business data. Compliance now uploads an actual PDF/JPEG/PNG payload.
- The 9-step connector wizard reports authority, source, diagnostics, mappings, test data, quality, publication, control order and go-live from persisted evidence. It does not mark server-only 1С or credential-less МойСклад as live.
- Operator Connector Readiness Registry contains Manual, Excel/CSV, МойСклад, 1С and Custom API. Current honest summary is 5 channels, 1 internally ready, 3 external dependencies and 0 `LIVE_VERIFIED`.
- `verify:onboarding-agreement`, `verify:trust-geo`, `verify:document-compliance`, `verify:search-commerce` and `verify:security` all pass against the live production build. Agreement verification confirms both EDS signatures, exactly one-year term and unavailable repeat-sign window.

## Production hardening certification, 17 July 2026

- Production configuration now fails closed for development auth, localhost/non-HTTPS CORS, missing MFA, Redis, independent encryption keys, encrypted S3, antivirus, qualified EDS gateway, external PSP, transactional email, signed notifications, Sentry and OTLP.
- Admin no longer sends development identity headers outside localhost. Corporate Google/Apple OIDC is followed by TOTP enrollment/challenge, tenant-bound JWT elevation and a `MARKETPLACE_OPERATOR` capability check.
- A two-stage MFA regression was fixed: the primary token is accepted only on `/api/identity/mfa`; successful TOTP returns a new session token containing the MFA authentication method. Protected endpoints continue to reject the primary token.
- External PSP calls use bearer credentials, provider routing and idempotency headers. Transactional notification channels and EDS fail closed in production; deterministic adapters remain available only in development/test.
- GitHub CI runs all five business verification scripts plus production-contract validation. Separate security and immutable tagged-image workflows add CodeQL, dependency audit and GHCR release images.
- `compose.production.yaml` uses external managed dependencies, automatic TLS, security headers, read-only containers, dropped Linux capabilities, no-new-privileges and resource limits. Checksummed production backup/restore, explicit destructive confirmation, rollback and first-deployment runbooks are present.
- A clean native PostgreSQL database applied all 18 migrations and accepted two consecutive seed runs. This was used because the installed Docker Desktop 4.38 cannot start on the current Mac and reports `Incompatible CPU`; the inaccessible Docker volume was not modified.
- Release gate passed across all 9 workspace packages. The standard suite now passes 73 API tests (including production EDS fail-closed coverage), 33 schema tests and skips only the opt-in Testcontainers race test.
- Browser automation covers 9 scenarios, including real supplier registration, mandatory legal consent, development identity completion, URL-fragment removal and organization-name handoff. The complete EDS lifecycle still confirms two signatures, annual term and a closed repeat-sign window.
