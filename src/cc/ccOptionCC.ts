/*
 * GraphView CC — "OptionCC" section for the GLOBAL graph: brings the local-graph options
 * (Depth, Incoming links, Outgoing links, Neighbor links) with the same mechanism as Obsidian:
 *   center = the note currently open (last opened markdown note),
 *   keep the notes reachable from the center in at most `depth` jumps, following
 *   outgoing links (center -> note) and/or incoming links (note -> center),
 *   Neighbor links ON = also show links between the kept notes that are not on a jump path.
 * Applied on the graph data after Obsidian's search filter (graphEventsDispatcher.updateData).
 */
import { App, Component, debounce, Plugin, setIcon, setTooltip, SliderComponent, ToggleComponent } from "obsidian";
import { GraphView, LocalGraphView } from "obsidian-typings";
import { addHeaderToggle, HeaderToggle } from "./ccPanel";
import { CCSettings } from "./ccCompact";
import { CCLogger } from "./ccLogger";
import { ExtendedGraphInstances } from "../internal";

export interface OptionCCSettings {
    enabled: boolean;
    depth: number;
    incoming: boolean;   // backlinks
    outgoing: boolean;   // forward links
    neighbor: boolean;   // links between neighbors
}

export const OPTIONCC_DEFAULTS: OptionCCSettings = { enabled: false, depth: 1, incoming: true, outgoing: true, neighbor: false };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Data = { nodes: Record<string, any>; numLinks: number };

// ================================ CORE =================================

/** Pure: returns the filtered graph data (or the input unchanged when the center is absent). */
export function applyDepthFilter(data: Data, center: string | null, s: OptionCCSettings): { data: Data; kept: number; centerFound: boolean } {
    if (!center || !(center in data.nodes)) return { data, kept: Object.keys(data.nodes).length, centerFound: false };

    const out = new Map<string, string[]>(), inc = new Map<string, string[]>();
    for (const [src, node] of Object.entries(data.nodes)) {
        for (const dst of Object.keys(node.links ?? {})) {
            if (!(dst in data.nodes)) continue;
            (out.get(src) ?? out.set(src, []).get(src)!).push(dst);
            (inc.get(dst) ?? inc.set(dst, []).get(dst)!).push(src);
        }
    }

    // BFS from the center
    const dist = new Map<string, number>([[center, 0]]);
    let frontier = [center];
    for (let d = 1; d <= s.depth && frontier.length; d++) {
        const next: string[] = [];
        for (const n of frontier) {
            const nb = [...(s.outgoing ? out.get(n) ?? [] : []), ...(s.incoming ? inc.get(n) ?? [] : [])];
            for (const m of nb) if (!dist.has(m)) { dist.set(m, d); next.push(m); }
        }
        frontier = next;
    }

    // Links: jump links (consecutive depths, allowed direction) + all others if Neighbor links
    const nodes: Record<string, unknown> = {};
    let numLinks = 0;
    for (const [id, d] of dist) {
        const node = data.nodes[id];
        const links: Record<string, boolean> = {};
        for (const dst of Object.keys(node.links ?? {})) {
            const dd = dist.get(dst);
            if (dd === undefined) continue;
            const jump = (dd === d + 1 && s.outgoing) || (dd === d - 1 && s.incoming);
            if (jump || s.neighbor) { links[dst] = node.links[dst]; numLinks++; }
        }
        nodes[id] = { ...node, links };
    }
    return { data: { ...data, nodes, numLinks }, kept: dist.size, centerFound: true };
}

export class CCOptionCC {
    static settings: OptionCCSettings = { ...OPTIONCC_DEFAULTS };
    static center: string | null = null;
    static lastStatus = "";
    private static listeners = new Set<() => void>();

    static init(app: App, settings: OptionCCSettings): void {
        Object.assign(settings, { ...OPTIONCC_DEFAULTS, ...settings });
        this.settings = settings;
        this.center = app.workspace.getActiveFile()?.path ?? app.workspace.getLastOpenFiles()[0] ?? null;
    }

    static onChange(cb: () => void): () => void { this.listeners.add(cb); return () => this.listeners.delete(cb); }
    static notify(): void { this.listeners.forEach(cb => cb()); }

    /** Hook called by graphEventsDispatcher.updateData (global graph only). */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static filter(graphType: string, data: any): any {
        if (graphType !== "graph" || !this.settings.enabled) return data;
        const before = Object.keys(data.nodes).length;
        const r = applyDepthFilter(data, this.center, this.settings);
        const status = r.centerFound
            ? `center "${this.center}", depth ${this.settings.depth}: ${r.kept} of ${before} nodes`
            : `center "${this.center ?? "none"}" not in the graph (filtered out?): full graph shown`;
        if (status !== this.lastStatus) {
            this.lastStatus = status;
            CCLogger.log("INFO", `OptionCC ${status}`);
            this.notify();
        }
        return r.data;
    }
}

/** Re-run the data pipeline of every open global graph. */
function rerenderGlobalGraphs(): void {
    for (const i of ExtendedGraphInstances.graphsManager?.allInstances.values() ?? []) {
        if (i.type === "graph") i.engine.render();
    }
}

/** Center follows the opened note, like the local graph. */
export function registerOptionCCEvents(plugin: Plugin): void {
    const recenter = debounce(() => { if (CCOptionCC.settings.enabled) rerenderGlobalGraphs(); }, 150, true);
    plugin.registerEvent(plugin.app.workspace.on("file-open", file => {
        if (!file || file.extension !== "md" || file.path === CCOptionCC.center) return;
        CCOptionCC.center = file.path;
        recenter();
    }));
}

