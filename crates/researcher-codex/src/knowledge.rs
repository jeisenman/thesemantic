use anyhow::{Context, Result};
use clap::Subcommand;
use serde_json::Value;
use std::{
    path::PathBuf,
    process::Command,
    time::{Duration, Instant},
};

/// Deterministic knowledge operations use reviewed local sources only.
#[derive(Subcommand)]
pub enum Action {
    Build {
        #[arg(long)]
        config: PathBuf,
    },
}

/// Invoke the installed app-owned helper with bounded output and lifetime.
pub fn run(action: Action) -> Result<Value> {
    let Action::Build { config } = action;
    let config = config
        .canonicalize()
        .context("source-build config must exist")?;
    let binary = std::env::current_exe()?
        .parent()
        .and_then(|parent| parent.parent())
        .context("cannot locate source-build helper")?
        .join("semantic-lineage-build");
    anyhow::ensure!(
        binary.is_file(),
        "Source-build helper is missing. Run node scripts/setup.mjs."
    );
    let mut command = Command::new(binary);
    command.arg("--config").arg(config);
    let output = crate::process::execute(
        &mut command,
        Instant::now() + Duration::from_secs(310),
        true,
    )?;
    anyhow::ensure!(!output.timed_out, "source build exceeded its time limit");
    let result: Value =
        serde_json::from_slice(&output.stdout).context("source build returned invalid status")?;
    if !output.success {
        anyhow::bail!(
            "{}",
            result["error"]
                .as_str()
                .unwrap_or("Source build failed. Check the reviewed manifest and source roots.")
        );
    }
    anyhow::ensure!(
        result["status"].as_str() == Some("Built reviewed source lineage export."),
        "source build returned an unexpected status"
    );
    Ok(result)
}
