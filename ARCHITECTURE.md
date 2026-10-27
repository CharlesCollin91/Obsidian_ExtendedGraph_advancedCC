# Architecture — ExtendedGraph_advancedCC

ExtendedGraph_advancedCC is a fork of [Extended Graph](https://github.com/ElsaTam/obsidian-extended-graph) (ElsaTam).
Extended Graph hooks Obsidian's private core graph (renderer, engine, nodes) through JavaScript proxies.
ExtendedGraph_advancedCC keeps all of it and adds its own layer, kept **separate** so upstream updates can be merged.

## Design decisions
- **All our code lives in `src/cc/`.** Upstream files only get a few one-line hooks, each marked `// [CC]`
  (search for `[CC]` to find every touch point). Merging a new Extended Graph version = keep those lines.
- **Own settings file**: `cc-settings.json` in the plugin folder (Extended Graph keeps `data.json`).
- **Pure core, thin UI**: computations (`computeNodeFactor`, `applyDepthFilter`, `CCQuery`, `composeQuery`)
  have no Obsidian UI and are tested outside Obsidian.
- **Obsidian search syntax** is re-implemented (`CCQuery`) because Obsidian's search engine is private.
  The Filters rows instead hand the composed query to Obsidian's own engine.
- **Node sizes are counted on the whole vault** (metadata cache), not on the filtered graph.

## Files (`src/cc/`)
| File | Role |
|---|---|
| `ccSettings.ts` | `CCSettings`: load/save `cc-settings.json`, migration of older formats |
| `ccTypes.ts` | small structural types for the private Obsidian / Extended Graph members we touch |
| `ccLogger.ts` | `CCLogger`: optional debug log (off by default), one file per session |
| `ccCommands.ts` | `addCCCommands`: two debug-log commands |
| `ccBadge.ts` | `addCCVersionBadge`: version + compact-mode switch at the top of the settings page |
| `ccCompact.ts` | `CCCompact`: compact mode and pins of the settings page |
| `ccExtendedGraphPanel.ts` | Extended Graph section (rename, title switch, `egShow` compact options), `addCCOtherSettings` |
| `ccPanel.ts` | `addHeaderToggle`, `equalizePanelMargins`, `renameSection` |
| `ccPanelLayout.ts` | `applyPanelLayout` (order, renames, Display + Forces merged), `CCOptionsSection` |
| `ccQuery.ts` | `CCQuery` / `CCQueryList`: Obsidian search syntax (lexer + recursive-descent parser) |
| `ccQuerySuggest.ts` | `CCQuerySuggest`: "Search options" popup for query boxes |
| `ccNodeFactor.ts` | Node Weight core: `computeNodeFactor`, `nodeFactorSize`, `CCNodeFactor` (cache, states) |
| `ccNodeFactorUI.ts` | Node Weight panel section (`CCNodeFactorSection`), `registerNodeFactorEvents` |
| `ccOptionCC.ts` | Node level: `applyDepthFilter` (BFS), `CCOptionCC`, `CCOptionCCSection`, `registerOptionCCEvents` |
| `ccFilterRows.ts` | Filters "+ Add query": `composeQuery`, `CCFilterRows` (wraps `engine.updateSearch` / `getOptions`) |

## Hooks in upstream files (`// [CC]`)
| Upstream file | What the hook does |
|---|---|
| `src/main.ts` | init logger, settings, Node Weight, Node level; commands; cleanup on unload |
| `src/settings/settingTab.ts` | badge, compact-mode marks, "Other settings" section |
| `src/ui/graphControl/graphControl.ts` | creates our panel sections, layout, filter rows; follows plugin enable/disable |
| `src/ui/graphControl/GCOptions.ts` | `egShow()` per option (compact options) |
| `src/graph/extendedElements/extendedGraphNode.ts` | node size hook (`CCNodeFactor.sizeFor`) |
| `src/graph/graphEventsDispatcher.ts` | Node level filter on the graph data (`CCOptionCC.filter`) |
| `src/states/*.ts` | Node Weight saved in / restored from graph states (`ccNodeFactor` key) |

## Pipelines
```
Node Weight:  metadataCache links ──► neighbors (both directions) ──► X, Y per note (queries)
              ──► W = a·X + b·Y ──► size = clamp(base·(1+W)^c, min, max) ──► node.getSize() hook
Node level:   graph data (after search) ──► BFS from the open note (depth, in/out) ──► kept nodes/links
Filters rows: user search + rows ──► composeQuery ──► Obsidian engine.updateSearch (search box unchanged)
```

## Where to start for…
| Goal | Start in |
|---|---|
| A new term in the Node Weight formula | `computeNodeFactor`, `nodeFactorSize` (`ccNodeFactor.ts`) |
| Query syntax | `CCQuery` (`ccQuery.ts`) |
| Panel order / names | `applyPanelLayout` (`ccPanelLayout.ts`) |
| A new setting | `CCSettingsData` / `complete` (`ccSettings.ts`), UI in `addCCOtherSettings` |
| Merging a new Extended Graph version | the `// [CC]` lines listed above |
