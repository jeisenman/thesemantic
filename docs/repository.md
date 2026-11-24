# Repository ownership

Semantic is a standalone local research application. It owns its Rust CLI and
MCP adapter, TypeScript desktop and execution runtime, Python MLflow API, typed
wire contracts, tests, research skills, and source-pinned structural lineage
builder. The builder's Go packages are app-owned copies adapted for this
repository, invoked through the Rust CLI. They do not import qtwo_bench.
Run checks from this repository root:

```sh
node scripts/check.mjs
```

## Extraction

The current application was copied from `qtwo_bench/apps/the-semantic` on
November 24, 2026. The existing `../the-semantic` repository was left unchanged.
The new local checkout is `../semantic` beside `qtwo_bench`.

Copied source and instructions belong to Semantic. Adapt them to this app's
research workflow. Do not add a Git submodule, sibling-directory import, or
qtwo_bench package dependency. Copy a shared component only when this app needs
it, retain any applicable notices, and test its behavior here. The app's existing
`research-run` skill is retained under `.codex/skills/`.

The deterministic API adapters perform bounded operations. The Codex harness
chooses the next model action. Hypothesis drafting and proposal saving do not
authorize an experiment. Keep the current accepted-plan execution boundary.

## External integrations

- MLflow at `http://127.0.0.1:5055` remains the persistent store. Retain
  `MLFLOW_EXPERIMENT_NAME=ra/the-semantic` to read the existing saved records.
  Moving the app does not move or rewrite MLflow data or artifact locations.
- The app API remains at `http://127.0.0.1:5056`. Restart it from the new checkout;
  its health response must identify this repository as its project root.
- Lineage reads an approved local export when `SEMANTIC_LINEAGE_SNAPSHOT` is
  configured. Otherwise it uses the existing typed HTTP adapter and
  `SEMANTIC_LINEAGE_URL`, defaulting to `http://127.0.0.1:7420`. This app does not
  start the external service or regenerate source-derived snapshots. Invalid
  exports and unavailable services remain explicit errors.
- The Zendesk snapshot remains an external read-only export. Configure
  `SEMANTIC_ZENDESK_SNAPSHOT`, or keep the ignored `var/zendesk-snapshot` symlink.
- Codex retains authentication in its own installation. Never copy credentials
  into this repository. No model invocation is required for migration checks.

## Local launch

Run `npm run setup` to create ignored local configuration, install locked
dependencies, and build the app. See [setup](setup.md) and
[connections](connections.md). Then run:

```sh
npm run api
# In a separate terminal:
npm run desktop
```

Rebuild the Rust executable and start a fresh MCP child after changes. The
example `.codex/config.toml.example` points to the new checkout and enables
`Q2_MCP_DEBUG=1`. Update local shell aliases that still point to the old checkout.
Leave the shared MLflow service and historical artifact directories in place.

## Migration verification

On November 24, 2026, the full `node scripts/check.mjs` suite passed from this
checkout. The native Codex preview check also passed. A newly rebuilt MCP child
started with `Q2_MCP_DEBUG=1`, listed the expected tools, and read the agent
catalog. No model call was made.

The relaunched API reported the new project root, and its chat, proposal, agent,
and research catalogs matched the pre-move snapshot. The desktop process ran
from this checkout. The final `uv run python scripts/check.py --check-format`
check passed in qtwo_bench after its tracked app source was removed.

The publication check also ran `npm run setup` from a clean source export,
without generated dependencies or sibling imports. That checkout built a graph
from the supplied synthetic pinned Git fixture through the Rust CLI. The output
passed the desktop graph and exact-node contracts without the research API.
The full app suite, native desktop checks, fresh MCP child, and environment-aware
launcher checks passed. Restarted services retained the existing saved catalogs.
