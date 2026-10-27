# Changelog

All notable changes to ExtendedGraph_advancedCC. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Based on Extended Graph 2.7.6 (upstream commit `c1aab34`).

## [1.16.0] - 2026-10-27
### Changed
- Node Repartition: Obsidian's native "Node size" slider is hidden and kept at its default (1), so node size is
  controlled only by Node Weight's "Base node size" (also when a graph state saved another value).

## [1.15.0] - 2026-10-27
### Changed
- Plugin renamed **ExtendedGraph_advancedCC** (id `extendedgraph-advancedcc`), matching the repository name.

## [1.14.0] - 2026-10-27
### Added
- Node Weight: an editable name next to Variable X and Variable Y, to label what each variable stands for.

### Changed
- Node Weight: a, b, c shown in three reds and X, Y in two blues wherever they appear.
- Node Weight: "Emphasis factor (c)" group, in this order: Node contrast (c), Base node size, Min node size,
  Max node size.
- Node Weight: the value next to each slider label is removed (shown while dragging); sliders vertically centered.

## [1.13.0] - 2026-10-27
First public release on GitHub.

### Added
- **Node Weight**: node size from `size = clamp(base × (1 + a·X + b·Y)^c, min, max)`; X and Y are lists of
  search queries counted on the whole vault; saved in graph states; on/off switch in the section title.
- **Node level**: local-graph options (depth, incoming, outgoing, neighbor links) on the global graph,
  centered on the open note.
- **Filters**: "+ Add query" rows (AND / OR) under the search box, evaluated by Obsidian's own engine.
- Obsidian search syntax for our query boxes (groups, OR, NOT, quotes, regex, `file:`, `path:`, `tag:`,
  properties) with a "Search options" popup.
- Graph panel layout: Filters · Node Color · Node Repartition (Display + Forces) · Node Weight · Node level ·
  Extended Graph · Options; equal top/bottom margin.
- Extended Graph section: on/off switch in its title, compact options (Settings → Other settings).
- Settings page: version badge, compact mode with pins, "Other settings" section, optional debug log.
