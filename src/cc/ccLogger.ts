/*
 * GraphView CC — optional debug log (OFF by default; Settings → Other settings → Debug log).
 * When ON, writes one file per Obsidian session in <plugin folder>/logs/ so problems can be
 * diagnosed without the developer console. Nothing leaves the computer.
 *
 * Development setup: if the plugin folder is a directory junction to <dev>/plugin and
 * <dev>/logs + <dev>/zzold exist, the log goes to <dev>/logs instead.
 */
import { apiVersion, EventRef, FileSystemAdapter, Platform, Plugin } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import type { EGSettingsView, FeatureFlags, GraphViewLike } from "./ccTypes";

export const CC_VERSION = "1.14.0";

type Level = "INIT" | "INFO" | "VIEW" | "ENABLE" | "DISABLE" | "NOTICE" | "WARN" | "ERROR" | "TEST" | "CLOSE";

/** Extended Graph's own workspace events. */
interface EGWorkspace {
    on(name: "extended-graph:enabled-in-view" | "extended-graph:disabled-in-view", cb: (view: GraphViewLike) => void): EventRef;
}

export class CCLogger {
    private static file: string | null = null;
    private static plugin: Plugin | null = null;
    private static pluginDir: string | null = null;
    private static origWarn: typeof console.warn | null = null;
    private static origError: typeof console.error | null = null;
    private static noticeObserver: MutationObserver | null = null;
    private static onWindowError: ((e: ErrorEvent) => void) | null = null;
    private static onRejection: ((e: PromiseRejectionEvent) => void) | null = null;
    private static eventRefs: EventRef[] = [];
    private static writing = false;
    private static settings: EGSettingsView | null = null;

    // ============================== LIFECYCLE ==============================

    /** Called first in onload: starts logging only if the saved setting says so. */
    static init(plugin: Plugin): void {
        this.plugin = plugin;
        const adapter = plugin.app.vault.adapter;
        if (!(adapter instanceof FileSystemAdapter) || !plugin.manifest.dir) return;
        this.pluginDir = adapter.getFullPath(plugin.manifest.dir);
        if (this.savedDebugLog()) this.start();
    }

    static get isOn(): boolean { return this.file !== null; }
    static get logFile(): string | null { return this.file; }

    /** Turns the debug log on/off live (setting toggle). */
    static setEnabled(on: boolean): void {
        if (on && !this.file) this.start();
        if (!on && this.file) this.close();
    }

    static close(): void {
        this.log("CLOSE", "debug log stopped");
        if (this.origWarn) console.warn = this.origWarn;
        if (this.origError) console.error = this.origError;
        this.noticeObserver?.disconnect();
        if (this.onWindowError) window.removeEventListener("error", this.onWindowError);
        if (this.onRejection) window.removeEventListener("unhandledrejection", this.onRejection);
        this.eventRefs.forEach(ref => this.plugin?.app.workspace.offref(ref));
        this.eventRefs = [];
        this.origWarn = this.origError = null;
        this.noticeObserver = null;
        this.file = null;
    }

    private static start(): void {
        const plugin = this.plugin;
        const dir = this.resolveLogsDir();
        if (!plugin || !dir) return;
        try {
            fs.mkdirSync(dir, { recursive: true });
            const stamp = this.timestamp().replace(/[: ]/g, "-").replace(/\.\d+$/, "");
            this.file = path.join(dir, `session_${stamp}.log`);
            this.writeHeader();
            this.hookConsole();
            this.hookNotices();
            this.hookGlobalErrors();
            this.hookGraphEvents(plugin);
            plugin.app.workspace.onLayoutReady(() => this.logVaultReady());
            if (this.settings) this.logSettings(this.settings);
        } catch (e) {
            this.file = null;
            console.error("[GraphView CC] debug log could not start:", e);
        }
    }

    /** cc-settings.json is read synchronously here: the log must start before anything else loads. */
    private static savedDebugLog(): boolean {
        try {
            const raw = fs.readFileSync(path.join(this.pluginDir ?? "", "cc-settings.json"), "utf8");
            return (JSON.parse(raw) as { debugLog?: boolean }).debugLog === true;
        } catch {
            return false;
        }
    }

    // =============================== WRITING ===============================

    static log(level: Level, message: string): void {
        if (!this.file || this.writing) return;
        this.writing = true; // guards against recursion through the hooked console
        try {
            const line = `${this.timestamp()}  ${level.padEnd(7)}  ${message.replace(/\r?\n/g, "\n                                    ")}\n`;
            fs.appendFileSync(this.file, line, "utf8");
        } catch {
            // never let logging break the plugin
        } finally {
            this.writing = false;
        }
    }

    static error(context: string, err: unknown): void {
        const e = err instanceof Error ? err : null;
        this.log("ERROR", `${context}: ${e?.message ?? String(err)}${e?.stack ? "\n" + e.stack : ""}`);
    }

    /** Self-test (command palette): proves the log is written and summarizes graph views. */
    static selfTest(): string {
        const app = this.plugin?.app;
        if (!app || !this.file) return "debug log is off (Settings → Other settings → Debug log)";
        const leaves = [...app.workspace.getLeavesOfType("graph"), ...app.workspace.getLeavesOfType("localgraph")];
        this.log("TEST", `self-test: ${app.vault.getMarkdownFiles().length} markdown files, ${leaves.length} graph view(s) open`);
        for (const leaf of leaves) this.log("TEST", `  view ${this.describe(leaf.view)}`);
        return this.file;
    }

