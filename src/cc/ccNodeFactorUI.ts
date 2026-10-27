/*
 * GraphView CC — "NodeFactor" section in the graph controls panel (right side of the graph view).
 * UI only: the computation lives in ccNodeFactor.ts.
 *
 * Layout is built for a narrow panel: one full-width row per control,
 * label + (?) help icon on top, control below. No long descriptions: help is in the tooltips.
 */
import { Component, debounce, Plugin, setIcon, setTooltip, SliderComponent, TextComponent, ToggleComponent } from "obsidian";
import { GraphView, LocalGraphView } from "obsidian-typings";
import { CCNodeFactor, formulaText, NodeFactorSettings } from "./ccNodeFactor";
import { CCSettings } from "./ccCompact";
import { CCQuery } from "./ccQuery";
import { CCLogger } from "./ccLogger";
import { ExtendedGraphInstances } from "../internal";

type NumKey = "a" | "b" | "contrast" | "base" | "min" | "max";
type QueryKey = "appliesTo" | "queryX" | "queryY";

const HELP = {
    enable: "Turns the formula on/off. OFF = Obsidian's native node sizes.",
    formula: "Live formula. X and Y are counted on the whole vault, in both link directions.",
    appliesTo: "Which nodes get resized. Others keep their native size. Same syntax as Groups.",
    queryX: "X = number of linked notes matching this query (books, reflections…).",
    a: "Weight of X. 0 = X ignored.",
    queryY: "Y = number of linked notes matching this query (other themes).",
    b: "Weight of Y. 0 = Y ignored.",
    contrast: "Contrast between nodes. 0 = all equal, 0.5 = square root, 1 = linear.",
    base: "Size of a node with W = 0.",
    min: "Smallest allowed size.",
    max: "Largest allowed size.",
    top: "The 5 biggest nodes with their X, Y, W and final size.",
};

/** Redraw every open graph view (sizes are read again at the next frame). */
function redrawGraphs(): void {
    for (const i of ExtendedGraphInstances.graphsManager?.allInstances.values() ?? []) {
        i.renderer.changed();
    }
}

const saveAndLog = debounce(() => {
    void CCSettings.save();
    const s = CCNodeFactor.settings;
    CCLogger.log("INFO", `NodeFactor settings: ${formulaText(s)} | appliesTo="${s.appliesTo}" X="${s.queryX}" Y="${s.queryY}"`);
}, 800, true);

function helpIcon(parent: HTMLElement, text: string): void {
    const el = parent.createSpan({ cls: "graphview-cc-help" });
    setIcon(el, "help-circle");
    setTooltip(el, text, { placement: "left" });
}

export class CCNodeFactorSection extends Component {
    private static live = new Set<CCNodeFactorSection>();
    private root: HTMLElement;
    private children: HTMLElement;
    private collapseIcon: HTMLElement;
    private isCollapsed = true;
    private enabled = false;
    private formulaEl: HTMLElement | null = null;
    private topEl: HTMLElement | null = null;

    constructor(view: GraphView | LocalGraphView) {
        super();
        const controls = view.contentEl.querySelector(".graph-controls") as HTMLElement;
        controls.querySelectorAll(".mod-graphview-cc-nodefactor").forEach(el => el.remove()); // stale copy from a previous load
        CCNodeFactorSection.live.add(this);
        this.root = controls.createDiv("tree-item graph-control-section mod-graphview-cc-nodefactor is-collapsed");

        const head = this.root.createDiv("tree-item-self mod-collapsible");
        this.collapseIcon = head.createDiv("tree-item-icon collapse-icon is-collapsed");
        setIcon(this.collapseIcon, "right-triangle");
        setIcon(head.createDiv("tree-item-header-icon"), "scale");
        head.createDiv("tree-item-inner").createEl("header", { cls: "graph-control-section-header", text: "NodeFactor" });
        head.onClickEvent(() => this.isCollapsed ? this.open() : this.close());

        this.children = createDiv("tree-item-children graphview-cc-nodefactor");
        this.register(CCNodeFactor.onChange(() => this.display()));
        this.display();
    }

    onPluginEnabled(): void { this.enabled = true; this.display(); }
    onPluginDisabled(): void { this.enabled = false; this.display(); }

    onunload(): void {
        this.root.remove();
        CCNodeFactorSection.live.delete(this);
    }

    /** Plugin unload: remove every NodeFactor section from the graph panels. */
    static removeAll(): void {
        for (const sec of [...this.live]) sec.unload();
    }

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

    // ================================ DISPLAY ================================

