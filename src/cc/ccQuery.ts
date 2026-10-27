/*
 * ExtendedGraph_advancedCC — re-implementation of the Obsidian search syntax (as used in graph Groups).
 * Obsidian's own search engine is private and cannot be called by plugins, so we follow
 * https://obsidian.md/help/plugins/search as closely as possible.
 *
 * Supported (same meaning as in Obsidian):
 *   word            text in the file name or path (Obsidian also searches note content: we do not)
 *   "a phrase"      exact phrase
 *   A B             AND          A OR B      OR          -A      NOT
 *   ( ... )         grouping, -( ... ) excludes a group
 *   file:X          X anywhere in the file name (e.g. "= Art.md"). Not "starts with"!
 *   path:X          X anywhere in the file path
 *   tag:#X          tag X, or one of its sub-tags (tag:#a matches #a and #a/b)
 *   /regex/         JavaScript regex, alone or after an operator: file:/^\(/ = name starts with "("
 *   op:( A OR B )   sub-query scoped to an operator
 *   [prop]          property exists        [prop:null]  property exists and is empty
 *   [prop:value]    property value contains value (value can be "quoted", /regex/, or (A OR B))
 *   [prop:>5]       numeric comparison (<, <=, >, >=)
 * Case-insensitive, like Obsidian's default.
 * Not supported: content:, line:, section:, block:, task:, match-case:.
 */

export interface QueryTarget {
    name: string;                       // file name without extension, e.g. "= Architecture"
    path: string;                       // vault path, e.g. "folder/= Architecture.md"
    tags: string[];                     // tags without "#", e.g. ["📥/🏷️/🟨"]
    props?: Record<string, unknown>;    // frontmatter
}

type Field = "text" | "file" | "path" | "tag";
type Node =
    | { k: "and" | "or"; items: Node[] }
    | { k: "not"; item: Node }
    | { k: "match"; field: Field; m: Matcher }
    | { k: "scoped"; field: Field; q: Node }
    | { k: "prop"; name: string; test: "exists" | "null" | PropTest };

type Matcher = { kind: "text"; v: string } | { kind: "regex"; re: RegExp };
type PropTest = { kind: "cmp"; op: string; n: number } | { kind: "query"; q: Node };

const OPS = ["file", "path", "tag"] as const;

// ================================ LEXER =================================

type Tok =
    | { t: "lp" } | { t: "rp" } | { t: "minus" } | { t: "or" }
    | { t: "op"; v: Field }
    | { t: "word"; v: string; quoted: boolean }
    | { t: "regex"; re: RegExp }
    | { t: "prop"; raw: string };

function lex(src: string): Tok[] {
    const out: Tok[] = [];
    let i = 0;
    const isSpace = (c: string) => /\s/.test(c);
    while (i < src.length) {
        const c = src[i];
        if (isSpace(c)) { i++; continue; }
        if (c === "(") { out.push({ t: "lp" }); i++; continue; }
        if (c === ")") { out.push({ t: "rp" }); i++; continue; }
        if (c === "-" && i + 1 < src.length && !isSpace(src[i + 1])) { out.push({ t: "minus" }); i++; continue; }
        if (c === "[") {
            let depth = 0, j = i;
            for (; j < src.length; j++) {
                if (src[j] === "[") depth++;
                else if (src[j] === "]") { depth--; if (depth === 0) break; }
            }
            if (j >= src.length) throw new Error("unclosed [");
            out.push({ t: "prop", raw: src.slice(i + 1, j) });
            i = j + 1;
            continue;
        }
        if (c === '"') {
            let j = i + 1, v = "";
            for (; j < src.length && src[j] !== '"'; j++) {
                if (src[j] === "\\" && j + 1 < src.length) { v += src[++j]; continue; }
                v += src[j];
            }
            if (j >= src.length) throw new Error("unclosed quote");
            out.push({ t: "word", v, quoted: true });
            i = j + 1;
            continue;
        }
        if (c === "/") {
            let j = i + 1, body = "";
            for (; j < src.length && src[j] !== "/"; j++) {
                if (src[j] === "\\" && j + 1 < src.length) { body += src[j] + src[j + 1]; j++; continue; }
                body += src[j];
            }
            if (j >= src.length) throw new Error("unclosed /regex/");
            try { out.push({ t: "regex", re: new RegExp(body, "i") }); }
            catch { throw new Error(`invalid regex /${body}/`); }
            i = j + 1;
            continue;
        }
        // operator?
        const m = /^(file|path|tag):/i.exec(src.slice(i));
        if (m) { out.push({ t: "op", v: m[1].toLowerCase() as Field }); i += m[0].length; continue; }
        // bare word: until space or a structural char
        let j = i, v = "";
        while (j < src.length && !isSpace(src[j]) && src[j] !== ")" && !(src[j] === "(" && v === "")) { v += src[j]; j++; }
        if (v === "") { v = src[j]; j++; } // lone "(" inside a word context is handled by the parser
        out.push(v === "OR" ? { t: "or" } : { t: "word", v, quoted: false });
        i = j;
    }
    return out;
}

