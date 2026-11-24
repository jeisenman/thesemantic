# Connections and configuration

Run `npm run setup` after cloning. It installs locked dependencies, builds the
application, and creates ignored local configuration without replacing existing
settings. See [setup](setup.md) for prerequisites and launch commands.

Use `npm run api`, `npm run desktop`, and `npm run researcher` to load the local
`.env`. Direct `uv`,
Electron, or Rust commands use their exported process environment instead.
Credentials belong in the local environment or the provider's own login store.

## Desktop screens

Open **Connections** for setup guidance, readiness, check scope, and the last
refresh time. Open **Integrations** for the endpoint and transport inventory.
Search and status filters apply to the current snapshot. Refresh performs one
bounded host read; it does not start providers or run a model.

The API health check verifies access to its configured MLflow experiment.
Local source checks inspect filesystem metadata only. Native Codex login,
client plugin installation, model access, source contents, and graph freshness
remain explicitly unchecked on these screens. Endpoint displays contain only
credential-free origins. Host-local paths and request details stay hidden.
These screens do not edit settings or reveal credentials.

Install the MCP and research skill through the [local Codex plugin](plugin.md).

## Connection map

| Component | Connection | Ownership and behavior |
| --- | --- | --- |
| Research storage | `MLFLOW_TRACKING_URI` | Existing MLflow API; Semantic uses its public client operations. |
| Saved catalog | `MLFLOW_EXPERIMENT_NAME` | Retain the existing name to keep reading saved records. |
| Research API | Loopback port 5056 | This repository's Python service; owns chat, drafts, documents, sessions, and research routes. |
| Model access | `CODEX_HOME`, optional `CODEX_BINARY` | Native Codex login; credentials are never extracted. |
| Lineage export | `SEMANTIC_LINEAGE_SNAPSHOT` | Optional absolute path to a typed graph export; read locally by the trusted host. |
| Lineage service | `SEMANTIC_LINEAGE_URL` | Existing loopback HTTP source, used when no local graph export is configured. |
| Zendesk export | `SEMANTIC_ZENDESK_SNAPSHOT` | Trusted directory with the manifest and normalized articles. |
| Research MCP | `.codex/config.toml` | Generated local configuration for the built Rust executable. |

The local graph export takes precedence over the optional lineage service. A
configured export that is invalid or unavailable is an error; it never silently
switches to another source. The graph format is defined by
`apps/desktop/src/lineage-contracts.ts`. Static exports cannot prove that a
definition is current, so that check remains explicitly unavailable.

## Knowledge bases

Lineage can build a graph from pinned local sources with
`researcher-codex knowledge build --config /absolute/path/to/build.json`.
The reviewed manifest, checkout roots, full commits, and output path must be
explicit. The app-owned Go helper performs structural extraction without
executing Python or invoking a model. Unsupported extraction and unresolved
column dependencies stop publication. See [builder](../knowledge/README.md)
for the supported literal schema profile, synthetic example, and limits.

Lineage can also read an approved supplied graph. Definitions reads its supplied SME facets and
stores versioned local drafts in MLflow. Generated meaning remains separate from
SME text. Neither an export nor a local edit grants upstream approval.

Zendesk reads `manifest.json` and `articles-normalized.json` from the trusted
export directory. Its reader validates origin, locale, article identity, dates,
counts, duplicate identities, file limits, and inert text conversion. Configure
an absolute directory path, or create the ignored `var/zendesk-snapshot` symlink.
The separate public Help Center mode reads the fixed public origin only. It does
not imply access to private support tickets or to the full historical corpus.

Research reads this repository's saved MLflow records. The app includes its
research API, Rust execution bridge, TypeScript Agents SDK runtime, Hypothesis
Agent definition, and research skill. An explicit accepted plan is still required
for experiment execution.

Repositories lists repository references supplied by the graph. Checkout search
and arbitrary source access are not connected. The UI states that limit. A
repository label does not grant access or prove that its source was inspected.

## Configuration limits

The desktop and sandboxed page currently use the default API port. Keep the API
on port 5056 when using the desktop. Changing `SEMANTIC_API_URL` configures the
CLI/MCP client; it does not reconfigure all desktop or iframe origins.

Lineage HTTP connections accept credential-free loopback HTTP origins. Zendesk
public reads accept the fixed HTTPS Help Center origin. Renderer messages cannot
supply arbitrary local paths, hosts, credentials, or shell commands.

The repository contains the structural builder, app code, examples, lockfiles,
and configuration templates.
It does not contain provider credentials, private source checkouts, saved
research records, historical exports, or generated environments. Back up those
external stores separately. See [protocol](protocol.md) for the wire contracts.