    private display(): void {
        const c = this.children;
        c.empty();
        const s = CCNodeFactor.settings;

        if (!this.enabled) {
            c.createDiv({ cls: "graphview-cc-nf-note", text: "Enable GraphView CC on this graph to use NodeFactor." });
            return;
        }

        // Enable
        const en = this.row(c, "Enable NodeFactor", HELP.enable, true);
        new ToggleComponent(en.head).setValue(s.enabled).onChange(v => {
            s.enabled = v;
            CCLogger.log("INFO", `NodeFactor ${v ? "ON" : "OFF"}`);
            this.changed("enabled");
            this.refreshInfo();
        });

        // Formula
        const fr = c.createDiv({ cls: "graphview-cc-nf-formula-row" });
        this.formulaEl = fr.createDiv({ cls: "graphview-cc-nf-formula" });
        helpIcon(fr, HELP.formula);

        this.addQuery(c, "Applies to", "appliesTo");
        this.group(c, "X · notes feeders");
        this.addQuery(c, "Query X", "queryX");
        this.addSlider(c, "a · weight of X", "a", 0, 5, 0.1);
        this.group(c, "Y · linked themes");
        this.addQuery(c, "Query Y", "queryY");
        this.addSlider(c, "b · weight of Y", "b", 0, 5, 0.1);
        this.group(c, "Shape of the curve");
        this.addSlider(c, "p · contrast", "contrast", 0, 1.5, 0.05);
        this.addSlider(c, "Base size", "base", 1, 30, 0.5);
        this.addSlider(c, "Min size", "min", 1, 50, 1);
        this.addSlider(c, "Max size", "max", 10, 200, 5);

        const top = this.row(c, "Top 5", HELP.top);
        this.topEl = top.body.createDiv({ cls: "graphview-cc-nf-top" });
        this.refreshInfo();
    }

    /** One full-width row: header (label + help + optional inline control) and a body below. */
    private row(c: HTMLElement, label: string, help: string, inline = false): { head: HTMLElement; body: HTMLElement } {
        const r = c.createDiv({ cls: "graphview-cc-nf-row" });
        const head = r.createDiv({ cls: "graphview-cc-nf-head" });
        head.createSpan({ cls: "graphview-cc-nf-label", text: label });
        helpIcon(head, help);
        if (inline) head.createSpan({ cls: "graphview-cc-nf-spacer" });
        const body = r.createDiv({ cls: "graphview-cc-nf-body" });
        return { head, body };
    }

    private group(c: HTMLElement, title: string): void {
        c.createDiv({ cls: "graphview-cc-nf-group", text: title });
    }

    private addQuery(c: HTMLElement, label: string, key: QueryKey): void {
        const s = CCNodeFactor.settings;
        const { body } = this.row(c, label, HELP[key]);
        const text = new TextComponent(body).setPlaceholder("empty = all notes").setValue(s[key]);
        text.inputEl.addClass("graphview-cc-nf-input");
        const commit = debounce((v: string) => {
            const q = new CCQuery(v);
            text.inputEl.toggleClass("graphview-cc-invalid", !!q.error);
            setTooltip(text.inputEl, q.error ? `Invalid query: ${q.error}` : HELP[key]);
            if (q.error) return;
            s[key] = v;
            this.changed(`${key} changed`);
        }, 400, true);
        text.onChange(commit);
    }

    private addSlider(c: HTMLElement, label: string, key: NumKey, min: number, max: number, step: number): void {
        const s = CCNodeFactor.settings;
        const { head, body } = this.row(c, label, HELP[key], true);
        const valueEl = head.createSpan({ cls: "graphview-cc-nf-value", text: this.fmt(s[key], step) });
        const slider = new SliderComponent(body).setLimits(min, max, step).setValue(s[key]).onChange(v => {
            s[key] = v;
            valueEl.setText(this.fmt(v, step));
            this.changed(`${key}=${v}`);
        });
        slider.sliderEl.addClass("graphview-cc-nf-slider");
    }

    private changed(reason: string): void {
        CCNodeFactor.invalidate(reason);
        this.refreshInfo();
        saveAndLog();
        redrawGraphs();
    }

    private refreshInfo(): void {
        const s: NodeFactorSettings = CCNodeFactor.settings;
        this.formulaEl?.setText(formulaText(s));
        if (!this.topEl) return;
        this.topEl.empty();
        if (!s.enabled) {
            this.topEl.setText("NodeFactor is OFF: native sizes.");
            return;
        }
        const rows = [...CCNodeFactor.results().values()].sort((p, q) => q.W - p.W);
        this.topEl.createDiv({ cls: "graphview-cc-nf-top-title", text: `${rows.length} nodes resized` });
        for (const r of rows.slice(0, 5)) {
            const line = this.topEl.createDiv({ cls: "graphview-cc-nf-top-line" });
            line.createDiv({ cls: "graphview-cc-nf-top-name", text: r.name });
            line.createDiv({ cls: "graphview-cc-nf-top-nums", text: `X ${r.X} · Y ${r.Y} · W ${this.fmt(r.W, 0.1)} · size ${r.size.toFixed(1)}` });
        }
    }

    private fmt(v: number, step: number): string {
        return step >= 1 ? v.toFixed(0) : step >= 0.1 ? v.toFixed(1) : v.toFixed(2);
    }
}

/** Recompute when notes or links change (debounced), and after a state load; then redraw. */
export function registerNodeFactorEvents(plugin: Plugin): void {
    const onVaultChange = debounce(() => {
        if (!CCNodeFactor.isEnabled()) return;
        CCNodeFactor.invalidate("vault links changed");
        redrawGraphs();
    }, 1000, true);
    plugin.registerEvent(plugin.app.metadataCache.on("resolved", onVaultChange));

    // A graph state brought its own NodeFactor: persist it and redraw.
    plugin.register(CCNodeFactor.onChange(() => {
        void CCSettings.save();
        redrawGraphs();
    }));
}
