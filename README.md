# Verity — evidence-linked shipping document review

React / Motion workspace for MumMumMumWeh. The existing white/coral interface is preserved. Real imports now use a server processing pipeline, D1 records and R2 originals; example cases remain clearly separate and browser-local.

## Run locally

1. `npm ci`
2. `npm run build`
3. `npx wrangler d1 migrations apply verity-local --local`
4. `npm run dev:server` (local Worker at 127.0.0.1:8788)
5. `npm run dev` (React at 127.0.0.1:5178)
6. `npm test`

`npm run build` emits `dist/server/index.js`, `dist/client` assets and Sites metadata/migrations. Deploy using Sites, not Wrangler deploy. Production logical bindings are DB and BUCKET. LOCAL_DEV exists only in local Wrangler configuration, never the hosted manifest.

## Current processing

- Native PDF text, DOCX paragraphs/tables, XLSX sheets/cells and TXT use direct readers. Scanned PDF pages and PNG/JPEG are prepared in the browser, then read by server-side GLM OCR. Gemini independently extracts fields from the original scan image; it does not receive the GLM transcript. The two evidence paths are checked before comparison. There is no Tesseract or hidden browser-OCR fallback. TIFF and legacy Office formats stop explicitly; they are not mislabelled as successfully read.
- Source preparation runs in the user's browser; classification, GLM OCR, Gemini extraction, validation, comparison, review actions and persistence run on the Worker. A closed browser stops a new batch's not-yet-submitted work; persisted records can be resumed from each case.
- Without an API key the provider is **local-rules**, a conservative labelled-field parser and intent heuristic, not an AI model. It reads real submitted content; it never substitutes fixture outputs. General/unclear requests need manual category confirmation. Keyword routing checks the complete subject/body, SI/BL token boundaries and Chinese equivalents; quoted old requests are screened by the local heuristic. Explicit current-message invoice queries complete as classification-only even without an SI/BL keyword. When an API key is present, native document labels can recover a field whose model quote fails validation; the original quote and source remain inspectable.
- The replaceable API provider performs full-message classification, independent SI/BL extraction and a single targeted visual reread round per document. Prompts treat source content as data, not instructions. Strict schemas, grounded quotes, page and label checks run before comparison. A malformed response has one schema-only repair. Unchanged transient failures have one user-triggered retry; no infinite loops.
- A unique SI/BL pair compares automatically when source references agree, or when the current unquoted email explicitly identifies its only typed SI and BL attachments without conflicting references. Multiple versions, quoted-history-only links, unknown co-occurrences and conflicts require explicit review. File names never establish document identity. Attachment association uses JSON names; unlinked files require explicit selection.
- Original sources never change. New decisions preserve previous values, actor scope, timestamps and evidence. Reviewer confirmation of a mismatch retains MISMATCH.

## Rules matching the technical HTML

`engine/rules.js`, `engine/provider.js`, `engine/pipeline.js` and `engine/export.js` implement the contract from `../work/technical-content.html`.

- Seven fields: shipper, consignee, notify_party, port_of_loading, port_of_discharge, container_count, gross_weight_kg.
- MATCH / MISMATCH / null are distinct from MISSING / UNREADABLE / AMBIGUOUS and processing failures.
- Missing extraction is not missing source content: unlocated fields remain UNREADABLE. Labelled blanks or N/A can be MISSING. Net-weight evidence cannot validate gross weight.
- Numbers use string/BigInt decimal arithmetic, exact comparison and explicit `unset` or `en_comma` source profiles with evidence. No inferred locale or tolerance. Metric units and finite English number words are supported. Zero weight is allowed; negative weight and nonpositive/noninteger container counts block comparison. `6 × 40 HC` is six containers.
- Ports use a bounded, versioned mapping. Unknown names remain unresolved even when both raw strings agree; name/code conflicts block normalization. Mapping coverage is intentionally limited.
- Entity names and qualifiers are preserved. Explicit structured addresses are separate: one-sided addresses do not change name-scope equality; conflicting bilateral addresses block automatic completion with a scope warning. No fuzzy-company auto-matching.
- Quality records include source checks, grammar checks and not-applicable markers for total/business checks without verified scope. No assumed per-container weights or invented business ranges. Arbitrary freight-table totals are not inferred by the local parser.
- One targeted visual round uses the original page images, never the opposite document's value. Successful extractions cache by original hash and provider/prompt version. Changed source profiles reparse without model re-extraction.
- Human judgments are case-specific and never silently become global aliases. Unknown answers can stay unresolved.
- Internal export retains all cases. Following the official scorer, noncomparison emails and explicit requests to send a draft BL without attached documents export as classification-only OK, with no claim that SI and BL matched. An established difference exports as MISMATCH even when another field still needs review; that unresolved field remains visible internally. Official export is blocked for undefined mappings (multiple review reasons without a difference, multi-shipment and unresolved scope warnings without a difference). Diagnostic counts separate service failures from data problems, with the HTML's provisional 50-case/30% diagnostic trigger and up-to-10 automatic-pass review candidates. Candidate order is deterministic; this is a review list, not an unbiased statistical sample.

