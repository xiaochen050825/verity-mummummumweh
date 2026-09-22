# Bounded streaming processing — 22 September 2026

New imports reuse the original File objects after successful private upload. Reading no longer downloads those same originals again. Resume after a reload still reads the stored originals.

Routing (24 concurrent requests on larger devices, 10 on limited devices) feeds document processing (8/4 concurrent records) immediately. Starts are paced at 40/80 ms for routing and 125/200 ms for document processing so a newly opened batch does not arrive at either provider as one burst. The two configured Jev accounts receive stable 50/50 shards and each request fails over to the other account only when its selected shard is unavailable. A bounded buffer applies backpressure; no promise is launched for every email in the batch. PDF/image reading has a separate 6/2 pool. Upload concurrency is 24/10. Page dimensions, evidence images, OCR recovery and comparison rules are unchanged. In-flight document reads are deduplicated separately from a 32-document completed cache, so cache eviction cannot launch duplicate simultaneous reads.

Explicit attachment-free draft-send requests now finish in the routing request, using the existing classification-only rule. They do not receive seven-field matches. Uncertain classification and missing evidence remain reviewable. Saved unfinished routing/processing stages can resume; completed or human-review cases are not automatically retried.

## Validation

- 10,000 synthetic queue records: exactly-once scheduling, bounded routing/processing/buffer, isolated routing and processing failures. This validates scheduling, not live provider capacity or a 10,000-email end-to-end SLA.
- 520 saved live classifications replayed without API calls: categories, classification uncertainty and classification-only flags unchanged. 390 finish after routing; 129 require the document lane; 1 requires classification review. The prior phase structure sent 220 into the document lane, including 91 attachment-free draft-send requests.
- 28 original PDFs in headless Chrome: serial reading/rendering 17.926 seconds; four-way reading/rendering 9.970 seconds. Document text, evidence coordinates, generated page-image hashes and read errors were identical. Both runs identified the same two damaged PDFs. Upload responses were simulated locally, no AI was called, and no originals were downloaded. This is a reader consistency/performance check, not production throughput.
- Existing rule, extraction, recovery, export and provider-retry tests retained. The scheduler does not use ground-truth labels or email-specific exceptions.

## Limits and measurement

The UI's processing timer includes document reading, queueing and network waits; it is not pure provider execution time. Upload time precedes this timer. Fresh production timing remains necessary before making an end-to-end speed or cost claim.

Browser processing still requires an open tab. Archive size/entry limits remain in force; larger collections must be split. Reliable unattended processing of tens of thousands of emails needs a persistent server job queue, provider-wide rate budgets, leases and idempotency. Extra keys in the same provider account may share its limits; no new key is assumed to increase throughput. Existing bounded transient retries remain in use. No accuracy threshold was relaxed to obtain speed.
