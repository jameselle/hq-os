# Private brand kits

Design & Brand reads `HQ_DATA/businesses/<slug>/brand/kit.json`. Email & Lifecycle (`/email?tab=previews`) exposes the same email previews. No business brand data belongs in the framework repository.

Email & Lifecycle owns Overview, Workflows, Email Previews, Delivery, Accounts and Tools & Skills. The former `/lifecycle` route redirects to `/email`, preserving preview links. Design & Brand remains the source for reusable identity assets. No delivery behavior changes when navigating between tabs.

Design & Brand has Overview, Brand Guidelines, Asset Library, Reviews & Handoff and Tools & Skills. Its asset library contains images, vectors and tokens, not HTML emails. HTML template downloads and previews belong exclusively to Email & Lifecycle. Reviews are expandable and downloadable; the department's original tools and plans remain under Tools & Skills.

The version-1 schema is defined and validated in `lib/brand.ts`. A kit contains a status, updatedAt, Markdown guide, colour roles, allowlisted asset filenames and email previews. Each email records its subject, sender description, trigger, status, source provenance, plain text and optional HTML. Use synthetic personal links only. Do not include credentials, customer data or signing tokens.

Download assets must be explicitly listed in the kit. Only simple basenames with allowed extensions are served; symlinks outside the brand directory are refused. The selected business comes from the existing business selector, never a download query argument. Only PNG previews are served inline. Other downloads are attachments.

HTML email previews use a sandboxed iframe with a restrictive CSP: no scripts, external images, forms or remote fonts. A preview never calls a send endpoint. Browser rendering is not a substitute for Outlook/Gmail client testing.

Keep current-source templates distinct from design proposals. Include the source hash and capture date; do not label a local snapshot as deployed verification. Rebuild private catalogs after sending-source changes. An unconfigured business gets an empty state, never another business's assets.

Verification: `node --import tsx --test tests/brand.test.ts`, `npm run build`, then restart the local service and reload existing tabs. Verify `/design` and `/lifecycle`, each preview selection, mobile/desktop modes, and asset downloads. Restart after rebuilding to avoid stale chunk references.

Browser regression: install Chromium with `npx playwright install chromium`, then run `npm run test:e2e`. The suite starts an isolated server on port 3169 using disposable synthetic businesses. It checks both viewport sizes, department tabs, legacy redirects, business switching, preview sandboxing and asset download isolation. It never connects real lifecycle adapters. Screenshots/traces remain ignored by Git. Do not run while another build is writing `.next`; restart the normal local service after a build.

Release gates: approve each private brand direction, verify that HTML and plain text express the same message, then test delivery in actual Gmail and Outlook clients. Embedded data-URI logos are suitable for local previews only: production mail needs validated hosted images or CID attachments. Confirm message classification, preference links and suppression behavior before enabling sends. Browser screenshots do not establish inbox compatibility.