## AI API handoff

Set server-only production secrets through Sites:

- `GRAFILAB_API_KEY`: secret bearer key. This enables Grafilab at the account console's `https://llm.grafilab.ai/v1` endpoint. Default text and vision model: `gemini/gemini-3.5-flash-lite`; low-confidence scan OCR: `grafilab/glm-ocr`.
- Optional `GRAFILAB_MODEL`, `GRAFILAB_VISION_MODEL`, `GRAFILAB_OCR_MODEL` override those exact model IDs after testing. The 3.5 Flash Lite and GLM OCR read synthetic text/image correctly in the Grafilab Playground; this is not a real dataset accuracy result.
- Optional `TYPESAFE_API_KEY`: separate TypeSafe account key for Jev email routing, pinned to `jev-1.13.0` (override with `JEV_MODEL` after testing). Grafilab credits cannot pay for Jev. Explicit invoice queries retain the existing zero-call rule. Jev confidence below 0.8, conflicting comparison intent, incomplete message coverage or provider failure falls back to the existing Grafilab classification path when configured. The second classifier sees the original email independently, never Jev's proposed answer. If the fallback is also uncertain, manual review remains required; a failed fallback remains a processing error. Jev confidence is a routing signal, not guaranteed correctness. Its displayed excerpt is email context, not an explanation generated by Jev. Without a TypeSafe key, the previous routing remains available.
- Generic fallback: `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY` for another HTTPS OpenAI-compatible provider when Grafilab is not configured.

Local development uses ignored `.dev.vars` with these same names. Never use a VITE_ prefix or put keys in browser storage. The queue uses bounded parallelism and can resume persisted cases. A fresh 520-email development-set run on 21 September 2026 made 909 successful provider requests in 136.18 seconds at an estimated US$0.5033, followed by one bounded two-call recovery of a low-confidence classification. Against the supplied ground truth, classification accuracy was 520/520 and email-level defect precision/recall were 46/46 with no false alarms. One evidence-backed human decision completed the 520-row official export. These are development-set results, not a held-out guarantee; the cost uses recorded tokens and benchmark rate assumptions rather than a reconciled invoice.

## Persistence and authorization

D1 owns batch/case/file metadata; R2 owns original bytes and page images. Every API query scopes records to the authenticated Sites user. Same-origin writes, file access checks and optimistic revisions prevent cross-user reads and stale edits. No key appears in the frontend. Local examples/settings remain local; old local imports are preserved, not silently migrated to cloud.

## Deliberate limits

25 MB/file; 30 pages/sheets; 1000 emails and 1500 files/batch; ZIP expansion bounded at 150 MB; document text bounded at 500k characters; case evidence JSON bounded at 1.5M characters. Unsupported or excessive input produces an actionable error, not fabricated output. Scans require configured server-side GLM OCR. No autonomous mailbox access, notifications, ERP updates or automatic source correction. Published benchmark claims must identify the evaluated dataset, measurement method and pricing assumptions.

## Verification

Run `npm test` for comparison boundaries, extraction contracts, pairing, profile grammar, entity scope, target reread limits, export gates and prior frontend state invariants. Browser integration additionally verifies actual image OCR, PDF/DOCX/XLSX reading, cloud-backed review, reload/cross-session persistence, ownership isolation and stale-write rejection. Test fixtures are synthetic and are not accuracy benchmarks.
