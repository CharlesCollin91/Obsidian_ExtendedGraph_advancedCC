/*
 * GraphView CC — "Search options" popup for query inputs, like the one in graph Groups.
 * Shows the operators on click; after "tag:" lists the vault tags; after "[" lists the
 * properties; after "file:" proposes the first symbols used in note names ("starts with").
 */
import { AbstractInputSuggest, App, setIcon, setTooltip, TFile } from "obsidian";

interface Item {
    kind: "header" | "insert";
    label: string;      // bold part
    desc?: string;      // muted part
    insert?: string;    // text that replaces the current token
}

const OPTIONS: Item[] = [
    { kind: "insert", label: "path:", desc: "match path of the file", insert: "path:" },
    { kind: "insert", label: "file:", desc: "match file name (anywhere in the name)", insert: "file:" },
    { kind: "insert", label: "tag:", desc: "search for tags", insert: "tag:#" },
    { kind: "insert", label: "[property]", desc: "match property", insert: "[" },
    { kind: "insert", label: "file:/^X/", desc: "name starts with X (regex)", insert: "file:/^" },
];

const HEADER_HELP =
    "Same syntax as Obsidian search:\n" +
    "space = AND · OR · -term = NOT · ( ) grouping · \"exact phrase\" · /regex/\n" +
    "file:X matches X anywhere in the name. Use file:/^\\(/ for \"starts with (\".";

/** Current token = text from the last separator (space or "(") before the caret. Pure, testable. */
export function currentToken(value: string, caret: number): { start: number; token: string } {
    let start = 0, inQuote = false;
    for (let i = 0; i < caret; i++) {
        const c = value[i];
        if (c === '"') inQuote = !inQuote;
        if (!inQuote && (c === " " || (c === "(" && !/(file|path|tag):$/i.test(value.slice(0, i))))) start = i + 1;
    }
    if (value[start] === "-") start++;
    return { start, token: value.slice(start, caret) };
}

export function replaceToken(value: string, caret: number, insert: string): { value: string; caret: number } {
    const { start } = currentToken(value, caret);
    const next = value.slice(0, start) + insert + value.slice(caret);
    return { value: next, caret: start + insert.length };
}

/** Escapes a symbol for use in a regex. */
const reEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

export class CCQuerySuggest extends AbstractInputSuggest<Item> {
    private input: HTMLInputElement;

    constructor(app: App, input: HTMLInputElement, private onPicked: () => void) {
        super(app, input);
        this.input = input;
        // Open on click/focus too (Obsidian only opens on typing)
        input.addEventListener("focus", () => input.dispatchEvent(new Event("input")));
    }

    getSuggestions(): Item[] {
        const caret = this.input.selectionStart ?? this.input.value.length;
        const { token } = currentToken(this.input.value, caret);
        const low = token.toLowerCase();

        if (low.startsWith("tag:")) {
            const want = low.slice(4).replace(/^#/, "");
            const tags = Object.keys((this.app.metadataCache as unknown as { getTags(): Record<string, number> }).getTags?.() ?? {});
            return [
                { kind: "header", label: "Tags" },
                ...tags.filter(t => t.toLowerCase().slice(1).includes(want)).slice(0, 30)
                    .map(t => ({ kind: "insert" as const, label: t, insert: `tag:${t}` })),
            ];
        }
        if (low.startsWith("file:") && low.length <= 6) {
            return [{ kind: "header", label: "Names starting with…" }, ...this.firstSymbols()];
        }
        if (low.startsWith("[")) {
            const want = low.slice(1);
            return [
                { kind: "header", label: "Properties" },
                ...this.propertyNames().filter(p => p.toLowerCase().includes(want)).slice(0, 30)
                    .map(p => ({ kind: "insert" as const, label: `[${p}]`, desc: "has this property", insert: `[${p}]` })),
            ];
        }
        const opts = OPTIONS.filter(o => !low || o.label.toLowerCase().startsWith(low));
        return [{ kind: "header", label: "Search options" }, ...opts];
    }

    renderSuggestion(item: Item, el: HTMLElement): void {
        if (item.kind === "header") {
            el.addClass("graphview-cc-suggest-header");
            el.createSpan({ text: item.label });
            if (item.label === "Search options") {
                const i = el.createSpan({ cls: "graphview-cc-suggest-info" });
                setIcon(i, "info");
                setTooltip(i, HEADER_HELP, { placement: "right" });
            }
            return;
        }
        el.createSpan({ cls: "graphview-cc-suggest-label", text: item.label });
        if (item.desc) el.createSpan({ cls: "graphview-cc-suggest-desc", text: " " + item.desc });
    }

    selectSuggestion(item: Item): void {
        if (item.kind === "header" || !item.insert) return;
        const caret = this.input.selectionStart ?? this.input.value.length;
        const r = replaceToken(this.input.value, caret, item.insert);
        this.input.value = r.value;
        this.input.setSelectionRange(r.caret, r.caret);
        this.onPicked();
        this.input.dispatchEvent(new Event("input")); // commit + reopen with the next suggestions
    }

    private firstSymbols(): Item[] {
        const counts = new Map<string, number>();
        for (const f of this.app.vault.getMarkdownFiles()) {
            const c = f.basename.trim()[0];
            if (c && !/[\p{L}\p{N}]/u.test(c)) counts.set(c, (counts.get(c) ?? 0) + 1);
        }
        return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => ({
            kind: "insert" as const,
            label: `file:/^${reEscape(c)}/`,
            desc: `starts with "${c}" (${n} notes)`,
            insert: `file:/^${reEscape(c)}/`,
        }));
    }

    private propertyNames(): string[] {
        const names = new Set<string>();
        for (const f of this.app.vault.getMarkdownFiles() as TFile[]) {
            const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
            if (fm) Object.keys(fm).forEach(k => names.add(k));
        }
        return [...names].sort();
    }
}
