# Local Semantic plugin

This adapter exposes the installed checkout's Rust MCP over stdio. `plugin:prepare`
copies this source and the existing research-run skill into an ignored local
marketplace and writes only the application root and loopback API origin to
`installation.json`. The launcher reads the local `.env` into its own process
without copying or logging it, then replaces itself with the Rust MCP child.
Keep stdout reserved for MCP protocol traffic. Do not add credentials, app IDs,
remote MCP endpoints, backend startup, or renderer operations here.
