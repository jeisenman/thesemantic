# Reviewed structural contracts

This package is an app-owned adaptation of qtwo_bench's reviewed structural
builder. It depends on the Go standard library only. No query server, snapshot
store, PR checker, backfill tool, or production manifest was copied.

`models.go` declares the versioned reviewed contract. `validate.go` rejects
invalid references, evidence, versions, cycles and incomplete column claims.
`schema.go` reads restricted primitive literal PySpark schemas without execution.
`build.go` reads exact Git blobs and verifies their SHA256 before extraction.
Source operations are read-only and have a 30-second deadline and 16 MiB limit.

The parent knowledge package owns configuration, unsupported/unknown gates,
desktop projection, and atomic publication. Changes must retain fail-closed
behavior. Synthetic end-to-end tests live in the parent package.
