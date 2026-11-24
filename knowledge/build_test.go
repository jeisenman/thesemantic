package knowledge

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/jeisenman/thesemantic/knowledge/lineagecheck"
)

type testFixture struct {
	config   string
	manifest string
	source   string
	output   string
	recipe   lineagecheck.Manifest
}

func git(t *testing.T, root string, args ...string) string {
	t.Helper()
	command := exec.Command("git", append([]string{"-c", "core.hooksPath=/dev/null", "-C", root}, args...)...)
	command.Env = append(os.Environ(), "GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_GLOBAL=/dev/null", "GIT_AUTHOR_NAME=Synthetic Fixture", "GIT_AUTHOR_EMAIL=fixture@example.invalid", "GIT_COMMITTER_NAME=Synthetic Fixture", "GIT_COMMITTER_EMAIL=fixture@example.invalid")
	content, err := command.CombinedOutput()
	if err != nil {
		t.Fatal("synthetic Git operation failed", err)
	}
	return strings.TrimSpace(string(content))
}

func writeJSON(t *testing.T, path string, value any) {
	t.Helper()
	content, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, content, 0o600); err != nil {
		t.Fatal(err)
	}
}

func fixture(t *testing.T) testFixture {
	t.Helper()
	root := t.TempDir()
	source := filepath.Join(root, "source")
	if err := os.Mkdir(source, 0o700); err != nil {
		t.Fatal(err)
	}
	content, err := os.ReadFile("../examples/knowledge/source-build/schema.py")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(source, "schema.py"), content, 0o600); err != nil {
		t.Fatal(err)
	}
	git(t, source, "init", "--quiet")
	git(t, source, "add", "schema.py")
	git(t, source, "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Synthetic schema")
	sum := sha256.Sum256(content)
	evidence := lineagecheck.Evidence{Repository: "synthetic", Path: "schema.py", SHA256: hex.EncodeToString(sum[:])}
	m := lineagecheck.Manifest{Format: lineagecheck.Format, Scope: "synthetic", Profile: "reviewed-literal", Repositories: []lineagecheck.Repository{{Name: "synthetic", Commit: git(t, source, "rev-parse", "HEAD")}}, Datasets: []lineagecheck.Dataset{
		{ID: "Input", Major: 1, Keys: []string{"ExampleKey"}, Schema: &lineagecheck.SchemaSource{Evidence: evidence, Class: "SyntheticMetadata", Major: 1}, Evidence: []lineagecheck.Evidence{evidence}},
		{ID: "Output", Major: 1, Fields: []lineagecheck.Field{{Name: "Value", Type: "DoubleType", Nullable: true}}, Evidence: []lineagecheck.Evidence{evidence}},
	}, Jobs: []lineagecheck.Job{{ID: "Copy", DAG: "synthetic-dag", Inputs: []lineagecheck.Input{{Dataset: "Input", Major: 1, Fields: []string{"ExampleValue"}, Keys: []string{"ExampleKey"}}}, Outputs: []string{"Output"}, ColumnsComplete: true, Dependencies: []lineagecheck.Dependency{{Output: lineagecheck.FieldRef{Dataset: "Output", Field: "Value"}, Inputs: []lineagecheck.FieldRef{{Dataset: "Input", Field: "ExampleValue"}}}}, Evidence: []lineagecheck.Evidence{evidence}, Replay: lineagecheck.Replay{Mode: "partition", WriteMode: "replace", ClientScope: "single_client"}}}}
	f := testFixture{filepath.Join(root, "config.json"), filepath.Join(root, "manifest.json"), source, filepath.Join(root, "lineage.json"), m}
	writeJSON(t, f.manifest, m)
	writeJSON(t, f.config, Config{Manifest: f.manifest, Roots: map[string]string{"synthetic": source}, Output: f.output})
	return f
}

