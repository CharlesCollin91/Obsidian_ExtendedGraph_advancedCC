/*
 * GraphView CC — minimal re-implementation of the Obsidian search syntax used in graph Groups.
 * (Obsidian's own search engine is private and cannot be called by plugins.)
 *
 * Supported:
 *   file:VALUE    file name contains VALUE (case-insensitive)
 *   path:VALUE    file path contains VALUE
 *   tag:#VALUE    note has tag VALUE or one of its sub-tags (tag:#a matches #a and #a/b)
 *   TEXT          file name contains TEXT (NOTE: Obsidian also searches note content; we do not)
 *   -TERM         negation
 *   "a b"         quotes keep spaces inside a value: file:"= Art"
 *   A B           AND (space)
 *   A OR B        OR (lower priority than AND)
 *   empty query   matches everything
 * Not supported (yet): parentheses grouping, line:, section:, content search, /regex/.
 */

export interface QueryTarget {
    name: string;      // file name without extension, e.g. "= Architecture"
    path: string;      // vault path, e.g. "folder/= Architecture.md"
    tags: string[];    // tags without "#", e.g. ["📥/🏷️/🟨"]
}

type TermKind = "file" | "path" | "tag" | "text";
interface Term { kind: TermKind; value: string; negate: boolean; }

export class CCQuery {
    readonly source: string;
    readonly error: string | null = null;
    private groups: Term[][] = [];   // OR of AND-groups

    constructor(source: string) {
        this.source = (source ?? "").trim();
        try {
            this.groups = CCQuery.parse(this.source);
        } catch (e) {
            this.error = (e as Error).message;
            this.groups = [];
        }
    }

    get isEmpty(): boolean {
        return this.source === "";
    }

    matches(t: QueryTarget): boolean {
        if (this.isEmpty) return true;
        if (this.error) return false;
        return this.groups.some(group => group.every(term => CCQuery.matchTerm(term, t) !== term.negate));
    }

    // ================================ PARSER ================================

    private static tokenize(src: string): string[] {
        const tokens: string[] = [];
        let cur = "", inQuote = false;
        for (const ch of src) {
            if (ch === '"') { inQuote = !inQuote; cur += ch; continue; }
            if (!inQuote && /\s/.test(ch)) {
                if (cur) tokens.push(cur);
                cur = "";
                continue;
            }
            cur += ch;
        }
        if (inQuote) throw new Error("unclosed quote");
        if (cur) tokens.push(cur);
        return tokens;
    }

    private static parse(src: string): Term[][] {
        if (!src) return [];
        const groups: Term[][] = [[]];
        for (const tok of this.tokenize(src)) {
            if (tok === "OR") { groups.push([]); continue; }
            groups[groups.length - 1].push(this.parseTerm(tok));
        }
        if (groups.some(g => g.length === 0)) throw new Error("empty side of OR");
        return groups;
    }

    private static parseTerm(tok: string): Term {
        let negate = false;
        if (tok.startsWith("-") && tok.length > 1) { negate = true; tok = tok.slice(1); }
        let kind: TermKind = "text";
        const m = /^(file|path|tag):(.*)$/i.exec(tok);
        if (m) { kind = m[1].toLowerCase() as TermKind; tok = m[2]; }
        const value = tok.replace(/^"(.*)"$/, "$1");
        if (value === "") throw new Error(`empty value in "${kind}:"`);
        return { kind, value, negate };
    }

    private static matchTerm(term: Term, t: QueryTarget): boolean {
        const v = term.value.toLowerCase();
        switch (term.kind) {
            case "file":
            case "text":
                return t.name.toLowerCase().includes(v);
            case "path":
                return t.path.toLowerCase().includes(v);
            case "tag": {
                const want = v.replace(/^#/, "");
                return t.tags.some(tag => {
                    const tg = tag.toLowerCase().replace(/^#/, "");
                    return tg === want || tg.startsWith(want + "/");
                });
            }
        }
    }
}
