# Rules 1.1: source-grounded comparison repairs

The frozen 520-email API run was replayed offline with the original independent
extractions. No model requests were made, and no ground-truth labels entered the
rules. This is development regression evidence, not a held-out benchmark.

| Metric | Rules 1.0 | Rules 1.1 |
|---|---:|---:|
| False-positive emails | 27 | 3 |
| True-defect emails detected / 46 | 26 | 27 |
| Exact defect field sets / 46 | 11 | 17 |
| Completed seven-field checks | 0 | 11 |
| Manual cases | 147 | 136 |
| Export-blocked cases | 75 | 87 |

Classification remains 473/520. No gold-defect email automatically completed.
One previously counted true-positive email had only a false consignee alarm;
removing it exposes its still-unresolved port name/code conflict. Thus the small
recall increase must not be described as recovery of every real defect.

## Changes

Company comparison uses source values, retaining full legal names and in-value
agency/order relationships. Model entity splitting cannot create a difference
between identical validated source blocks. A `To the Order of:` heading included
in raw is removed only when it starts the source quote. This is company-name
comparison, not verification of negotiability or legal equivalence of headings.
Missing/ambiguous/illegible source evidence and `SAME AS CONSIGNEE` cannot bypass
validation through equality.

Container grammar accepts complete `10 x 20'FCL` and `10 x 40/HC` expressions.
Zero, mixed types/totals and unrelated quantities still require review.

Official SDOC v2 `render.py` explicitly formats weights with comma grouping and
KG. `sdoc-format-manifest.json` registers 250 hashes of exact official attachment
bytes and this format metadata only. `register-sdoc-format.py` reads the renderer
and attachments, never ground truth or defect labels. The server computes source
hashes. Renamed identical files keep the profile; changed/new files do not gain
a profile from their name, language, apparent size or a three-digit suffix.
Explicit user profiles are preserved. Normalization stays exact decimal-string
arithmetic. General-source locale inference is deliberately unchanged.

## Remaining limitations

Three false positives remain: OCR corruption and differences in agency scope
between actual source text and official scoring expectations. Port-table
coverage, extraction/pairing failures and classification errors are not solved
by this patch. 75 no-field BL requests were classification-only records, not
75 pairing failures. The frozen run contains 88 actual pairs; 85 of their weight
comparisons now finish (79 matches, 6 mismatches), with 3 still unresolved.

Export blocks increased because false mismatches previously hid unresolved
issues behind a MISMATCH submission. These cases now correctly remain blocked
pending mapping/recovery. The partial export must not be submitted as complete.
Cached replay does not measure fresh API accuracy, new cost/latency, or hosted
end-to-end behavior. Existing saved cases need reprocessing to use new rules.

Validation: 53 tests pass and the production build succeeds. Replay and scoring
scripts keep output separate from the frozen baseline.
