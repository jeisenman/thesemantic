# Build source-pinned lineage

The Rust CLI runs one deterministic, app-owned Go helper. It reads a reviewed
manifest and exact Git blobs. It does not execute Python, call a model, or copy
Researcher implementation code. Source repositories remain read-only.

Install/build with `node scripts/setup.mjs`. Alternatively build the helper with
`go build -o target/semantic-lineage-build ./tools/lineagebuild` and the CLI with
`cargo build --workspace`. Go 1.25 or newer is required.

Run:

```sh
./target/debug/researcher-codex knowledge build --config /absolute/config.json
```

The trusted host configuration uses absolute paths:

```json
{
  "manifest": "/absolute/reviewed-manifest.json",
  "roots": { "repository-name": "/absolute/read-only-source-checkout" },
  "output": "/absolute/semantic/var/knowledge/lineage.json"
}
```

Create the output parent directory first. Use an ignored runtime location
outside source checkouts. Output is written atomically after all checks pass.
Invalid inputs leave an existing output unchanged. No network source is used.

## Supported source contract

`lineagecheck/models.go` defines `q2-lineage-contract/v1`. The synthetic template
is `examples/knowledge/source-build/manifest.template.json`. Each repository
requires a full lowercase Git commit. Evidence requires a relative source path
and the exact blob SHA256. Configured roots must exactly match repositories.
The named scope and profile define the reviewed boundary.

Automatic extraction supports literal primitive PySpark `StructType` schemas in
a named class and `_schema_vN` method. Supported primitives are String, Boolean,
Double, Float, Long, Integer, Short, Byte, Timestamp, Date, and Binary types.
Nested, computed, inherited-only, mutated or otherwise unsupported schemas fail.
A reviewed explicit schema may be declared instead of requesting extraction.
No Python interpreter or Spark installation is needed.

Dataset keys, partitions, jobs, DAG references, order, consumed fields and
column dependencies are reviewed declarations. They are verified for source
digests and internal consistency, not discovered from arbitrary program logic.
Jobs must declare complete output-column dependencies within the selected scope.
Unresolved findings block a build. A successful scoped export does not prove
whole-repository coverage or runtime data equivalence.

The output uses the existing desktop graph contract. It includes typed dataset,
job and column nodes, declared edges, source commits and digests, and explicit
coverage limits. It supplies no generated meaning or SME approval. Set
`SEMANTIC_LINEAGE_SNAPSHOT` to the absolute output path to read it in desktop or
preview. Static definition freshness checks remain disabled.

## Synthetic example

Choose a new directory for synthetic inputs. This example creates a small Git
repository, pins its commit and source digest, and emits a config. It does not
read any existing application source.

```sh
mkdir -p var/knowledge
node examples/knowledge/source-build/prepare.mjs \
  /absolute/new-synthetic-fixture /absolute/semantic/var/knowledge/lineage.json
./target/debug/researcher-codex knowledge build \
  --config /absolute/new-synthetic-fixture/config.json
```

Tests build synthetic Git sources end to end, retain pinned behavior after
uncommitted changes, reject invalid source pins and unsupported extraction, and
check failure-before-publication. Run `go test ./knowledge/... ./tools/...`.
