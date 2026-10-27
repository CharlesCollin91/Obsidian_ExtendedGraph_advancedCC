/*
 * GraphView CC — "NodeFactor" section in the graph controls panel (right side of the graph view).
 * UI only: the computation lives in ccNodeFactor.ts.
 *
 * Layout is built for a narrow panel: one full-width row per control,
 * label + (?) help icon on top, control below. No long descriptions: help is in the tooltips.
 */
import { App, Component, debounce, Plugin, setIcon, setTooltip, SliderComponent, TextComponent } from "obsidian";
import { GraphView, LocalGraphView } from "obsidian-typings";
import { CCNodeFactor, formulaText, NodeFactorSettings, rowsText } from "./ccNodeFactor";
import { CCSettings } from "./ccCompact";
import { CCQuery } from "./ccQuery";
import { CCQuerySuggest } from "./ccQuerySuggest";
import { addHeaderToggle, equalizePanelMargins, HeaderToggle } from "./ccPanel";
import { CCLogger } from "./ccLogger";
import { ExtendedGraphInstances } from "../internal";

type NumKey = "a" | "b" | "contrast" | "base" | "min" | "max";
type QueryKey = "appliesTo" | "queryX" | "queryY";

const HELP = {
    enable: "NodeFactor on/off. OFF = Obsidian's native node sizes.",
    appliesTo: "Which nodes (notes) get resized.",
    queryX: "X = number of linked notes matching these queries (e.g. books, reflections: -file:=).",
    a: "a = weight of X. 0 = X ignored.",
    queryY: "Y = number of linked notes matching these queries (e.g. other themes: file:=).",
    b: "b = weight of Y. 0 = Y ignored.",
    base: "Size of a node with no links.",
    contrast: "c = contrast between nodes. 0 = all equal, 0.5 = square root, 1 = linear (strong hierarchy).",
    min: "Smallest allowed node size.",
    max: "Largest allowed node size.",
};

const EQUATION_LABEL = "NodeWeight = (a·X + b·Y)·c";

function equationHelp(s: NodeFactorSettings): string {
    const f = (n: number) => Number(n.toFixed(2)).toString();
    return "Displayed is the simplified equation to determine node weight. Here is the accurate one:\n" +
        `size = base × (1 + a·X + b·Y)^c, bounded between min and max\n` +
        `now: size = ${f(s.base)} × (1 + ${f(s.a)}·X + ${f(s.b)}·Y)^${f(s.contrast)}, bounded between ${f(s.min)} and ${f(s.max)}\n` +
        "X, Y = linked notes matching each variable's queries, counted on the whole vault, both link directions.";
}

/** Redraw every open graph view (sizes are read again at the next frame). */
function redrawGraphs(): void {
    for (const i of ExtendedGraphInstances.graphsManager?.allInstances.values() ?? []) {
        i.renderer.changed();
    }
}

