# GraphView_CC

<br>

**The plugin** : An [Obsidian](https://obsidian.md) plugin that pushes the core graph view further. It is a fork of [Extended Graph](https://github.com/ElsaTam/obsidian-extended-graph) by ElsaTam, with a reorganized graph panel and new ways to read your notes' hierarchy.

<br>

**What it does** :
- **Node Weight**: sizes nodes with your own formula, from the notes linked to them (`NodeWeight = (a·X + b·Y)·c`), with X and Y defined by search queries.
- **Node level**: brings the local-graph options (depth, incoming, outgoing and neighbor links) to the global graph, centered on the open note.
- **Filters**: "+ Add query" rows under the search box, combined with AND / OR.
- A cleaner panel: Filters · Node Color · Node Repartition · Node Weight · Node level · Extended Graph · Options, with on/off switches in the section titles, plus a compact mode for the settings page.

**Actual Plugin Version** : 1.13.0 <br>
**License** : [GPL-3.0-only](LICENSE)

## Requirements
Obsidian 1.7 or later, desktop only. No extra plugin needed. Do not enable it together with Extended Graph in the same vault: both take over the same graph view.

## Install
1. In Obsidian: Settings → Community plugins → Browse → search **GraphView CC** → Install → Enable.
2. Open the graph view: the GraphView CC sections are in the panel on the right.

## How to
1. Open the graph view and switch the plugin on (Extended Graph switch in the panel).
<p>&nbsp;</p>
2. In **Node Weight**, choose which notes are resized ("Node to apply Weight"), then what feeds them: Variable X and Variable Y, each a list of search queries with its weight multiplier (a, b).
<p>&nbsp;</p>
3. Shape the hierarchy in **Emphasis**: base size, contrast between nodes (c), min and max size. Hover the (?) icons for the exact equation.
<p>&nbsp;</p>
4. Save the result in a graph state (states bar): each state keeps its own Node Weight.
<p>&nbsp;</p>
5. In **Node level**, switch on to see only the notes around the open note, up to the chosen depth.

Queries use the Obsidian search syntax. Note that `file:(` matches "(" anywhere in the name; for "name starts with (", use `file:/^\(/` (the query box suggests it).

## Disclosures
- No network use, no telemetry, no account.
- Optional debug log (off by default: Settings → GraphView CC → Other settings → Debug log): when on, it writes one diagnostic file per session in the plugin folder (`.obsidian/plugins/graphview-cc/logs/`). Nothing leaves your computer.

## Credits
Built on [Extended Graph](https://github.com/ElsaTam/obsidian-extended-graph) by **ElsaTam** (original author and contributor), itself crediting [obsidian-typings](https://github.com/Fevol/obsidian-typings), [graph-analysis](https://github.com/SkepticMystic/graph-analysis) and [js-colormaps](https://github.com/timothygebhard/js-colormaps). All Extended Graph features remain available; see its [wiki](https://github.com/ElsaTam/obsidian-extended-graph/wiki).

## Contributing
Improvements are welcome. Start with [ARCHITECTURE.md](ARCHITECTURE.md), which explains what this fork adds and where each part lives. Version history: [CHANGELOG.md](CHANGELOG.md).

## License
GNU General Public License v3.0 only, like the original Extended Graph: you can use, study, modify and share this code, and any distributed modified version must stay under the same license. See [LICENSE](LICENSE).