// ================================ PARSER ================================

class Parser {
    private p = 0;
    constructor(private toks: Tok[]) { }

    parse(): Node {
        const n = this.orExpr();
        if (this.p < this.toks.length) throw new Error("unexpected )");
        return n;
    }

    private peek(): Tok | undefined { return this.toks[this.p]; }

    private orExpr(): Node {
        const items = [this.andExpr()];
        while (this.peek()?.t === "or") { this.p++; items.push(this.andExpr()); }
        return items.length === 1 ? items[0] : { k: "or", items };
    }

    private andExpr(): Node {
        const items: Node[] = [];
        while (this.p < this.toks.length) {
            const t = this.peek()!;
            if (t.t === "rp" || t.t === "or") break;
            items.push(this.unary());
        }
        if (items.length === 0) throw new Error("empty expression");
        return items.length === 1 ? items[0] : { k: "and", items };
    }

    private unary(): Node {
        if (this.peek()?.t === "minus") { this.p++; return { k: "not", item: this.unary() }; }
        return this.primary();
    }

    private primary(): Node {
        const t = this.toks[this.p++];
        switch (t.t) {
            case "lp": {
                const n = this.orExpr();
                if (this.toks[this.p++]?.t !== "rp") throw new Error("missing )");
                return n;
            }
            case "op": return this.operand(t.v);
            case "word": return { k: "match", field: "text", m: { kind: "text", v: t.v.toLowerCase() } };
            case "regex": return { k: "match", field: "text", m: { kind: "regex", re: t.re } };
            case "prop": return parseProp(t.raw);
            default: throw new Error("unexpected token");
        }
    }

    /** Value after file:/path:/tag: — a word, a "phrase", a /regex/ or a (sub-query). */
    private operand(field: Field): Node {
        const t = this.toks[this.p];
        if (!t) throw new Error(`empty value after "${field}:"`);
        if (t.t === "lp") {
            this.p++;
            const q = this.orExpr();
            if (this.toks[this.p++]?.t !== "rp") throw new Error("missing )");
            return { k: "scoped", field, q };
        }
        this.p++;
        if (t.t === "word") return { k: "match", field, m: { kind: "text", v: t.v.toLowerCase() } };
        if (t.t === "regex") return { k: "match", field, m: { kind: "regex", re: t.re } };
        throw new Error(`invalid value after "${field}:"`);
    }
}

function parseProp(raw: string): Node {
    const i = raw.indexOf(":");
    const name = (i < 0 ? raw : raw.slice(0, i)).trim().replace(/^"(.*)"$/, "$1");
    if (!name) throw new Error("empty property name");
    if (i < 0) return { k: "prop", name, test: "exists" };
    const val = raw.slice(i + 1).trim();
    if (val === "null") return { k: "prop", name, test: "null" };
    const cmp = /^(<=|>=|<|>)\s*(-?\d+(?:\.\d+)?)$/.exec(val);
    if (cmp) return { k: "prop", name, test: { kind: "cmp", op: cmp[1], n: Number(cmp[2]) } };
    if (val === "") throw new Error(`empty value in [${name}:]`);
    return { k: "prop", name, test: { kind: "query", q: new Parser(lex(val)).parse() } };
}