const saveAndLog = debounce(() => {
    void CCSettings.save();
    const s = CCNodeFactor.settings;
    CCLogger.log("INFO", `NodeFactor settings: ${formulaText(s)} | appliesTo=${rowsText(s.appliesTo)} X=${rowsText(s.queryX)} Y=${rowsText(s.queryY)}`);
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
    private equationHelpEl: HTMLElement | null = null;
    private headToggle: HeaderToggle;
    private app: App;

    constructor(view: GraphView | LocalGraphView) {
        super();
        this.app = view.app;
        const controls = view.contentEl.querySelector(".graph-controls") as HTMLElement;
        controls.querySelectorAll(".mod-graphview-cc-nodefactor").forEach(el => el.remove()); // stale copy from a previous load
        CCNodeFactorSection.live.add(this);
        this.root = controls.createDiv("tree-item graph-control-section mod-graphview-cc-nodefactor is-collapsed");

        const head = this.root.createDiv("tree-item-self mod-collapsible");
        this.collapseIcon = head.createDiv("tree-item-icon collapse-icon is-collapsed");
        setIcon(this.collapseIcon, "right-triangle");
        setIcon(head.createDiv("tree-item-header-icon"), "scale");
        head.createDiv("tree-item-inner").createEl("header", { cls: "graph-control-section-header", text: "Node Weight" });
        head.onClickEvent(() => this.isCollapsed ? this.open() : this.close());
        this.headToggle = addHeaderToggle(this.root, HELP.enable, CCNodeFactor.settings.enabled, v => {
            CCNodeFactor.settings.enabled = v;
            CCLogger.log("INFO", `NodeFactor ${v ? "ON" : "OFF"}`);
            this.changed("enabled");
        });
        equalizePanelMargins(controls);

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
        this.headToggle?.set(s.enabled);
        this.headToggle?.setDisabled(!this.enabled);

        if (!this.enabled) {
            c.createDiv({ cls: "graphview-cc-nf-note", text: "Enable GraphView CC on this graph to use NodeFactor." });
            return;
        }

        // Equation: simplified label, accurate formula in the (?) tooltip (kept up to date)
        const eq = this.row(c, EQUATION_LABEL, equationHelp(s));
        eq.head.addClass("graphview-cc-nf-equation");
        this.equationHelpEl = eq.head.querySelector(".graphview-cc-help") as HTMLElement;

        this.addQuery(c, "Node to apply Weight", "appliesTo");

        this.group(c, "Variable X", HELP.queryX);
        this.addQuery(c, "", "queryX");
        this.addSlider(c, "a (Weight multiplier)", "a", 0, 5, 0.1);

        this.group(c, "Variable Y", HELP.queryY);
        this.addQuery(c, "", "queryY");
        this.addSlider(c, "b (Weight multiplier)", "b", 0, 5, 0.1);

        this.group(c, "Emphasis");
        this.addSlider(c, "Base size node", "base", 0.5, 30, 0.5);
        this.addSlider(c, "c (Contrast between nodes)", "contrast", 0, 1.5, 0.05);
        this.addSlider(c, "Min size node", "min", 0.5, 50, 0.5);
        this.addSlider(c, "Max size node", "max", 10, 200, 5);
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

    private group(c: HTMLElement, title: string, help?: string): void {
        const g = c.createDiv({ cls: "graphview-cc-nf-group" });
        g.createSpan({ text: title });
        if (help) helpIcon(g, help);
    }

    /** A list of query rows (OR), each with a ✕, and a "+" below to add a row — like graph Groups. */
    private addQuery(c: HTMLElement, label: string, key: QueryKey): void {
        const s = CCNodeFactor.settings;
        const wrap = label ? this.row(c, label, HELP[key]).body : c.createDiv({ cls: "graphview-cc-nf-row graphview-cc-nf-body" });
        wrap.addClass("graphview-cc-nf-rows");
        const rows = s[key];
        if (rows.length === 0) rows.push("");

        const commitAll = () => {
            const clean = rows.map(r => r.trim());
            s[key] = clean.filter((r, i) => r !== "" || clean.length === 1 || i === clean.length - 1);
            this.changed(`${key} changed`);
        };

        const render = () => {
            wrap.empty();
            rows.forEach((value, idx) => {
                const line = wrap.createDiv({ cls: "graphview-cc-nf-qrow" });
                const text = new TextComponent(line).setPlaceholder("Enter query…").setValue(value);
                text.inputEl.addClass("graphview-cc-nf-input");
                let last = value;
                const validate = (v: string) => {
                    const q = new CCQuery(v);
                    text.inputEl.toggleClass("graphview-cc-invalid", !!q.error);
                    setTooltip(text.inputEl, q.error ? `Invalid query: ${q.error}` : HELP[key]);
                    return !q.error;
                };
                validate(value);
                const commit = debounce((v: string) => {
                    if (v === last) return;              // focus re-dispatch: nothing changed
                    if (!validate(v)) return;
                    last = v;
                    rows[idx] = v;
                    commitAll();
                }, 400, true);
                text.onChange(commit);
                new CCQuerySuggest(this.app, text.inputEl, () => { /* commit happens on the input event */ });
                if (rows.length > 1) {
                    const del = line.createDiv({ cls: "clickable-icon graphview-cc-nf-del" });
                    setIcon(del, "x");
                    setTooltip(del, "Remove this query");
                    del.onClickEvent(() => { rows.splice(idx, 1); commitAll(); render(); });
                }
            });
            const add = wrap.createDiv({ cls: "clickable-icon graphview-cc-nf-add" });
            setIcon(add, "plus");
            add.createSpan({ text: "Add query" });
            setTooltip(add, "Add another query (a note counts if it matches any of them)");
            add.onClickEvent(() => { rows.push(""); render(); (wrap.querySelectorAll("input") as NodeListOf<HTMLInputElement>)[rows.length - 1]?.focus(); });
        };
        render();
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
        if (this.equationHelpEl) setTooltip(this.equationHelpEl, equationHelp(CCNodeFactor.settings), { placement: "left" });
        saveAndLog();
        redrawGraphs();
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
