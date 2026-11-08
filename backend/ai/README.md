# Private investigation worker

These TypeScript modules run only on the trusted Node worker. Do not import them into the browser bundle. No keys, raw provider errors, or hidden reasoning are returned.

## Integration

1. Read `NVIDIA_API_KEY` from the worker environment. Without it, `modelRegistry()` returns all three visible choices disabled.
2. Create `createNvidiaTransport({ apiKey })`. Run `probeModel(transport, modelId)` for each desired model. Only add IDs with `ready: true` to the session's verified set passed to `modelRegistry(apiKey, verifiedIds)`. A restart requires fresh proof. The proof makes two real requests, validates a requested tool and its arguments, associates the tool-call ID, and checks that the next model response uses the random returned result.
3. Call `investigate` with the immutable selected model ID, measured observations, allowed finding/artifact IDs, initial cases and their results. Set `context.requiredEvidenceIds` to both policy IDs. Supply `initialCaseResults: [{ input, result }]` for all initial cases to reuse their measured results.
4. Supply trusted `readArtifact`, `runComparison`, and `proposeReview` functions. The runner function receives only strict case JSON on the already-pinned pair. `proposeReview` stores suggestions only; it must never create human approvals or acceptance tests. Publish `onEvent` events through the worker's authorized job transaction and retain the final result, including partial outcomes.
5. On cancellation, abort the signal and wait for the investigation to settle before marking cleanup complete. The runner implementation must also honor this signal.

The controller allocates two turns to each of four roles, for eight total normal calls, with one shared structured-output correction at most. It makes zero automatic transient retries because a failed request may already have been billed. It caps each role's response at six tool calls, global tool calls at 24, distinct investigation cases at 20, provider bodies at 128 KiB, artifact source at 48 KiB, and tool output at 64 KiB. Per-request timeout defaults to 60 seconds and the overall investigation timeout to 360 seconds. These are conservative defaults, not measured latency claims. The controller runs specialists in dependency order; behavior/policy parallel execution is not required.

The orchestrator must actually request the three specialist handoffs. Each specialist has a separate context, performs its authorized tool handoffs, then returns a validated public summary. Regression receives behavior/policy results. Final synthesis retains both interpretations. Unknown tools, model substitution, invalid citations, missing required evidence, excessive cases and malformed replies cannot gain approval authority. Failed roles remain failed; successful work survives as partial analysis.

## Evidence

`localArtifact(spec, text)` checks source hashes and labels bundled content **Local fixture**. `createEvidenceReader(pinnedSpecs)` permits only `fixtures/returns/...` paths in `YuvrajKashyap/legacydiff`, pinned by full commit SHA and expected content SHA256. It checks the Contents API blob SHA against actual bytes and stores source bytes, lines, retrieval time and commit-pinned URLs. Its in-memory cache can return only a previously fetched matching snapshot as **Cached**. Persist returned snapshots in Spacetime for durable history; this adapter is not an application database.

There is no default remote commit: this repository was empty at clone time. A first push requires the user's approval. After authorized publication, set the worker-only `GITHUB_EVIDENCE_COMMIT` to the actual full commit SHA and restart the worker. `backend/worker/evidence-config.ts` builds the allowlist from reviewed manifest paths/hashes, fetches the five artifacts, and blocks readiness if any required artifact is unavailable without a matching fetched cache. `readCatalog(verifiedModels, onArtifact)` sends full snapshots to Spacetime before catalog publication; investigation resolves frozen run snapshots by ID/hash/commit. Never use a branch name or invent a SHA. Citation validation proves the quoted bytes appear in the specified lines, not that their interpretation is authoritative.

## Verification and limits

Run `node --test backend/ai/*.test.ts` or the root test command. The tests exercise the real controller and HTTP adapter with controlled provider responses. They do **not** prove NVIDIA account access, current model tool compatibility, or a live GitHub retrieval.

On November 8, 2026, authorized NVIDIA setup supplied a worker-only key. Ultra passed a real tool round trip; other choices remain disabled when their session probes fail. Read `docs/VERIFICATION.md` for actual full-investigation outcomes. No model is force-enabled by documentation or a prior session result. GitHub live retrieval remains blocked until the synthetic artifacts exist at an approved published commit.

Official references checked:

- [Nemotron 3.5 Super VL](https://build.nvidia.com/nvidia/nemotron-3.5-super-vl-120b-a12b)
- [Nemotron 3 Ultra](https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b)
- [Nemotron 3.5 Lightning](https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b)
- [NVIDIA function calling](https://docs.nvidia.com/nim/large-language-models/1.15.0/function-calling.html)
- [GitHub Contents API](https://docs.github.com/en/rest/repos/contents)

## Contextual case chat

`case-chat.ts` answers one saved question with one structured Nemotron call. The database pins review versions, measured case IDs and public specialist summaries when the question is queued. The worker includes bounded source excerpts, selected requirement results, overall counts and recent completed chat. It checks actual model identity and exact quoted lines before saving an answer. A question has a 90-second limit and no automatic retry. Chat has no policy or execution tools. The shared history is visible only to admitted room members.
