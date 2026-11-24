// Package knowledge builds bounded, source-pinned desktop knowledge exports.
package knowledge

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/jeisenman/thesemantic/knowledge/lineagecheck"
)

// Config supplies trusted host paths and reviewed source checkout roots.
type Config struct {
	Manifest string            `json:"manifest"`
	Roots    map[string]string `json:"roots"`
	Output   string            `json:"output"`
}

func readDocument(path string) ([]byte, error) {
	if !filepath.IsAbs(path) {
		return nil, fmt.Errorf("use an absolute input file path")
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open configured input file: %w", err)
	}
	defer file.Close()
	stat, err := file.Stat()
	if err != nil || !stat.Mode().IsRegular() || stat.Size() > 16<<20 {
		return nil, fmt.Errorf("input must be a regular file no larger than 16 MiB")
	}
	content, err := io.ReadAll(io.LimitReader(file, (16<<20)+1))
	if err != nil || len(content) > 16<<20 {
		return nil, fmt.Errorf("cannot read bounded input file")
	}
	return content, nil
}

// BuildConfig verifies a reviewed manifest and atomically writes its desktop graph.
// Existing output remains unchanged if source validation or projection fails.
func BuildConfig(ctx context.Context, path string) error {
	content, err := readDocument(path)
	if err != nil {
		return err
	}
	var config Config
	if err := lineagecheck.Decode(content, &config); err != nil {
		return err
	}
	if !filepath.IsAbs(config.Manifest) || !filepath.IsAbs(config.Output) || len(config.Roots) == 0 {
		return fmt.Errorf("config requires absolute manifest/output paths and explicit source roots")
	}
	parent, err := filepath.EvalSymlinks(filepath.Dir(config.Output))
	if err != nil {
		return fmt.Errorf("output requires an existing trusted parent directory")
	}
	config.Output = filepath.Join(parent, filepath.Base(config.Output))
	for _, input := range []string{path, config.Manifest} {
		resolved, err := filepath.EvalSymlinks(input)
		if err != nil {
			return fmt.Errorf("config and manifest must be accessible files")
		}
		if resolved == config.Output {
			return fmt.Errorf("output cannot replace a config or manifest")
		}
	}
	if filepath.Clean(config.Output) == filepath.Clean(path) || filepath.Clean(config.Output) == filepath.Clean(config.Manifest) {
		return fmt.Errorf("output cannot replace a config or manifest")
	}
	for name, root := range config.Roots {
		if name == "" || !filepath.IsAbs(root) {
			return fmt.Errorf("source roots require names and absolute paths")
		}
		info, err := os.Stat(root)
		if err != nil || !info.IsDir() {
			return fmt.Errorf("source checkout root must be an accessible directory")
		}
		root, err = filepath.EvalSymlinks(root)
		if err != nil {
			return fmt.Errorf("cannot resolve trusted source root")
		}
		config.Roots[name] = root
		rel, err := filepath.Rel(root, config.Output)
		if err != nil || (rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))) {
			return fmt.Errorf("output must be outside source checkouts")
		}
	}
	content, err = readDocument(config.Manifest)
	if err != nil {
		return err
	}
	var manifest lineagecheck.Manifest
	if err := lineagecheck.Decode(content, &manifest); err != nil {
		return err
	}
	if len(manifest.Unresolved) != 0 {
		return fmt.Errorf("reviewed manifest has unresolved findings; resolve them before building")
	}
	if len(config.Roots) != len(manifest.Repositories) {
		return fmt.Errorf("source roots must exactly match manifest repositories")
	}
	for _, job := range manifest.Jobs {
		if !job.ColumnsComplete {
			return fmt.Errorf("reviewed jobs must declare complete output-column dependencies for this scope")
		}
	}
	snapshot, err := lineagecheck.Build(ctx, manifest, config.Roots)
	if err != nil {
		return err
	}
	graph, err := Project(snapshot)
	if err != nil {
		return err
	}
	content, err = json.MarshalIndent(graph, "", "  ")
	if err != nil {
		return err
	}
	if len(content) > 32_000_000 {
		return fmt.Errorf("projected graph exceeds desktop 32 MB limit")
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	return publish(config.Output, append(content, '\n'))
}

func publish(path string, content []byte) error {
	file, err := os.CreateTemp(filepath.Dir(path), ".semantic-lineage-*")
	if err != nil {
		return fmt.Errorf("create output in an existing trusted directory: %w", err)
	}
	defer os.Remove(file.Name())
	defer file.Close()
	if _, err := file.Write(content); err != nil {
		return err
	}
	if err := file.Sync(); err != nil {
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	return os.Rename(file.Name(), path)
}
