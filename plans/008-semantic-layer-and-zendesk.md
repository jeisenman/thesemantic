# Semantic knowledge sources

## Source boundary

The Semantic Layer contains Lineage, Zendesk, Definitions, Repositories, and
Research. Each source keeps its own evidence and limits. Source documentation
is not proof of a pipeline effect, and the app does not invent article-to-node
matches. See [connections](../docs/connections.md) for current setup.

Lineage accepts the graph contract in
`apps/desktop/src/lineage-contracts.ts`. Configure an approved local export with
`SEMANTIC_LINEAGE_SNAPSHOT`, or connect an existing loopback HTTP source with
`SEMANTIC_LINEAGE_URL`. A local export must not silently fall back to HTTP when
it is invalid. Definition currency is explicitly unavailable for static exports.

Earlier instructions referred to a source-service entry point in qtwo_bench
that is no longer present. That command is not a supported installation step.
This standalone app has no qtwo_bench package or source-tree dependency.
It does not import protected Researcher implementation code.

The app-owned [source builder](../knowledge/README.md) reads pinned local Git
checkouts and a reviewed manifest to produce the typed graph. It supports a
bounded structural extraction profile, reports partial coverage, and stops
when it cannot prove a required extraction or column dependency. It does not
execute source Python, call models, or generate business meaning.

## Zendesk

The snapshot adapter reads a trusted export directory containing
`manifest.json` and `articles-normalized.json`. The existing dated corpus stays
outside Git. Configure `SEMANTIC_ZENDESK_SNAPSHOT` or the ignored
`var/zendesk-snapshot` symlink to use it.

The public Help Center mode reads only public articles from its fixed HTTPS
origin. It is separate from the historical export and does not access private
support tickets. Article HTML becomes inert text; only validated article links
can open in the system browser. TLS checks remain enabled.

## Desktop behavior

Catalog and Graph share one scoped graph, selection, and search. Graph display
caps remain explicit. Source commits, absent definitions, stale evidence, and
coverage gaps remain visible. Graph fit, zoom, pan, and expansion operate on the
displayed graph; they do not claim whole-repository coverage.

Definitions exposes supplied SME text and the existing local draft editor.
Drafts persist in MLflow and never change an approved upstream definition.
Repositories displays supplied source references and states that source search
is disconnected. Research opens saved records without invoking a model.

## Validation

Desktop tests cover strict graph and exact-node contracts, bounded reads,
invalid origins, missing evidence, local export errors, snapshot validation,
article text conversion, graph viewport behavior, and source navigation.
Native fixture checks use the actual Electron main process and preload. They
make no paid model calls and use no production queries. Existing historical
private execution references stay in local records, outside public notes.
