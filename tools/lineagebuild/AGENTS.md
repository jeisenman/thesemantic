# Internal lineage build helper

This Go helper is called by the Rust `researcher-codex knowledge build` command.
It accepts `--config`, invokes the knowledge package once with a five-minute
deadline, and prints a bounded plain-language status. It is not an MCP or HTTP
service. It never calls a model or reads credentials.

Build with `go build -o target/semantic-lineage-build ./tools/lineagebuild`.
The Rust entrypoint controls process output and lifetime. Source internals stay
inside the knowledge package. Never print source payloads or internal metadata.
