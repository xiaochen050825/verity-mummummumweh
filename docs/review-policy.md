# Evidence and competition mapping decisions

2026-09-21. These rules are independent of development-set IDs and labels.

## Unstated representation

An identical base company name with an `ON BEHALF OF` principal on only one side remains unresolved, in either direction, for both short and full document layouts. Layout brevity does not establish a waiver of relationship comparison. Both named principals differing is a discrepancy; equal validated full parties can match. Original values remain visible. This intentionally replaces the old unconditional one-sided-principal=MISMATCH assertion; tests cover both directions and layouts. A truncated extraction is a separate reading problem and must not use the relationship rule to infer equality.

## Numeric ambiguity

No automatic acceptance based solely on identical ambiguous strings. Interpret both sources independently; only invariant comparisons across all valid candidates are conclusive. Unknown units remain unknown. Exact decimal comparison is the current business policy; a rounding-tolerance policy would require an explicit agreement, not assumptions about displayed precision.

## Export mapping, version sdoc-review-3

Source: competition data_v2 README, sections Ground-truth schema and Edge cases (local official-evaluator/README.md). The README defines NEEDS_REVIEW when comparison is not confident, and four review reason values.

When there is no established difference and exactly one supported reason, export NEEDS_REVIEW with that reason even if additional internal ambiguities exist. Those ambiguities remain in the case and audit. This does not declare the review reason exhaustive or resolve the case. Multiple supported reasons remain blocked until a precedence policy is confirmed. An internal ambiguity alone cannot be mapped to a fabricated official reason.

Existing known-difference precedence remains: emit the established defect fields, retaining other uncertainties internally. Audit marks incomplete field sets and mixed official-reason decisions as a product policy that the README does not explicitly define; it is not represented as organizer-confirmed.

Image-only PDFs: the README labels these unreadable even when OCR can recover content. Competition-only mapping now requires original-reader evidence: every page has zero non-whitespace native text characters and actual raster content. A different recorded file hash invalidates that evidence. Existing OCR/vision metadata alone does not prove the text layer was absent (the reader also uses OCR for sparse text). The product keeps recovered text and comparisons intact. A scan plus another supported reason remains blocked for unconfirmed precedence. This is not a rule that OCR-readable scans are unusable in production.
