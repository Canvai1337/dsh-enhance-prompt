# Changelog

All notable changes to this project are documented here.

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
