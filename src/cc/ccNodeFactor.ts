/*
 * GraphView CC — NodeFactor: node size from a user-controlled formula.
 *
 *   X = number of linked notes matching query X   ("notes feeders")
 *   Y = number of linked notes matching query Y   (linked themes)
 *   W = a·X + b·Y
 *   size = clamp(base × (1 + W)^p, min, max)        p = contrast
 *
 * "Linked" = unique notes linked in either direction, counted on the WHOLE vault
 * (metadataCache), not only on what the graph currently shows: a search filter such
 * as "file:=" hides the books, but they still feed the size of the themes.
 * Only nodes matching "Applies to" are resized; the others keep the native size.
 *
 * CORE only (no UI): see ccNodeFactorUI.ts.
 */
import { App, getAllTags, TFile } from "obsidian";
import { CCQuery, QueryTarget } from "./ccQuery";
import { CCLogger } from "./ccLogger";

export interface NodeFactorSettings {
    enabled: boolean;
    appliesTo: string;
    queryX: string;
    a: number;
    queryY: string;
    b: number;
    contrast: number;
    base: number;
    min: number;
    max: number;
}

export const NODEFACTOR_DEFAULTS: NodeFactorSettings = {
    enabled: false,
    appliesTo: "file:=",
    queryX: "-file:=",
    a: 1,
    queryY: "file:=",
    b: 1,
    contrast: 0.5,
    base: 8,
    min: 4,
    max: 80,
};

export interface NodeFactorResult {
    id: string;
    name: string;
    X: number;
    Y: number;
    W: number;
    size: number;
}

/** Minimal view of the vault the computation needs (lets the CORE be tested outside Obsidian). */
export interface VaultLinks {
    /** source path -> target path -> count (resolved links) */
    resolved: Record<string, Record<string, number>>;
    /** source path -> link text -> count (links to notes that do not exist) */
    unresolved: Record<string, Record<string, number>>;
    /** query info for an existing file path */
    target(path: string): QueryTarget;
}

export function nodeFactorSize(W: number, s: NodeFactorSettings): number {
    const raw = s.base * Math.pow(1 + Math.max(0, W), s.contrast);
    return Math.min(s.max, Math.max(s.min, raw));
}

export function formulaText(s: NodeFactorSettings): string {
    const f = (n: number, d = 2) => Number(n.toFixed(d)).toString();
    return `size = ${f(s.base, 1)} × (1 + ${f(s.a)}·X + ${f(s.b)}·Y)^${f(s.contrast)}   [${f(s.min, 0)}…${f(s.max, 0)}]`;
}

/** Pure computation: one result per node matching "Applies to". */
export function computeNodeFactor(v: VaultLinks, s: NodeFactorSettings): Map<string, NodeFactorResult> {
    const qA = new CCQuery(s.appliesTo), qX = new CCQuery(s.queryX), qY = new CCQuery(s.queryY);

    // Undirected neighbor sets. Unresolved targets are keyed by their link text (= graph node id).
    const neighbors = new Map<string, Set<string>>();
    const add = (p: string, q: string) => {
        if (p === q) return;
        (neighbors.get(p) ?? neighbors.set(p, new Set()).get(p)!).add(q);
        (neighbors.get(q) ?? neighbors.set(q, new Set()).get(q)!).add(p);
    };
    for (const [src, targets] of Object.entries(v.resolved)) {
        if (!neighbors.has(src)) neighbors.set(src, new Set());
        for (const dst of Object.keys(targets)) add(src, dst);
    }
    const unresolvedIds = new Set<string>();
    for (const [src, targets] of Object.entries(v.unresolved)) {
        for (const dst of Object.keys(targets)) { unresolvedIds.add(dst); add(src, dst); }
    }

    const info = new Map<string, QueryTarget>();
    const targetOf = (id: string): QueryTarget => {
        let t = info.get(id);
        if (!t) {
            t = unresolvedIds.has(id) && !(id in v.resolved) ? { name: id, path: id, tags: [] } : v.target(id);
            info.set(id, t);
        }
        return t;
    };

    const out = new Map<string, NodeFactorResult>();
    for (const [id, set] of neighbors) {
        const t = targetOf(id);
        if (!qA.matches(t)) continue;
        let X = 0, Y = 0;
        for (const n of set) {
            const nt = targetOf(n);
            if (qX.matches(nt)) X++;
            if (qY.matches(nt)) Y++;
        }
        const W = s.a * X + s.b * Y;
        out.set(id, { id, name: t.name, X, Y, W, size: nodeFactorSize(W, s) });
    }
    return out;
}

/** Adapter from the live Obsidian vault. */
export function vaultLinksFromApp(app: App): VaultLinks {
    return {
        resolved: app.metadataCache.resolvedLinks,
        unresolved: app.metadataCache.unresolvedLinks,
        target(path: string): QueryTarget {
            const f = app.vault.getAbstractFileByPath(path);
            if (!(f instanceof TFile)) return { name: path.replace(/\.md$/, ""), path, tags: [] };
            const cache = app.metadataCache.getFileCache(f);
            const tags = cache ? (getAllTags(cache) ?? []).map(x => x.replace(/^#/, "")) : [];
            return { name: f.basename, path: f.path, tags };
        },
    };
}

/** Runtime state shared by the node size hook and the UI. */
export class CCNodeFactor {
    static settings: NodeFactorSettings = { ...NODEFACTOR_DEFAULTS };
    private static app: App | null = null;
    private static cache: Map<string, NodeFactorResult> | null = null;

    static init(app: App, settings: NodeFactorSettings): void {
        this.app = app;
        this.settings = settings;
        this.cache = null;
    }

    static isEnabled(): boolean {
        return !!this.app && this.settings.enabled;
    }

    /** Called by the node size hook. undefined = keep the native size. */
    static sizeFor(id: string): number | undefined {
        if (!this.isEnabled()) return undefined;
        return this.results().get(id)?.size;
    }

    static invalidate(reason: string): void {
        this.cache = null;
        CCLogger.log("INFO", `NodeFactor invalidated (${reason})`);
    }

    static results(): Map<string, NodeFactorResult> {
        if (!this.cache && this.app) {
            const t0 = performance.now();
            this.cache = computeNodeFactor(vaultLinksFromApp(this.app), this.settings);
            const ws = [...this.cache.values()].map(r => r.W);
            CCLogger.log("INFO", `NodeFactor computed in ${(performance.now() - t0).toFixed(1)} ms: ${this.cache.size} nodes resized, W ${ws.length ? Math.min(...ws) : 0}…${ws.length ? Math.max(...ws) : 0} | ${formulaText(this.settings)}`);
        }
        return this.cache ?? new Map();
    }

    /** Sorted table for the log (self-test). */
    static table(limit = 200): string {
        const rows = [...this.results().values()].sort((p, q) => q.W - p.W).slice(0, limit);
        const s = this.settings;
        const lines = [
            `NodeFactor table | ${formulaText(s)}`,
            `  appliesTo="${s.appliesTo}"  X="${s.queryX}"  Y="${s.queryY}"`,
            ...rows.map(r => `  ${r.name.padEnd(32)} X=${String(r.X).padStart(3)}  Y=${String(r.Y).padStart(3)}  W=${r.W.toFixed(2).padStart(7)}  size=${r.size.toFixed(1)}`),
        ];
        return lines.join("\n");
    }
}
