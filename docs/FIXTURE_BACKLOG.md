# Modernization fixture backlog

Source: [Modernization Use Cases and Validation Guide](https://chatgpt.com/space/page_a14b9ae17534819196c928339697de98), read November 8, 2026. The original proposal table below is retained as planning context. Returns, pricing, accounts payable and permissions are now implemented in the Working source; the expansion has not been runtime-verified. Illustrative outputs in the table are not measured results.

Modernization may address unsupported technology, maintenance cost, delivery, integration, scale, reliability, controls or security. Preserving all legacy behavior can preserve old defects. Keep observed baseline/candidate behavior, approved intended behavior, and independent requirements separate. A difference may be a regression, intentional change, corrected legacy defect or unresolved policy. Matching outputs can share defects. Crashes, invalid outputs and timeouts are errors.

| Proposed fixture | Input and illustrative outputs, not measured | Consequence and pinned evidence to author | Decision owner and expected checks |
| --- | --- | --- | --- |
| Pricing | 120 units at 9000 cents; 1,080,000 cents versus an extra 10% discount yielding 972,000 cents | Double discount or overcharge; pin agreement stating whether price includes volume discount and conflicting migration ticket | Pricing owner; stacking/nonstacking, no flag, quantity bounds, exact rounding, currency and duplicate-processing checks |
| Accounts payable | 980,000 cents subtotal + 98,000 cents tax; standard versus enhanced routing at 1,000,000 cents | Candidate may fix a control bypass; pin controls manual and net/gross migration specification | Finance control owner; threshold below/at/above, amount basis, distinct eligible approvers, no submitter approval; retry checks require stateful adapter |
| Fulfillment | Need 8 units; warehouses hold 5 each; allocation 5+3 versus refusal | Split shipping can violate opt-in; pin customer shipping preference and allocation policy | Fulfillment owner; explicit opt-in, conservation, no negative stock, insufficient stock; concurrency requires stateful adapter |
| Permissions | Role allow plus explicit user deny; allow versus deny | Potential access bypass; pin approved deny-overrides security rule | Security owner; deny precedence, default deny, tenant isolation and no protected fields in denied responses independently on both variants |
| CRM deduplication | Same phone, changed email; merge versus manual review | Wrong-person merge or unnecessary review; pin identity-resolution policy | Data stewardship owner; ambiguity, conflicting identifiers, manual review, no irreversible automatic merge |
| API compatibility | Missing resource; structured 404 versus 200 with empty object | Client contract changes despite no crash; pin API/consumer contract | API owner; status, body, content type, headers, null/absent fields, authorization and exposure; requires HTTP adapter |

Before implementation, pin the input contract, source hashes, policy passages and effective scope, owner, independent requirements, test origin, command and runner version. Only executed outputs may become measured results. Security requirements cannot be waived by ordinary review to obtain parity.

## Original next-step proposal (superseded by authorized expansion)

A tiny deny-overrides fixture is the preferred next scenario. Estimated effort: half a day for reviewed pure-function variants, independent requirement tests, manifest/export coverage and review; integrating a second scenario into the UI is additional work. It would demonstrate shared security defects but defer hosted and provider polish. Pricing is the business-impact alternative. Neither is added to runtime in this milestone.

Stateful retries/concurrency, broader security scanning, cross-language execution and production readiness remain separate capabilities. Existing authorization/concurrency tests verify LegacyDiff itself; they do not test a customer's application. No arbitrary repositories, production data, automatic repair, paid service or external publication is authorized by this guide.

## Working implementation checkpoint — November 8, 2026

The user authorized all four bundled scenarios: returns, pricing, accounts payable and permissions. Working now includes a catalog-driven picker, versioned synthetic datasets, frozen source/evidence snapshots, paged measured cases, independent requirements, explicit policy proposals and revision-bound human approval. Approved decisions retain their own acceptance result and export action. AI selection remains optional and gated by actual catalog readiness; provider summaries do not become measured output or approval.

All comparisons, Needs review and History use shared row summaries across classic returns and the new suite. The classic returns investigation remains available. Fulfillment, CRM deduplication and HTTP compatibility remain proposals, as do stateful/concurrency adapters and arbitrary customer code.

Implementation is not runtime proof. The user requested fast iteration without tests/checks; no new suite execution, browser verification, build or test result is claimed. See VERIFICATION.md for the separate historical evidence and current pending scope.
