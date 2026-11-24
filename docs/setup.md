# Fresh checkout setup

Install Node.js 24 or newer with npm, Go 1.25 or newer, Rust with Cargo,
Python 3.11 or newer, `uv`, and the managed Codex runtime used by your native
Codex login. Git is
required for cloning and repository checks. macOS is required for the documented
LaunchAgent integration; other hosts can use a manually started MLflow server.

Run setup from the repository root:

```sh
npm run setup
```

Setup creates ignored `.env` and `.codex/config.toml` files only when they do not
exist. The Codex file uses the current checkout's absolute Rust executable path.
Setup syncs locked uv and npm dependencies, builds the Rust workspace, and builds
the app-owned Go structural lineage helper, then builds the Rust workspace and
desktop app. The Go helper is an internal bounded build tool called by the Rust
`researcher-codex knowledge build` command; the user-facing CLI remains Rust.
Use `npm run setup -- --configure-only` to create the local
files without installing or building. Unknown options are errors. Review `.env`
before starting services. It is local configuration and must not be committed.

The API and desktop commands load `.env` into their child process environment
without printing its values:

```sh
npm run api
npm run desktop
```

To start the Rust research chat with `.env` loaded, use:

```sh
npm run researcher -- --check
```

Arguments after `--` are passed to `researcher-codex chat`. The launcher uses
the Rust executable built in this clone. API and desktop launchers reject extra
arguments. Direct calls to `target/debug/researcher-codex` do not load `.env`;
export settings in the shell first when calling it directly:

```sh
set -a
. ./.env
set +a
./target/debug/researcher-codex chat
```

Keep the API running while using the desktop. The API listens on port 5056.
Desktop startup retains the workspace start command, which builds before it
opens Electron. Codex must be logged in through the normal `codex` command. The
app uses that local Codex installation and its existing `~/.codex` login; setup
does not copy credentials or authenticate for you.

## MLflow

The default tracking server is `http://127.0.0.1:5055`. Setup and the API/desktop
commands do not start, stop, or restart it. Reuse the shared MLflow service when it is
available. For a portable local bootstrap, install the server's locked Python
dependencies with `uv sync --project server`, then start MLflow manually in a
separate terminal:

```sh
mkdir -p var/mlflow/artifacts
uv run --project server mlflow server --host 127.0.0.1 --port 5055 \
  --backend-store-uri sqlite:///var/mlflow/backend.db \
  --artifacts-destination "$PWD/var/mlflow/artifacts"
```

Keep this service running while the API uses it. Set `MLFLOW_TRACKING_URI` in
`.env` only when the approved tracking server uses another address.
The interactive `rc` launcher can start the existing macOS MLflow LaunchAgent
if the default endpoint is unavailable. It does not install that service. The
manual command above is for a new machine with no listener on port 5055.

## Optional integrations

`SEMANTIC_LINEAGE_URL` selects a trusted existing lineage HTTP endpoint. Leave
it unset to use the local default. Semantic reads from the external service; it
does not start or replace that service.

To read an approved graph file without that service, set
`SEMANTIC_LINEAGE_SNAPSHOT` to an absolute JSON file path. For an isolated format
example, use the absolute path to `examples/knowledge/lineage.json` in this clone.
That example contains synthetic data. A configured invalid file fails without
switching to HTTP. See [connections](connections.md) for contracts and limits.

The optional Zendesk integration reads an existing export directory. Leave
`SEMANTIC_ZENDESK_SNAPSHOT` unset to keep using the ignored
`var/zendesk-snapshot` symlink. To use another approved local export, put its
absolute directory path in `.env`. Do not commit customer exports.

## Interactive Codex alias

After setup and build, add the Node wrapper alias to your shell startup file.
Replace the example path with the clone path on your computer:

```sh
alias rc='npm --prefix /path/to/semantic run researcher --'
```

Start a new shell and run `rc`. This opens the app's interactive Codex session
and loads that clone's ignored `.env` file.
