# Quickstart: Stabilize Plotify MVP

This quickstart validates the planned MVP without implementing code in this
step. Commands are verified from the root `package.json` and README.

## 1. Install and Prepare

```bash
pnpm install
```

Backend environment:

```bash
cd apps/api
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ../..
```

## 2. Run Local Services

Start the web app, API, and worker in separate terminals:

```bash
pnpm dev:web
pnpm dev:api
pnpm dev:worker
```

Supabase and Redis must match the local environment documented in
`plotify_memori/40 - Guias & Convenciones/Setup Local.md` and `README.md`.

## 3. Validate P1 User Flow Manually

### Project readiness

1. Login as organization admin.
2. Create or open a project.
3. Upload a valid KMZ/KML.
4. Confirm lots render on the map.
5. Verify or correct lot area/boundaries.
6. Assign at least one vendor to the project.

Expected result:

- Project can be considered operational for reservation and documents.
- Vendor can see only assigned project/lots.

### Reservation approval

1. Login as assigned vendor.
2. Open an available lot.
3. Submit reservation request with buyer data.
4. Login as admin or monitor admin session.
5. Confirm the approval is visible in Telegram and web notifications.
6. Approve from Telegram or web.
7. Attempt the opposite channel afterward.

Expected result:

- First decision wins.
- Lot becomes reserved.
- Second decision reports already processed or equivalent.
- History/audit shows request and resolution.

### Reservation document

1. Ensure the project has an active reservation template.
2. Open document generation for the reserved lot.
3. Review available and missing variables.
4. Complete missing variables or explicitly accept blanks.
5. Generate PDF and DOCX.
6. Open document history for the lot/project.

Expected result:

- PDF and DOCX are generated.
- Each generated document has version, snapshot, template, lot, format, and
  generated-by metadata.
- Regeneration creates a new version.

## 4. Validate P2 User Flow Manually

### Sale

1. Start from a reserved lot.
2. Request sale.
3. Approve from Telegram or web.

Expected result:

- Lot becomes sold only after admin approval.
- Rejection preserves prior state.
- History/audit shows sale request and resolution.

### Escritura

1. Upload legal project documents:
   - Dominio vigente
   - Certificado de roles
   - Certificado de subdivision/SAG
   - Plano oficial
2. Review structured legal variables.
3. Complete missing values manually where extraction is not available.
4. Generate escritura PDF/DOCX.

Expected result:

- Variables show source: project, lot, buyer, geometry, organization, or reviewed
  legal document data.
- Generated escritura has version and immutable snapshot.

## 5. Verification Commands

Run after implementation tasks that touch relevant areas:

```bash
pnpm verify:migrations
pnpm contracts:generate
pnpm typecheck:web
pnpm test:web
pnpm build:web
pnpm test:api
```

## 6. Pilot Measurement Fixture

Use this fixture path before marking the foundation ready for user-story work:

1. Create one pilot organization with one admin and one assigned vendor.
2. Import or seed one project with at least 20 lots from a representative
   KMZ/KML file.
3. Confirm each lot has geometry-derived:
   - north/south/east/west boundary groups
   - square meters and hectares
   - perimeter
   - generated legal deslinde text input
4. Assign the vendor to the project.
5. Time the reservation path on one available lot:
   - vendor opens lot and submits buyer/reservation data
   - target: under 5 minutes from lot selection to submitted request
6. Time the admin visibility path:
   - admin sees the pending approval in web or Telegram
   - target: under 2 minutes from submission to visible decision surface
7. Generate a reservation document for one approved reservation and verify
   version, template, lot, generated-by, snapshot, selected recipients, and
   delivery status metadata remain attached to the generated row.

## 7. Stop Criteria

P1 is complete when:

- KMZ/KML project validation works.
- Vendor reservation request works.
- Admin approval works from Telegram and web.
- Reservation PDF/DOCX generation works with missing-variable policy.
- History/audit and tenant validation tests pass.

P2 is complete when:

- Sale approval mirrors reservation approval.
- Escritura variables are sourced from project/lots/buyer/geometry/legal docs.
- Escritura PDF/DOCX generation is versioned and traceable.

## 8. Responsive Layout Manual Checks (P3)

Verify usability of the P1 flows on both mobile (e.g. 360px - 480px width) and desktop screen sizes:

### Lot Reservation Form

1. Open the Reservation/Sale modal on a mobile device or responsive simulator.
2. Verify all inputs (Nombre, RUT, Dirección, etc.) and submit buttons stretch to full width and display without overlaps.
3. Validate that validation error messages render cleanly under their respective fields.
4. Ensure the entire form is scrollable within viewports using `overflow-y-auto` wrapping.

### Admin Approvals Panel

1. Access the admin dashboard approvals panel on mobile width.
2. Confirm the card items stack vertically into a clean layout.
3. Confirm the decision buttons (Rechazar and Aprobar) expand to equal side-by-side widths on mobile and align inline nicely on desktop.
4. Ensure no text truncates or overlaps, and all primary client/vendor metadata remains readable.

### Document Generation Wizard

1. Open the document generation flow.
2. In Step 1, verify that templates render as responsive cards stacking from 1 column on mobile to 2 columns on tablet/desktop.
3. In Step 2, confirm variables sections open/collapse smoothly, and form fields wrap elegantly using `grid-cols-1 sm:grid-cols-2`.
4. In Step 3, confirm the HTML preview scales correctly to screen width without causing horizontal body scrolling.