func TestPinnedSourceBuildProducesDesktopGraph(t *testing.T) {
	f := fixture(t)
	if err := BuildConfig(context.Background(), f.config); err != nil {
		t.Fatal(err)
	}
	content, err := os.ReadFile(f.output)
	if err != nil {
		t.Fatal(err)
	}
	var graph Graph
	if err := json.Unmarshal(content, &graph); err != nil {
		t.Fatal(err)
	}
	if len(graph.Nodes) != 6 || len(graph.Edges) != 6 || len(graph.Unresolved) != 1 {
		t.Fatal("unexpected desktop projection shape")
	}
	jobs, columns, datasets := 0, 0, 0
	for _, node := range graph.Nodes {
		if node.Job != nil {
			jobs++
		}
		if node.Dataset != nil {
			datasets++
		}
		if node.Column != nil {
			columns++
		}
		if node.ID.Namespace != "source-contract://synthetic/reviewed-literal" || len(node.Sources) == 0 || node.Sources[0].Commit != f.recipe.Repositories[0].Commit {
			t.Fatal("source evidence lost")
		}
		meaning, ok := node.Facets["meaning"].(map[string]any)
		if !ok || len(meaning) != 0 {
			t.Fatal("invented meaning")
		}
	}
	if jobs != 1 || columns != 3 || datasets != 2 {
		t.Fatal("node kinds lost")
	}
	if err := os.WriteFile(filepath.Join(f.source, "schema.py"), []byte("uncommitted invalid schema"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := BuildConfig(context.Background(), f.config); err != nil {
		t.Fatal(err)
	}
	again, _ := os.ReadFile(f.output)
	if !bytes.Equal(content, again) {
		t.Fatal("unpinned working tree changed output")
	}
}

func TestInvalidSourceContractsLeaveOutputUnchanged(t *testing.T) {
	for _, kind := range []string{"digest", "commit", "unknown", "incomplete", "computed", "duplicate", "collision", "long_identity", "long_type", "long_repository", "unknown_field", "wrong_roots", "source_output", "oversized"} {
		t.Run(kind, func(t *testing.T) {
			f := fixture(t)
			const sentinel = "previous export\n"
			if err := os.WriteFile(f.output, []byte(sentinel), 0o600); err != nil {
				t.Fatal(err)
			}
			switch kind {
			case "digest":
				f.recipe.Datasets[0].Evidence[0].SHA256 = strings.Repeat("0", 64)
			case "commit":
				f.recipe.Repositories[0].Commit = strings.Repeat("0", 40)
			case "unknown":
				f.recipe.Unresolved = []string{"Unknown source scope"}
			case "incomplete":
				f.recipe.Jobs[0].ColumnsComplete = false
			case "computed":
				content := []byte("class SyntheticMetadata:\n    def _schema_v1(self):\n        return make_schema()\n")
				if err := os.WriteFile(filepath.Join(f.source, "schema.py"), content, 0o600); err != nil {
					t.Fatal(err)
				}
				git(t, f.source, "add", "schema.py")
				git(t, f.source, "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Unsupported synthetic schema")
				f.recipe.Repositories[0].Commit = git(t, f.source, "rev-parse", "HEAD")
				sum := sha256.Sum256(content)
				digest := hex.EncodeToString(sum[:])
				for i := range f.recipe.Datasets {
					f.recipe.Datasets[i].Evidence[0].SHA256 = digest
				}
				f.recipe.Datasets[0].Schema.Evidence.SHA256 = digest
				f.recipe.Jobs[0].Evidence[0].SHA256 = digest
			case "duplicate":
				f.recipe.Datasets = append(f.recipe.Datasets, f.recipe.Datasets[1])
			case "collision":
				f.recipe.Jobs[0].ID = f.recipe.Datasets[0].ID
			case "long_identity":
				f.recipe.Datasets[1].Fields[0].Name = "Column" + strings.Repeat(" %", 1800)
				f.recipe.Jobs[0].Dependencies[0].Output.Field = f.recipe.Datasets[1].Fields[0].Name
			case "long_type":
				f.recipe.Datasets[1].Fields[0].Type = strings.Repeat("X", 128001)
			case "long_repository":
				name := strings.Repeat("R", 128001)
				f.recipe.Repositories[0].Name = name
				for i := range f.recipe.Datasets {
					f.recipe.Datasets[i].Evidence[0].Repository = name
				}
				f.recipe.Datasets[0].Schema.Evidence.Repository = name
				f.recipe.Jobs[0].Evidence[0].Repository = name
				writeJSON(t, f.config, Config{Manifest: f.manifest, Roots: map[string]string{name: f.source}, Output: f.output})
			case "wrong_roots":
				writeJSON(t, f.config, Config{Manifest: f.manifest, Roots: map[string]string{"different": f.source}, Output: f.output})
			case "source_output":
				writeJSON(t, f.config, Config{Manifest: f.manifest, Roots: map[string]string{"synthetic": f.source}, Output: filepath.Join(f.source, "output.json")})
			}
			writeJSON(t, f.manifest, f.recipe)
			if kind == "unknown_field" {
				if err := os.WriteFile(f.manifest, []byte(`{"unexpected":true}`), 0o600); err != nil {
					t.Fatal(err)
				}
			}
			if kind == "oversized" {
				file, err := os.OpenFile(f.manifest, os.O_WRONLY, 0o600)
				if err != nil {
					t.Fatal(err)
				}
				err = file.Truncate((16 << 20) + 1)
				file.Close()
				if err != nil {
					t.Fatal(err)
				}
			}
			if err := BuildConfig(context.Background(), f.config); err == nil {
				t.Fatal("invalid contract accepted")
			}
			content, _ := os.ReadFile(f.output)
			if string(content) != sentinel {
				t.Fatal("failure changed prior export")
			}
		})
	}
}

func TestResolvedOutputCannotAliasSourcesOrInputs(t *testing.T) {
	for _, kind := range []string{"source_parent", "source_root_alias", "config_alias", "manifest_alias"} {
		t.Run(kind, func(t *testing.T) {
			f := fixture(t)
			root := filepath.Dir(f.config)
			config := Config{Manifest: f.manifest, Roots: map[string]string{"synthetic": f.source}, Output: f.output}
			input := filepath.Join(f.source, "schema.py")
			switch kind {
			case "source_parent":
				alias := filepath.Join(root, "alias")
				if err := os.Symlink(f.source, alias); err != nil {
					t.Fatal(err)
				}
				config.Output = filepath.Join(alias, "schema.py")
			case "source_root_alias":
				alias := filepath.Join(root, "alias")
				if err := os.Symlink(f.source, alias); err != nil {
					t.Fatal(err)
				}
				config.Roots["synthetic"] = alias
				config.Output = input
			case "config_alias", "manifest_alias":
				alias := filepath.Join(t.TempDir(), "alias")
				if err := os.Symlink(root, alias); err != nil {
					t.Fatal(err)
				}
				input = f.config
				if kind == "manifest_alias" {
					input = f.manifest
				}
				config.Output = filepath.Join(alias, filepath.Base(input))
			}
			writeJSON(t, f.config, config)
			before, err := os.ReadFile(input)
			if err != nil {
				t.Fatal(err)
			}
			if err := BuildConfig(context.Background(), f.config); err == nil {
				t.Fatal("aliased output accepted")
			}
			after, err := os.ReadFile(input)
			if err != nil || !bytes.Equal(before, after) {
				t.Fatal("failed build changed input")
			}
		})
	}
}

func TestBuildRejectsCancelledAndRelativeConfig(t *testing.T) {
	f := fixture(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := BuildConfig(ctx, f.config); err == nil {
		t.Fatal("cancelled build accepted")
	}
	if err := BuildConfig(context.Background(), "relative.json"); err == nil {
		t.Fatal("relative config accepted")
	}
}
