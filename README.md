# Verity — interactive design prototype

English interface for MumMumMumWeh's SI / BL document review workflow. The design follows the supplied white, coral-red and pale-pink Verity references and the Chinese AI / technical reference manual.

## Scope

This is a **preset frontend prototype**, not a live extraction or evaluation system. It contains 23 example records and the complete navigation and contextual review flows. There is no live mailbox, OCR service, model request, automatic sending or competition scoring. Sample source documents are generated fixtures and labelled as such.

## Run

Serve `dist` with any static web server, for example `python -m http.server 5178 --directory dist`, then open `http://localhost:5178`. The site also opens directly from `dist/index.html` for offline UI review (the optional Google font may fall back to Arial).

Routes are hash based. Start at `#inbox`; use `#screens` to find every page and issue state. Review decisions are saved only in this browser's local storage. Reset examples restores the fixtures. Imported files are inspected and staged locally; they are not uploaded or processed.

## Main pages

- To do: action-first queue with search and a direct action per case.
- All records: status filters and every email, including classification-only records.
- Import: local file staging, basic JSON record checks, invalid-file feedback and sample batch.
- Processing: labelled simulated stages; exceptions remain separate.
- Document pairing: explicit SI and BL choices, blocked booking mismatch, multi-shipment escalation.
- Field review: one issue at a time, relevant source excerpts, one primary action, and collapsed matched fields. Full-source review is shown when the location is unavailable.
- Email: full preset message, category, entry gate and reasoning.
- History: decisions, prior source snapshots and extraction versions.
- Results: every email, known findings, internal JSON download and explicit competition-export blockers.
- Page guide: navigation to all designed scenarios.

## Important behaviors

- A verified difference remains MISMATCH. Completing a review is not document agreement.
- Missing, unreadable, ambiguous and processing failures are separate.
- An uploaded file alone never marks a case resolved; only explicitly selected preset recovery material changes the demo result.
- Numeric, company and port decisions require source evidence. They apply only to the current case.
- A retry of the timeout fixture fails once, consumes its budget and then stops.
- Non-comparison categories never report a seven-field pass.
- The internal report retains every preset email. Official submission is blocked because the data is synthetic and some reason mappings are not defined.
- SI is a reference, not proof of real-world correctness.

## Technical boundaries

No dependencies or build step are required. `dist/data.js` owns fixtures, `dist/app.js` owns shared state and evidence rules, `dist/experience.js` owns the action-first screens, and the two CSS files own tokens and responsive layouts. Hash routes work on static hosting. Optional WebMCP read/navigation tools are feature-detected; unsupported browsers continue normally. These tools do not modify field findings.

Real backend work remains: original document storage and evidence coordinates, full-message classification, independent extraction, bounded visual reread, versioned field parsers, validated result adapters, authentication if needed, and measured evaluation on the actual bundle.
