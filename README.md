# Verity — React document review workspace

English SI / BL review workspace for MumMumMumWeh. White, coral red and pale pink visual system; an action-first queue and one focused issue per review.

## Current scope

This is a complete **frontend review prototype with a sample processing sequence**. It has 23 preset cases, evidence views, issue-specific recovery, file staging, decision history, local persistence and export. It does not run live OCR, model inference or competition scoring. Uploaded files are never silently substituted with preset documents.

## Run and build

- `npm ci`
- `npm run dev` for the local workspace at http://127.0.0.1:5178
- `npm test` for the comparison-state tests
- `npm run build` produces the static React application in `dist`
- `npm run preview` serves the production build locally

Source lives in `src`. The published Site retains its existing identity in `.openai/hosting.json`.

## Interface and motion

- React owns routing, review state, forms and rendered components.
- Motion animates tab indicators, navigation selection, field changes, expandable evidence, dialogs, saved decisions and progress.
- Radix Dialog handles focus containment, keyboard dismissal and accessible modal semantics. Radix Tabs handles keyboard navigation between filter tabs.
- Lucide icons and Sonner feedback are used throughout.
- The operating system's reduced-motion preference is respected. Settings can disable motion explicitly.
- No marketing landing page or extra sign-in screen was added.

## Complete frontend paths

1. To do: search, reason filter, sorting, pagination and direct case actions.
2. All records: needs input / processing / completed; classification-only emails retained.
3. Import: drag/drop and picker, JSON validation, ZIP entry checks, local file persistence, separate imported workspace.
4. Example processing: visible simulated stages, pause, resume after reload and completion.
5. Pairing: explicit SI and BL choices with booking mismatch exclusions.
6. Review: issue switcher, source excerpts, full sources, zoom, download, missing materials, unreadable scans, numeric interpretation, identity and port questions, extraction correction, manual full-source review and bounded timeout retry.
7. Recovery: one relevant primary action; defer with a note; explicitly labelled sample material can resolve a sample issue. Actual uploads remain pending until processed.
8. History: decisions, evidence notes and previous source versions.
9. Export: JSON detail or CSV summary, preview and all records retained. Competition submission is explicitly unavailable.
10. Settings: reduced motion, queue density, review export and reset only the example cases.

## Data boundaries

Example and imported workspaces are separate. Decisions are saved in localStorage (`verity-workspace-v3`); original uploaded Blobs are retained in IndexedDB (`verity-files`). This is browser-local storage, not cloud synchronization. Previous `verity-demo-v1` decisions migrate on first load. Importing uses a 50 MB limit per file; ZIP archives are inspected for entry names but not interpreted as extracted shipment fields.

Imported emails keep their full text and are visibly unprocessed. Manual email classification is available; document extraction and automated comparisons for real imports remain a backend integration task. An upload alone cannot change a field result. No API keys are stored in the browser.

## Decision invariants

- Verified differences remain MISMATCH, including in exports.
- Missing, unreadable, ambiguous, pairing and service failures remain distinct.
- Human interpretation needs a source reference and applies only to this case.
- Original evidence and prior versions remain available after correction.
- Missing files and processing failures never become seven-field matches.
- Timeout retries are limited to one for unchanged material.
- Non-comparison emails export `fields: null`.
- SI is a comparison reference, not proof of real-world shipment correctness.

## Backend integration remaining

Connect the designed pipeline: keyword gate on the subject/full body, full-message intent classification, format-aware native readers, OCR for scans, independent seven-field extraction, immediate rule validation, one source-image reread for suspicious recognition, field-specific comparison, evidence coordinates and the validated competition output adapter. Validate performance and review time on the real dataset before claiming accuracy or savings.
