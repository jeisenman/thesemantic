# Local Codex plugin

The local plugin exposes The Semantic's Rust MCP through stdio and includes the
existing `research-run` skill. It is a development adapter for this checkout.
It does not start the API, make model calls during installation, or publish a
public marketplace package.

Build the app first. Then prepare the ignored local marketplace:

```sh
npm run build:runtime
cargo build -p researcher-codex
npm run plugin:prepare
```

If the API uses another loopback port, pass its origin with
`npm run plugin:prepare -- --api-url http://127.0.0.1:5057`. The generated
marketplace is `var/codex-marketplace`. It stores only the absolute checkout
path and API origin. The launcher reads the checkout's `.env` into its process
when present; it does not copy or print that file.

Add and install it with Codex CLI:

```sh
codex plugin marketplace add /absolute/path/to/semantic/var/codex-marketplace
codex plugin add semantic@semantic-local
codex plugin list --marketplace semantic-local --json
```

The plugin starts the built MCP process when Codex loads it. Start the local
Semantic API separately when using API-backed tools. Rebuild the MCP and
recreate the plugin process after changing MCP code or configuration.

Run its isolated checks with `npm run test:plugin`.
