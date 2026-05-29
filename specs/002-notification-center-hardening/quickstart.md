# Quickstart: Notification Center Hardening

## Goal

Validate that admins and vendors can operate reservation/sale approval
notifications from the web header and Telegram without cross-role leakage.

## Fixture Setup

1. Use two organizations.
2. Create one admin and one vendor in the primary organization.
3. Link Telegram for both admin and vendor.
4. Assign the vendor to a project with at least two available lots.
5. Keep a second organization with another admin/vendor to test isolation.

## Web Header Checks

1. Sign in as the primary organization vendor.
2. Submit a reservation request for an assigned available lot.
3. Confirm the vendor header notification list shows the request as pending.
4. Sign in as the primary organization admin.
5. Confirm the admin header notification icon shows a pending count.
6. Open the notification list and confirm the reservation shows project, lot,
   client, vendor, request type, age, and approve/reject actions.
7. Approve the request from the header notification list.
8. Confirm the admin pending count updates.
9. Return as vendor and confirm the request is visible as approved.
10. Repeat with a sale request and reject it.
11. Confirm the vendor sees the rejected sale outcome without decision actions.

## Race And Idempotency Checks

1. Create a pending approval.
2. Open the web notification list as admin.
3. Decide the same request from Telegram first.
4. Attempt the opposite decision from the web notification list.
5. Confirm the system reports already processed and the lot changes only once.

## Telegram Command Checks

1. As linked admin, send `/pendientes`.
2. Confirm only pending approvals for the admin's organization are listed.
3. As linked vendor, send `/pendientes`.
4. Confirm only that vendor's pending requests are listed and no admin actions
   are shown.
5. Decide one vendor request as admin.
6. As vendor, send `/aprobadas` or `/rechazadas`.
7. Confirm the decided request appears in the correct list.
8. Send `/docs` as vendor.
9. Confirm the response links only to approved vendor-facing documentation.

## Tenant And Security Checks

1. Use the second organization's Telegram user to query the first
   organization's bot context.
2. Confirm no protected approval data is returned.
3. Attempt a Telegram approval callback from a linked non-admin user.
4. Confirm the approval is not mutated and an auditable unauthorized attempt is
   recorded.
5. Simulate an invalid Telegram webhook authenticity check.
6. Confirm the request is rejected or ignored without processing commands.

## Verification Commands

Run the relevant commands after implementation tasks:

```bash
pnpm verify:migrations
pnpm contracts:generate
pnpm typecheck:web
pnpm test:web
pnpm build:web
pnpm test:api
```