    /** Key settings: the ones that most often explain "nothing happens". */
    static logSettings(s: EGSettingsView): void {
        this.settings = s;
        const on = (g: FeatureFlags | undefined) => g ? Object.entries(g).filter(([, v]) => v).map(([k]) => k).join(", ") || "none" : "?";
        this.log("INIT", `settings loaded: maxNodes=${s.maxNodes}, delay=${s.delay}ms, startingState=${s.startingStateID}`);
        this.log("INIT", `features ON (global graph): ${on(s.enableFeatures?.graph)}`);
        this.log("INIT", `features ON (local graph) : ${on(s.enableFeatures?.localgraph)}`);
    }

    // =============================== HELPERS ===============================

    private static resolveLogsDir(): string | null {
        const pluginDir = this.pluginDir;
        if (!pluginDir) return null;
        let realDir = pluginDir;
        try { realDir = fs.realpathSync(pluginDir); } catch { /* keep pluginDir */ }
        const devLogs = path.join(path.dirname(realDir), "logs");
        const devZzold = path.join(path.dirname(realDir), "zzold");
        if (realDir !== pluginDir && fs.existsSync(devLogs) && fs.existsSync(devZzold)) return devLogs;
        return path.join(pluginDir, "logs");
    }

    private static writeHeader(): void {
        const p = this.plugin;
        if (!p || !this.file) return;
        const lines = [
            "=".repeat(78),
            `GraphView CC v${CC_VERSION}  (manifest ${p.manifest.version}, based on Extended Graph 2.7.6)`,
            `Session start : ${this.timestamp()}`,
            `Obsidian API  : ${apiVersion}   Platform: ${Platform.isWin ? "Windows" : Platform.isMacOS ? "macOS" : "other"}`,
            `Vault         : ${p.app.vault.getName()}`,
            `Log file      : ${this.file}`,
            "=".repeat(78),
            "",
        ];
        fs.appendFileSync(this.file, lines.join("\n") + "\n", "utf8");
    }

    private static logVaultReady(): void {
        const files = this.plugin?.app.vault.getMarkdownFiles().length ?? 0;
        this.log("INIT", `vault ready: ${files} markdown files`);
        const max = this.settings?.maxNodes;
        if (max !== undefined && files > max) {
            this.log("WARN", `vault has ${files} notes but maxNodes=${max}: Extended Graph will refuse to enable on a full graph (Settings > Performances)`);
        }
    }

    private static hookConsole(): void {
        const ow = console.warn, oe = console.error;
        this.origWarn = ow;
        this.origError = oe;
        const fmt = (args: unknown[]) => args.map(a => a instanceof Error ? `${a.message}\n${a.stack ?? ""}` : typeof a === "string" ? a : this.safeJson(a)).join(" ");
        console.warn = (...args: unknown[]) => { this.log("WARN", fmt(args)); ow.apply(console, args); };
        console.error = (...args: unknown[]) => { this.log("ERROR", fmt(args)); oe.apply(console, args); };
    }

    /** Records every Obsidian notice (the small popups), e.g. "node limit exceeded". */
    private static hookNotices(): void {
        this.noticeObserver = new MutationObserver(muts => {
            for (const m of muts) {
                m.addedNodes.forEach(n => {
                    if (n.instanceOf(HTMLElement) && n.classList.contains("notice")) this.log("NOTICE", n.innerText.trim());
                });
            }
        });
        this.noticeObserver.observe(document.body, { childList: true, subtree: true });
    }

    private static hookGlobalErrors(): void {
        this.onWindowError = (e: ErrorEvent) => {
            const err: unknown = e.error;
            const stack = err instanceof Error ? err.stack : undefined;
            if (this.isOurs(e.filename) || this.isOurs(stack)) this.error("uncaught", err ?? e.message);
        };
        this.onRejection = (e: PromiseRejectionEvent) => {
            const reason: unknown = e.reason;
            if (reason instanceof Error && this.isOurs(reason.stack)) this.error("unhandled promise", reason);
        };
        window.addEventListener("error", this.onWindowError);
        window.addEventListener("unhandledrejection", this.onRejection);
    }

    private static hookGraphEvents(plugin: Plugin): void {
        const ws = plugin.app.workspace as unknown as EGWorkspace;
        this.eventRefs.push(
            ws.on("extended-graph:enabled-in-view", view => this.log("ENABLE", this.describe(view))),
            ws.on("extended-graph:disabled-in-view", view => this.log("DISABLE", this.describe(view))),
            plugin.app.workspace.on("layout-change", () => {
                const n = plugin.app.workspace.getLeavesOfType("graph").length + plugin.app.workspace.getLeavesOfType("localgraph").length;
                this.log("VIEW", `layout changed: ${n} graph view(s) open`);
            }),
        );
    }

    private static describe(view: GraphViewLike): string {
        return `${view.getViewType?.() ?? "?"} id=${view.leaf?.id ?? "?"}: ${view.renderer?.nodes?.length ?? "?"} nodes, ${view.renderer?.links?.length ?? "?"} links`;
    }

    private static isOurs(text?: string): boolean {
        if (!text) return false;
        const id = this.plugin?.manifest.id ?? "graphview-cc";
        return text.includes(`plugins/${id}`) || text.includes(`plugin:${id}`);
    }

    private static safeJson(v: unknown): string {
        try { return JSON.stringify(v); } catch { return String(v); }
    }

    private static timestamp(): string {
        const d = new Date();
        const pad = (n: number, l = 2) => String(n).padStart(l, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
    }
}
