// Command lineagebuild is an internal deterministic source-build helper.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/jeisenman/thesemantic/knowledge"
)

func main() {
	config := flag.String("config", "", "absolute trusted source-build configuration path")
	flag.Parse()
	if *config == "" || flag.NArg() != 0 {
		fmt.Println(`{"error":"Specify --config with a trusted source-build configuration file."}`)
		os.Exit(1)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	if err := knowledge.BuildConfig(ctx, *config); err != nil {
		// Error categories describe the contract failure; source file contents are never printed.
		content, _ := json.Marshal(map[string]string{"error": err.Error()})
		fmt.Println(string(content))
		os.Exit(1)
	}
	fmt.Println(`{"status":"Built reviewed source lineage export."}`)
}
