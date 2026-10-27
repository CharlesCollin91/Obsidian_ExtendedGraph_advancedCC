/*
 * ExtendedGraph_advancedCC — "+ Add query" under the search box of the native "Filters" section.
 * Each extra row has an AND/OR operator and a query. The full query is composed left to right:
 *     ((main) AND (row1)) OR (row2) ...
 * and handed to Obsidian's own engine (engine.updateSearch is wrapped: for the duration of the call
 * the search input holds the composed query, then it gets the user's text back). So the filtering is
 * done by Obsidian itself, with its full syntax (including content search).
 * engine.getOptions() is wrapped too, so states and graph.json keep only the user's main query.
 */
import { debounce, setIcon, setTooltip, TextComponent } from "obsidian";
import { GraphView, LocalGraphView } from "obsidian-typings";
import type { SearchEngineLike } from "./ccTypes";
import { CCSettings } from "./ccSettings";
import { CCLogger } from "./ccLogger";
import { CCQuerySuggest } from "./ccQuerySuggest";

export interface FilterRow { op: "AND" | "OR"; query: string; }

export function composeQuery(main: string, rows: FilterRow[]): string {
    let q = main.trim();
    for (const r of rows) {
        const v = r.query.trim();
        if (!v) continue;
        q = !q ? v : r.op === "OR" ? `(${q}) OR (${v})` : `(${q}) (${v})`;
    }
    return q;
}

type Engine = SearchEngineLike & { __graphviewCCFilterRows?: { origUpdate: SearchEngineLike["updateSearch"]; origGetOptions: SearchEngineLike["getOptions"] } };

function wrapEngine(engine: Engine): void {
    if (engine.__graphviewCCFilterRows) return;
    const input = engine.filterOptions?.search?.inputEl;
    if (!input) return;
    const origUpdate = engine.updateSearch, origGetOptions = engine.getOptions;
    engine.updateSearch = function (this: unknown, ...args: unknown[]): unknown {
        const main = input.value;
        const composed = composeQuery(main, CCSettings.data.filterRows);
        if (composed === main) return origUpdate.apply(this, args);
        input.value = composed;
        try { return origUpdate.apply(this, args); }
        finally { input.value = main; }
    };
    engine.getOptions = function (this: unknown, ...args: unknown[]): unknown {
        const o: unknown = origGetOptions.apply(this, args);
        if (o && typeof o === "object" && "search" in o) (o as { search: string }).search = input.value; // never persist the composed query
        return o;
    };
    engine.__graphviewCCFilterRows = { origUpdate, origGetOptions };
}

function unwrapEngine(engine: Engine): void {
    const w = engine.__graphviewCCFilterRows;
    if (!w) return;
    engine.updateSearch = w.origUpdate;
    engine.getOptions = w.origGetOptions;
    delete engine.__graphviewCCFilterRows;
}

const saveAndLog = debounce(() => {
    void CCSettings.save();
    CCLogger.log("INFO", `Filter rows: ${JSON.stringify(CCSettings.data.filterRows)}`);
}, 600, true);

/** The "+ Add query" rows, placed right under the native search box of the Filters section. */
export class CCFilterRows {
    private static live = new Set<CCFilterRows>();
    static disableAll(): void { for (const r of [...this.live]) r.disable(); }
    private holder: HTMLElement | null = null;
    private engine: Engine | null = null;

    constructor(private view: GraphView | LocalGraphView) { }

    enable(engine: Engine): void {
        CCFilterRows.live.add(this);
        this.engine = engine;
        wrapEngine(engine);
        this.render();
        if (CCSettings.data.filterRows.some(r => r.query.trim())) engine.updateSearch();
    }

    disable(): void {
        CCFilterRows.live.delete(this);
        this.holder?.remove();
        this.holder = null;
        if (this.engine) {
            unwrapEngine(this.engine);
            this.engine.updateSearch();
            this.engine = null;
        }
    }

    private apply(): void {
        saveAndLog();
        this.engine?.updateSearch();
    }

    private render(): void {
        const input = this.engine?.filterOptions?.search?.inputEl;
        const anchor = input?.closest<HTMLElement>(".setting-item") ?? input?.closest(".search-input-container")?.parentElement ?? null;
        if (!anchor) { CCLogger.log("WARN", "Filter rows: native search box not found"); return; }
        anchor.parentElement?.querySelectorAll(":scope > .graphview-cc-filter-rows").forEach(el => el.remove());
        this.holder = createDiv({ cls: "graphview-cc-filter-rows" });
        anchor.insertAdjacentElement("afterend", this.holder);
        this.draw();
    }

    private draw(): void {
        const h = this.holder;
        if (!h) return;
        h.empty();
        const rows = CCSettings.data.filterRows;
        rows.forEach((row, idx) => {
            const line = h.createDiv({ cls: "graphview-cc-nf-qrow" });
            const op = line.createEl("select", { cls: "dropdown graphview-cc-filter-op" });
            for (const o of ["AND", "OR"]) op.createEl("option", { text: o, value: o });
            op.value = row.op;
            setTooltip(op, "AND: both must match. OR: either one.");
            op.addEventListener("change", () => { row.op = op.value as "AND" | "OR"; this.apply(); });
            const text = new TextComponent(line).setPlaceholder("Enter query…").setValue(row.query);
            text.inputEl.addClass("graphview-cc-nf-input");
            text.onChange(debounce((v: string) => { if (v !== row.query) { row.query = v; this.apply(); } }, 400, true));
            new CCQuerySuggest(this.view.app, text.inputEl, () => { /* commit on input event */ });
            const del = line.createDiv({ cls: "clickable-icon graphview-cc-nf-del" });
            setIcon(del, "x");
            setTooltip(del, "Remove this query");
            del.onClickEvent(() => { rows.splice(idx, 1); this.apply(); this.draw(); });
        });
        const add = h.createDiv({ cls: "clickable-icon graphview-cc-nf-add" });
        setIcon(add, "plus");
        add.createSpan({ text: "Add query" });
        setTooltip(add, "Add a query combined with the search above (AND / OR)");
        add.onClickEvent(() => {
            rows.push({ op: "AND", query: "" });
            this.draw();
            h.querySelectorAll<HTMLInputElement>("input")[rows.length - 1]?.focus();
        });
    }
}