// =============================== MATCHING ===============================

function fieldValues(field: Field, t: QueryTarget): string[] {
    const file = t.path.split("/").pop() ?? t.name;
    switch (field) {
        case "file": return [file];
        case "path": return [t.path];
        case "text": return [file, t.path];
        case "tag": return t.tags;
    }
}

function testMatcher(m: Matcher, field: Field, values: string[]): boolean {
    if (field === "tag") {
        return values.some(tag => {
            const tg = tag.toLowerCase().replace(/^#/, "");
            if (m.kind === "regex") return m.re.test(tg) || m.re.test("#" + tg);
            const want = m.v.replace(/^#/, "");
            return tg === want || tg.startsWith(want + "/");
        });
    }
    return values.some(v => m.kind === "regex" ? m.re.test(v) : v.toLowerCase().includes(m.v));
}

function evalNode(n: Node, t: QueryTarget, field?: Field): boolean {
    switch (n.k) {
        case "and": return n.items.every(x => evalNode(x, t, field));
        case "or": return n.items.some(x => evalNode(x, t, field));
        case "not": return !evalNode(n.item, t, field);
        case "scoped": return evalNode(n.q, t, n.field);
        case "match": {
            const f = n.field === "text" && field ? field : n.field;
            return testMatcher(n.m, f, fieldValues(f, t));
        }
        case "prop": {
            const props = t.props ?? {};
            const key = Object.keys(props).find(k => k.toLowerCase() === n.name.toLowerCase());
            if (key === undefined) return false;
            const raw = props[key];
            const vals = (Array.isArray(raw) ? raw : [raw]).filter(v => v !== null && v !== undefined && v !== "");
            if (n.test === "exists") return true;
            if (n.test === "null") return vals.length === 0;
            const test = n.test;
            if (test.kind === "cmp") {
                return vals.some(v => {
                    const x = Number(v);
                    if (Number.isNaN(x)) return false;
                    return test.op === "<" ? x < test.n : test.op === "<=" ? x <= test.n : test.op === ">" ? x > test.n : x >= test.n;
                });
            }
            // value sub-query: evaluated against each value as plain text
            return vals.some(v => evalNode(test.q, { name: String(v), path: String(v), tags: [] }, "file"));
        }
    }
}

// ================================ PUBLIC ================================

export class CCQuery {
    readonly source: string;
    readonly error: string | null = null;
    private root: Node | null = null;

    constructor(source: string) {
        this.source = (source ?? "").trim();
        if (!this.source) return;
        try {
            this.root = new Parser(lex(this.source)).parse();
        } catch (e) {
            this.error = (e as Error).message;
            this.root = null;
        }
    }

    get isEmpty(): boolean {
        return this.source === "";
    }

    matches(t: QueryTarget): boolean {
        if (this.isEmpty) return true;
        if (this.error || !this.root) return false;
        return evalNode(this.root, t);
    }
}

/**
 * Several query rows combined with OR (like several lines in a list).
 * Empty rows are ignored; no non-empty row = matches everything.
 */
export class CCQueryList {
    readonly queries: CCQuery[];
    constructor(rows: string[] | string) {
        const list = (Array.isArray(rows) ? rows : [rows]).map(r => (r ?? "").trim()).filter(r => r !== "");
        this.queries = list.map(r => new CCQuery(r));
    }
    get errors(): string[] {
        return this.queries.filter(q => q.error).map(q => `${q.source}: ${q.error}`);
    }
    matches(t: QueryTarget): boolean {
        if (this.queries.length === 0) return true;
        return this.queries.some(q => q.matches(t));
    }
}

export { OPS as QUERY_OPERATORS };
