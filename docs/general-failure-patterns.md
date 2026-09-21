# General evidence fixes — 2026-09-21

Objective: use development errors to identify reusable failure patterns. Do not infer runtime decisions from expected answers, email IDs, sender identities, template hashes, or dataset provenance. Necessary review remains supported.

## Implemented patterns

1. **Different reference types lack an evidence bridge.** Existing same-type source reference matching remains first. A bounded alternative links exactly one SI and one BL using an explicit current-email attachment declaration naming the SI booking, plus a subject reference matching the BL source. Conflicting source references, multiple attachments, quoted-only correspondence, negation and reference substrings are rejected. Store the source and email quotations. This relies on the current correspondence being accurate; it is not independent proof that a shipment exists or that a sender never makes mistakes.
2. **Explicit number/unit context is lost.** Weight-format declarations on the same native-read page may specify decimal and grouping separators separately. Conflicts remain unresolved. A same-page explicit all-weights unit declaration may supply a missing unit. Do not copy formats from the other document, infer them from a sender/country, or treat identical ambiguous strings as proven equal. This deliberately supports a bounded declaration grammar rather than arbitrary prose.
3. **Stale cached text hides recovered native evidence.** New native page text takes priority over cached text for the same original file. Non-native pages preserve existing cached OCR text. Cache reuse still requires matching original hash and provider configuration. This is not a general guarantee that every new transcript is better; validation still checks source evidence.

## Validation and observed effect

520 development emails were replayed with preserved AI responses and original-source reading. No API calls, skipped cases, or new AI charges. Ground truth is used only by scoring. This is not a held-out accuracy estimate or a new end-to-end speed/cost benchmark.

| Metric | Previous source-review version | Current version |
|---|---:|---:|
| Real defect emails detected / 46 | 37 | 40 |
| False-positive emails | 0 | 0 |
| Missed defect emails | 9 | 6 |
| Exported records / 520 | 448 | 451 |
| Export-blocked records | 72 | 69 |
| Emails still requiring action | 129 | 129 |
| Classification-only automatic completions | 391 | 391 |
| Fully automatic seven-field checks | 0 | 0 |

Pairing changes allowed four previously blocked cases to be compared; three contain true defects. All four still need a business decision or another unresolved field, so the manual-email count did not decrease. The number-declaration and native-cache fixes add tested general capabilities but produced no additional metric gains on this replay.

The 69 export blocks comprise 11 unresolved pairs and 58 records whose internal numeric uncertainty cannot be represented as an allowed official review reason. Do not invent a competition output to fill those gaps. The six missed defects are still held for review, not automatically passed.

105 JavaScript tests and five independent export-validator tests pass. Tests include arbitrary new references and document identities, conflicting references, quoted correspondence, different separator conventions and source pages, missing units, and cache replacement. Synthetic tests establish these boundaries; they do not substitute for unseen customer documents.

Independent submission validation accepts the 451-record partial export with zero structural/source-check errors, but marks it incomplete because 69 IDs are absent. This is not official full-submission acceptance.

Evidence directories outside the site source:
- Before: `work/claude-final-regression-2026-09-21`
- Pairing change: `work/message-link-regression-v2-2026-09-21`
- Source declarations: `work/generic-pattern-regression-2026-09-21`
- Final: `work/native-cache-regression-2026-09-21`

Publication updates application code; it does not silently recompute stored production cases. Reprocess an existing record explicitly to apply the new engine. Stop this iteration here rather than expanding rules to chase a perfect development score.
