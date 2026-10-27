/*
 * GraphView CC — "NodeFactor" section in the graph controls panel (right side of the graph view).
 * UI only: the computation lives in ccNodeFactor.ts.
 */
import { Component, debounce, setIcon, Setting, SliderComponent, TextComponent } from "obsidian";
import { GraphView, LocalGraphView } from "obsidian-typings";
import { CCNodeFactor, formulaText, NodeFactorSettings } from "./ccNodeFactor";
import { CCSettings } from "./ccCompact";
import { CCQuery } from "./ccQuery";
import { CCLogger } from "./ccLogger";
import { ExtendedGraphInstances } from "../internal";

type NumKey = "a" | "b" | "contrast" | "base" | "min" | "max";

/** Redraw every open graph view (sizes are read again at the next frame). */
function redrawGraphs(): void {
    for (const i of ExtendedGraphInstances.graphsManager?.allInstances.values() ?? []) {
        i.renderer.changed();
    }
}

/** Reinstall node hooks (needed when NodeFactor is switched on/off). */
function resetGraphs(): void {
    const lm = ExtendedGraphInstances.graphsManager?.lifecycleManager;
    lm?.resetAllPlugins("graph");
    lm?.resetAllPlugins("localgraph");
}

const saveAndLog = debounce(() => {
    void CCSettings.save();
    CCLogger.log("INFO", `NodeFactor settings: ${formulaText(CCNodeFactor.settings)} | appliesTo="${CCNodeFactor.settings.appliesTo}" X="${CCNodeFactor.settings.queryX}" Y="${CCNodeFactor.settings.queryY}"`);
}, 800, true);

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
        for (const sec of [...this.live]) sec.onunload();
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

        new Setting(c)
            .setName("Enable NodeFactor")
            .setDesc("Node size from the formula below (overrides Statistics node size).")
            .addToggle(t => t.setValue(s.enabled).onChange(v => {
                s.enabled = v;
                CCNodeFactor.invalidate(v ? "enabled" : "disabled");
                void CCSettings.save();
                CCLogger.log("INFO", `NodeFactor ${v ? "ON" : "OFF"}`);
                resetGraphs();
            }));

        this.formulaEl = c.createDiv({ cls: "graphview-cc-nf-formula" });

        this.addQuery(c, "Applies to", "Nodes resized by the formula (others keep their size).", "appliesTo");
        this.addQuery(c, "X · notes feeders", "Linked notes counted in X.", "queryX");
        this.addSlider(c, "a · weight of X", "a", 0, 5, 0.1);
        this.addQuery(c, "Y · linked themes", "Linked notes counted in Y.", "queryY");
        this.addSlider(c, "b · weight of Y", "b", 0, 5, 0.1);
        this.addSlider(c, "p · contrast", "contrast", 0, 1.5, 0.05, "0 = all equal, 0.5 = square root, 1 = linear");
        this.addSlider(c, "Base size", "base", 1, 30, 0.5);
        this.addSlider(c, "Min size", "min", 1, 50, 1);
        this.addSlider(c, "Max size", "max", 10, 200, 5);

        this.topEl = c.createDiv({ cls: "graphview-cc-nf-top" });
        this.refreshInfo();
    }

    private addQuery(c: HTMLElement, name: string, desc: string, key: "appliesTo" | "queryX" | "queryY"): void {
        const s = CCNodeFactor.settings;
        let text: TextComponent;
        const commit = debounce((v: string) => {
            const q = new CCQuery(v);
            text.inputEl.toggleClass("graphview-cc-invalid", !!q.error);
            text.inputEl.title = q.error ? `Invalid query: ${q.error}` : "";
            if (q.error) return;
            s[key] = v;
            this.changed(`${key} changed`);
        }, 400, true);
        new Setting(c)
            .setName(name)
            .setDesc(desc)
            .setClass("graphview-cc-nf-query")
            .addText(t => {
                text = t;
                t.setPlaceholder("empty = all notes").setValue(s[key]).onChange(commit);
            });
    }

    private addSlider(c: HTMLElement, name: string, key: NumKey, min: number, max: number, step: number, desc?: string): void {
        const s = CCNodeFactor.settings;
        let valueEl: HTMLElement;
        const setting = new Setting(c).setName(name).setClass("graphview-cc-nf-slider");
        if (desc) setting.setDesc(desc);
        setting.addSlider((sl: SliderComponent) => {
            sl.setLimits(min, max, step).setValue(s[key]).setDynamicTooltip().onChange(v => {
                s[key] = v;
                valueEl.setText(this.fmt(v, step));
                this.changed(`${key}=${v}`);
            });
        });
        valueEl = setting.controlEl.createSpan({ cls: "graphview-cc-nf-value", text: this.fmt(s[key], step) });
    }

    private changed(reason: string): void {
        CCNodeFactor.invalidate(reason);
        this.refreshInfo();
        saveAndLog();
        if (CCNodeFactor.isEnabled()) redrawGraphs();
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
        this.topEl.createDiv({ cls: "graphview-cc-nf-top-title", text: `${rows.length} nodes resized — top 5:` });
        for (const r of rows.slice(0, 5)) {
            this.topEl.createDiv({ text: `${r.name}   X ${r.X} · Y ${r.Y} → W ${this.fmt(r.W, 0.01)} · size ${r.size.toFixed(1)}` });
        }
    }

    private fmt(v: number, step: number): string {
        return step >= 1 ? v.toFixed(0) : step >= 0.1 ? v.toFixed(1) : v.toFixed(2);
    }
}

/** Recompute when notes or links change (debounced), and redraw. */
export function registerNodeFactorEvents(plugin: import("obsidian").Plugin): void {
    const onChange = debounce(() => {
        if (!CCNodeFactor.isEnabled()) return;
        CCNodeFactor.invalidate("vault links changed");
        redrawGraphs();
    }, 1000, true);
    plugin.registerEvent(plugin.app.metadataCache.on("resolved", onChange));
}
