# Changelog

All notable changes to this project are documented here.

## [1.2.0] - 2026-11-18

### Fixed
- **Enhancement failed with a generic "请重试" for causes the user could act on.** The client now maps HTTP 401/403 to a re-login hint, 404/405 to "restart DSH", a dropped connection to an offline hint, and a Host 504 to a real timeout message. A non-JSON or empty success body no longer falls through to the retry copy.
- **The client deadline was shorter than the Host's own budget.** The browser gave up at 60 s while the Host allowed 75 s per attempt, so a slow-but-successful rewrite reported a timeout. The client deadline is now 300 s, above three Host attempts at the shipped 75 s and at the 90 s a profile may raise it to.
- **Output was padded with empty lines.** Models emit 3–5 blank lines between sections; the Host now collapses every run to exactly one blank line and trims trailing spaces.
- **A reformatted marker cancelled the whole rewrite.** Models occasionally write `【DSH_REF_0】` or `[DSH_REF 0]`; the Host canonicalizes those variants back to `[[DSH_REF_0]]` before the integrity check instead of refusing with `references-lost`.
- **`temperature` was hardcoded to 0.3.** Reasoning-only models reject that parameter. It is now a config value that defaults to empty, which omits the field entirely.
- **An identical rewrite claimed success.** When the model returns the draft unchanged, the note now says the content was not modified instead of flashing "已替换为优化后的提示词".
- **An oversized upload reset the connection instead of reporting the refusal.** The route answered 413 the moment the ceiling was crossed while the client was still uploading, so Node destroyed the socket: the browser saw a reset, and the next request on that keep-alive connection failed too. The remainder is now drained (up to 32 MiB) before answering, and a cut drain closes the connection explicitly.
- **`timeoutMs` could be configured above the client deadline.** Clamped to 120 000 ms so three Host attempts still finish inside the client's wait.

### Changed
- Up to three bounded attempts for transient failures (`model-failed`, `empty-result`, `output-truncated`, `references-lost`, `reasoning-unsupported`). A truncation retries with the output cap doubled (capped at 64 000), a marker-loss retry appends an explicit repair instruction to the system prompt, and a rejected reasoning effort drops the inherited effort before the next attempt.
- The client deadline is 300 s, above three Host attempts at the shipped 75 s and at the 90 s a profile may raise it to.
- Request body ceiling raised to 2 MiB and `maxInputChars` to 32 000, so a long draft with a big attachment list is no longer refused at 8 000 characters.
- Failure notes render with an error border and stay for 5 s (success notes keep 3.5 s); the Undo note still holds for 12 s.
- Added `npm test`: `test/check.mjs` (26 offline checks over both halves, including the retry pipeline against a scripted `ctx.llm`) and `test/host-http.mjs` (12 checks that mount the real route on a real `http.Server`, covering the trust fence, body limits, keep-alive reuse and the marker-repair path).

## [1.1.0] - 2026-11-17

### Fixed
- **Uploaded images/files could disappear after enhancement.** The draft swap (`setDraft`) now re-checks the composer's `attachmentIds` and re-adds anything dropped, within two paints. Undo does the same.

### Performance
- Language-aware system prompt: send only the Chinese or English prompt matching the draft, roughly halving system tokens (lower latency and cost).
- Client: stable `useInput` selector (no resubscribe churn); style sheet, sparkle and spinner elements built once; button re-renders only on input-phase changes.
- Lower default output cap (2048) and tighter, validated config bounds.

### Changed (refactor, no behavior regression)
- Host split into small pure helpers (`normalizeConfig`, `resolveRoute`, `normalizeOutput`, `markersOf`, `rewrite`) with a single linear request pipeline.
- Client split into pure helpers (`orderedRefs`, `splitForModel`, `rebuildSnapshot`, `restoreAttachments`, `messageFor`) plus a single controller; removed the temporary diagnostics route.
- Added a `notReady` guard for non-editable input states.

### Docs
- README screenshots replaced with mockups that match the 1.1.0 layout and copy; added `enhancing.png` and `enhanced-result.png`.
- The mockups are reproducible: `docs/mockups/generate.cjs` draws the composer in HTML/CSS and renders it with headless Chrome.
- Redrawn from DSH's own stylesheets and design tokens (`InputBar`, `ModelSelect`, `PermissionSelect`, `FileCard`, `ReferenceChip`, `design-platform.css`) in the light appearance, so the composer chrome — attach circle, permission chip, model trigger, blue send circle, file card rail, inline reference chip — is what DSH actually renders rather than an approximation.

## [1.0.0] - 2026-11-16

### Added
- ✨ Composer button in `conversation.input.right`, immediately left of the model selector.
- Rewrites the draft into a **sectioned prompt** with plain-text labels (e.g. `目标：`), lists and blank lines; no `#` or bold.
- **File/reference preservation**: inline references become opaque `[[DSH_REF_n]]` markers for the model round trip and are rebuilt as reference chips on writeback, so attached files never degrade into plain-text paths.
- Undo restores the original semantic draft (chips included).
- Cancel on second click, client + host timeouts, specific localized error messages.
- Defensive host-side cleanup: strips stray `#` headings and whole-line `**bold**`.
- Host-side marker integrity check (`references-lost`) and refusal of truncated output (`output-truncated`).
- Same-origin + authenticated HTTP route via `connection.requestRejection()`.
- Config: `structured`, `provider`, `model`, `reasoningEffort`, `maxInputChars`, `maxOutputTokens`, `timeoutMs`, `system`.
- Localized plugin metadata and UI copy (zh, en).

### Known limitations
- Command mode (leading `/command`) is not supported.
- Inline quote nodes degrade to equivalent plain text.
- Writeback depends on `setDraft` accepting a semantic draft object (runtime-verified; re-verify after DSH upgrades).
