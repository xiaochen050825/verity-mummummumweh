# GLM primary OCR and evidence review — 2026-09-21

## Shipped behavior

- Removed the Tesseract browser engine, English model, WASM assets and npm dependencies. Images and scanned PDF pages are prepared as bounded JPEGs and read by server-side GLM OCR. Native PDF text, Word, Excel and text files still use direct reading.
- Unavailable OCR credentials or missing page images produce a processing error. They do not become missing SI/BL findings and do not fall back to a hidden browser OCR engine.
- GLM text is followed by independent Gemini extraction from the original scan images. The image extraction does not receive the GLM transcript. Field quotes must agree with the OCR evidence before comparison; disagreement is held for review. No third visual call is made solely because the old browser transcript had low confidence. Agreement between models is useful validation, not proof of correctness.
- For legacy scan readings, unresolved references or weight context can trigger up to two additional page reads per case. Results are cached against the original file hash; optional reading failures retain previous evidence and cannot loop indefinitely. Clear native text is not sent for speculative OCR.
- Pairing review now displays typed source references and their page/quote. A title-adjacent unlabelled number is shown as an unconfirmed clue, never automatically treated as an order/booking number.
- Weight review shows the actual kg value under each supported format, separately for SI and BL, instead of asking users to interpret generic format examples. Nothing is preconfirmed; source evidence is still required.

## Validation

114 JavaScript tests pass, including direct GLM ingestion, independent extraction disagreement, cache reuse, failure preservation, no fallback without OCR, arbitrary identifiers and preserved pairing boundaries. Five independent export-checker tests also pass. Desktop/mobile component checks passed; a browser image-reader check prepared a server OCR image with zero old OCR asset requests.

The final 520-email frozen-response replay has no skipped cases or new provider calls:

| Metric | Before | After |
|---|---:|---:|
| Detected true defects | 40/46 | 40/46 |
| False-positive emails | 0 | 0 |
| Missed defect emails | 6 | 6 |
| Emails requiring action | 129 | 129 |
| Classification-only automatic completions | 391 | 391 |
| Fully automatic seven-field checks | 0 | 0 |
| Exported / blocked | 451 / 69 | 451 / 69 |

The remaining blocked cases had no eligible not-yet-reread scan pages. Clear text such as `21,577 KG` still lacks a declared separator convention. Repeating OCR cannot supply that fact. These changes improve the general scan path and human review presentation; they do not establish a measured reduction in review time or count.

## Real scan integration check

Selected one two-page scanned email by file/read characteristics, without loading ground truth. Original file hashes were verified. The first check made two GLM and two Gemini requests. It exposed a bad OCR company spelling being treated as a difference. Independent original-image extraction was then added; a second check reused those two GLM transcripts and made two Gemini requests. The company field became an evidence disagreement for review rather than an asserted defect. Other uncertain fields remained unresolved.

All six requests returned HTTP 200 with token usage recorded. The two phases took about 15.9 s and 6.4 s respectively, including local image preparation; these are single-case integration timings, not batch or model averages. Dollar cost was not reconciled with billing. This fresh sample is not merged into the frozen-response development benchmark or advertised as a fresh 520-email score.

Evidence outside the deployed source:
- `work/glm-primary-final-regression-2026-09-21/`
- `work/glm-primary-live-2026-09-21/`
- `work/glm-primary-verified-live-2026-09-21/`
- `work/glm-primary-tests-2026-09-21.txt`
- `work/bounded-context-desktop.png`, `work/bounded-context-mobile.png`

Publication changes code only. Existing production records and previous source histories remain intact; full fresh-model batch evaluation remains separate work.
