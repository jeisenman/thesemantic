# Research workflow validation

## Scope

The working path is Rust CLI -> research API -> OpenAI Agents SDK -> Rust model
bridge -> installed Codex with native authentication -> MLflow -> Electron and
its sandboxed page. MCP reads the same persisted records as the HTTP API.

The supplied-data example adds three counts and reports their total and mean.
It is an integration example, not scientific validation or production evidence.
Private execution references and retained measurements remain in local storage.

## Repeatable checks

Run `node scripts/check.mjs` from the repository root. The suite checks Rust
formatting, Clippy, Rust tests, Python formatting and linting, API tests,
TypeScript types and tests, production builds, and the cross-component fixture.

The closure fixture uses the real Rust CLI and Agents SDK with a fake Codex
process. It verifies prompt forwarding, bounded execution, output, usage
handling, and persistence without a paid model call. Isolated API tests cover
successful saves, invalid requests, provider errors, replay, and storage errors.

After building, the native desktop checks exercise the real main process and
preload with isolated fixtures. They check renderer isolation, typed IPC, the
proposal editor, saved conversations, and navigation. Run them with:

```sh
npm run test:native --workspace @the-semantic/desktop
npm run test:semantic-native --workspace @the-semantic/desktop
npm run test:codex-preview-native --workspace @the-semantic/desktop
```

Start a new MCP child after each Rust rebuild. Verify initialization, tool
discovery, and read parity against the API. Set `Q2_MCP_DEBUG=1` and keep debug
output separate from protocol stdout. Do not print stored private references.

## Explicit live checks

A live model check requires an explicitly accepted bounded specification. It
can invoke a paid provider. The application allows one execution attempt and
does not automatically retry or substitute models. Reusing an accepted key
must read the existing record without starting another model call.

The interactive coordinator uses `gpt-6.1-sol`. Accepted experiments use the
model pinned in their agent definition. Model access failures remain explicit.
Previous successful supplied-data checks do not prove current provider access.

## Limits

- A model result is not scientific validation.
- Captured events do not include all private Codex internals.
- MLflow API operations are not transactional. Recovery evidence must remain
  available when publication fails.
- No Databricks execution, automatic production queries, arbitrary plugins,
  or concurrent experiment execution is enabled by these checks.
- Historical failure evidence remains local; it is not part of this source
  repository or its public validation notes.
