package knowledge

import (
	"fmt"
	"net/url"
	"strings"
	"unicode/utf8"

	"github.com/jeisenman/thesemantic/knowledge/lineagecheck"
)

// Identity retains separate source scope, entity, and optional column names.
type Identity struct {
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
	Column    string `json:"column,omitempty"`
}

// Source pins a declared source reference to reviewed bytes and a Git commit.
type Source struct {
	Repository string `json:"repository"`
	Path       string `json:"path"`
	Commit     string `json:"commit"`
	SHA256     string `json:"sha256"`
}

// Node is a typed desktop node with no generated or approved business meaning.
type Node struct {
	ID      Identity       `json:"id"`
	Job     *Job           `json:"job,omitempty"`
	Dataset *Dataset       `json:"dataset,omitempty"`
	Column  *Column        `json:"column,omitempty"`
	Facets  map[string]any `json:"facets"`
	Sources []Source       `json:"sources"`
}

// Job holds the source-declared DAG association.
type Job struct {
	DAG string `json:"dag"`
}

// Dataset holds source-declared keys and partition field.
type Dataset struct {
	Keys      []string `json:"keys"`
	Partition string   `json:"partition"`
}

// Column holds its verified or explicitly reviewed schema type and nullability.
type Column struct {
	Type     string `json:"type"`
	Nullable bool   `json:"nullable"`
}

// Edge is a declared directed relationship, never an inferred dependency.
type Edge struct {
	Source Identity `json:"source"`
	Target Identity `json:"target"`
	Kind   string   `json:"kind"`
}

// Graph matches the strict desktop lineage export contract.
type Graph struct {
	Nodes      []Node   `json:"nodes"`
	Edges      []Edge   `json:"edges"`
	Aliases    []any    `json:"aliases"`
	Unresolved []string `json:"unresolved"`
}

func validIdentity(value string) bool {
	return value != "" && value == strings.TrimSpace(value) && utf8.ValidString(value) && len(value) <= 4096
}

func escaped(value string) string {
	// Match encodeURIComponent used by the desktop's canonical nodePath.
	return strings.NewReplacer("+", "%20", "%21", "!", "%27", "'", "%28", "(", "%29", ")", "%2A", "*").Replace(url.QueryEscape(value))
}

// Project creates the existing desktop contract from a validated structural snapshot.
func Project(snapshot lineagecheck.Snapshot) (Graph, error) {
	if err := lineagecheck.ValidateSnapshot(snapshot); err != nil {
		return Graph{}, err
	}
	m := snapshot.Manifest
	namespace := "source-contract://" + url.PathEscape(m.Scope) + "/" + url.PathEscape(m.Profile)
	if !validIdentity(namespace) {
		return Graph{}, fmt.Errorf("scope/profile exceeds identity limits")
	}
	commits := map[string]string{}
	for _, repository := range m.Repositories {
		if len(repository.Name) > 128000 {
			return Graph{}, fmt.Errorf("repository name exceeds desktop limit")
		}
		commits[repository.Name] = repository.Commit
	}
	for _, dataset := range m.Datasets {
		for _, evidence := range dataset.Evidence {
			if len(evidence.Path) > 128000 {
				return Graph{}, fmt.Errorf("source path exceeds desktop limit")
			}
		}
		if dataset.Schema != nil && len(dataset.Schema.Evidence.Path) > 128000 {
			return Graph{}, fmt.Errorf("schema path exceeds desktop limit")
		}
	}
	for _, job := range m.Jobs {
		for _, evidence := range job.Evidence {
			if len(evidence.Path) > 128000 {
				return Graph{}, fmt.Errorf("source path exceeds desktop limit")
			}
		}
	}
	sources := func(items []lineagecheck.Evidence) []Source {
		result := []Source{}
		for _, item := range items {
			result = append(result, Source{item.Repository, item.Path, commits[item.Repository], item.SHA256})
		}
		return result
	}
	graph := Graph{Nodes: []Node{}, Edges: []Edge{}, Aliases: []any{}, Unresolved: append([]string{}, m.Unresolved...)}
	graph.Unresolved = append(graph.Unresolved, "Reviewed source contract scope only. Undeclared repositories, datasets, jobs, and runtime data equivalence have not been verified. Business meaning and SME approval are not supplied.")
	ids := map[string]Identity{}
	add := func(name, column string, source []Source) (int, error) {
		if !validIdentity(name) || (column != "" && !validIdentity(column)) {
			return 0, fmt.Errorf("entity/column exceeds canonical identity limits")
		}
		id := Identity{namespace, name, column}
		wire := escaped(namespace) + "/" + escaped(name) + "#" + escaped(column)
		if len(wire) > 8192 {
			return 0, fmt.Errorf("entity/column exceeds desktop encoded identity limit")
		}
		graph.Nodes = append(graph.Nodes, Node{ID: id, Facets: map[string]any{"meaning": map[string]any{}}, Sources: source})
		return len(graph.Nodes) - 1, nil
	}
	for _, dataset := range m.Datasets {
		evidence := append([]lineagecheck.Evidence{}, dataset.Evidence...)
		if dataset.Schema != nil {
			evidence = append(evidence, dataset.Schema.Evidence)
		}
		source := sources(evidence)
		i, err := add(dataset.ID, "", source)
		if err != nil {
			return Graph{}, err
		}
		ids[dataset.ID] = graph.Nodes[i].ID
		graph.Nodes[i].Dataset = &Dataset{append([]string{}, dataset.Keys...), dataset.Partition}
		for _, field := range dataset.Fields {
			if len(field.Type) > 128000 {
				return Graph{}, fmt.Errorf("column type exceeds desktop limit")
			}
			index, err := add(dataset.ID, field.Name, source)
			if err != nil {
				return Graph{}, err
			}
			graph.Nodes[index].Column = &Column{field.Type, field.Nullable}
			graph.Edges = append(graph.Edges, Edge{graph.Nodes[i].ID, graph.Nodes[index].ID, "contains"})
		}
	}
	for _, job := range m.Jobs {
		if len(job.DAG) > 128000 {
			return Graph{}, fmt.Errorf("DAG name exceeds desktop limit")
		}
		i, err := add(job.ID, "", sources(job.Evidence))
		if err != nil {
			return Graph{}, err
		}
		ids[job.ID] = graph.Nodes[i].ID
		graph.Nodes[i].Job = &Job{job.DAG}
	}
	for _, job := range m.Jobs {
		for _, input := range job.Inputs {
			graph.Edges = append(graph.Edges, Edge{ids[input.Dataset], ids[job.ID], "consumes"})
		}
		for _, output := range job.Outputs {
			graph.Edges = append(graph.Edges, Edge{ids[job.ID], ids[output], "produces"})
		}
		for _, before := range job.After {
			graph.Edges = append(graph.Edges, Edge{ids[before], ids[job.ID], "depends_on"})
		}
		for _, dependency := range job.Dependencies {
			for _, input := range dependency.Inputs {
				graph.Edges = append(graph.Edges, Edge{Identity{namespace, input.Dataset, input.Field}, Identity{namespace, dependency.Output.Dataset, dependency.Output.Field}, "column_dependency"})
			}
		}
	}
	if len(graph.Nodes) > 150000 || len(graph.Edges) > 500000 {
		return Graph{}, fmt.Errorf("projected graph exceeds desktop node/edge limits")
	}
	return graph, nil
}