// ================================= UI ==================================

const HELP = {
    enable: "OptionCC on/off. Brings the local graph options to the global graph, centered on the open note.",
    depth: "Number of link jumps from the open note.",
    incoming: "Follow links pointing TO the notes (backlinks).",
    outgoing: "Follow links going FROM the notes (forward links).",
    neighbor: "Also show links between the notes found, not only the jump links.",
};

function helpIcon(parent: HTMLElement, text: string): void {
    const el = parent.createSpan({ cls: "graphview-cc-help" });
    setIcon(el, "help-circle");
    setTooltip(el, text, { placement: "left" });
}

const save = debounce(() => {
    void CCSettings.save();
    const s = CCOptionCC.settings;
    CCLogger.log("INFO", `OptionCC settings: ${s.enabled ? "ON" : "OFF"}, depth ${s.depth}, incoming ${s.incoming}, outgoing ${s.outgoing}, neighbor ${s.neighbor}`);
}, 600, true);

export class CCOptionCCSection extends Component {
    private static live = new Set<CCOptionCCSection>();
    private root: HTMLElement;
    private children: HTMLElement;
    private collapseIcon: HTMLElement;
    private isCollapsed = true;
    private enabled = false;
    private headToggle: HeaderToggle;

    constructor(view: GraphView | LocalGraphView) {
        super();
        const controls = view.contentEl.querySelector(".graph-controls") as HTMLElement;
        controls.querySelectorAll(".mod-graphview-cc-optioncc").forEach(el => el.remove());
        CCOptionCCSection.live.add(this);
        this.root = controls.createDiv("tree-item graph-control-section mod-graphview-cc-optioncc is-collapsed");
        const head = this.root.createDiv("tree-item-self mod-collapsible");
        this.collapseIcon = head.createDiv("tree-item-icon collapse-icon is-collapsed");
        setIcon(this.collapseIcon, "right-triangle");
        setIcon(head.createDiv("tree-item-header-icon"), "focus");
        head.createDiv("tree-item-inner").createEl("header", { cls: "graph-control-section-header", text: "Node level" });
        head.onClickEvent(() => this.isCollapsed ? this.open() : this.close());
        this.headToggle = addHeaderToggle(this.root, HELP.enable, CCOptionCC.settings.enabled, v => {
            CCOptionCC.settings.enabled = v;
            this.changed();
        });
        this.children = createDiv("tree-item-children graphview-cc-nodefactor");
        this.display();
    }

    onPluginEnabled(): void { this.enabled = true; this.display(); }
    onPluginDisabled(): void { this.enabled = false; this.display(); }
    onunload(): void { this.root.remove(); CCOptionCCSection.live.delete(this); }
    static removeAll(): void { for (const s of [...this.live]) s.unload(); }

    private open(): void {
        this.isCollapsed = false;
        this.root.removeClass("is-collapsed");
        this.collapseIcon.removeClass("is-collapsed");
        this.root.appendChild(this.children);
    }
    private close(): void {
        this.isCollapsed = true;
        this.root.addClass("is-collapsed");
        this.collapseIcon.addClass("is-collapsed");
        this.children.remove();
    }

    private display(): void {
        const c = this.children;
        c.empty();
        const s = CCOptionCC.settings;
        this.headToggle.set(s.enabled);
        this.headToggle.setDisabled(!this.enabled);
        if (!this.enabled) {
            c.createDiv({ cls: "graphview-cc-nf-note", text: "Enable GraphView CC on this graph to use OptionCC." });
            return;
        }
        // Depth (slider, like the local graph)
        const dr = c.createDiv({ cls: "graphview-cc-nf-row" });
        const dh = dr.createDiv({ cls: "graphview-cc-nf-head" });
        dh.createSpan({ cls: "graphview-cc-nf-label", text: "Depth" });
        helpIcon(dh, HELP.depth);
        dh.createSpan({ cls: "graphview-cc-nf-spacer" });
        const dv = dh.createSpan({ cls: "graphview-cc-nf-value", text: String(s.depth) });
        const db = dr.createDiv({ cls: "graphview-cc-nf-body" });
        new SliderComponent(db).setLimits(1, 5, 1).setValue(s.depth).onChange(v => {
            s.depth = v; dv.setText(String(v)); this.changed();
        }).sliderEl.addClass("graphview-cc-nf-slider");

        this.addToggle(c, "Incoming links", "incoming");
        this.addToggle(c, "Outgoing links", "outgoing");
        this.addToggle(c, "Neighbor links", "neighbor");

    }

    private addToggle(c: HTMLElement, label: string, key: "incoming" | "outgoing" | "neighbor"): void {
        const r = c.createDiv({ cls: "graphview-cc-nf-row" });
        const h = r.createDiv({ cls: "graphview-cc-nf-head" });
        h.createSpan({ cls: "graphview-cc-nf-label", text: label });
        helpIcon(h, HELP[key]);
        h.createSpan({ cls: "graphview-cc-nf-spacer" });
        new ToggleComponent(h).setValue(CCOptionCC.settings[key]).onChange(v => {
            CCOptionCC.settings[key] = v; this.changed();
        });
    }

    private changed(): void {
        CCOptionCC.lastStatus = "";
        save();
        rerenderGlobalGraphs();
    }
}
