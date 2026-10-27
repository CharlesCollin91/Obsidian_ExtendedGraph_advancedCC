/*
 * GraphView CC — runtime session logger.
 * Writes one log file per Obsidian session so bugs can be diagnosed
 * without copy-pasting anything from the developer console.
 *
 * Location rule ("refuse rather than write in the wrong place"):
 *   - if the plugin folder is a junction to <dev>\plugin and <dev>\logs exists,
 *     logs go to <dev>\logs\  (Charles' development folder);
 *   - otherwise they go to <plugin folder>\logs\.
 */
import { App, apiVersion, FileSystemAdapter, Plugin, Platform } from "obsidian";
import * as fs from "fs";
import * as path from "path";

export const CC_VERSION = "1.4.0";

type Level = "INIT" | "INFO" | "VIEW" | "ENABLE" | "DISABLE" | "NOTICE" | "WARN" | "ERROR" | "TEST" | "CLOSE";

export class CCLogger {
    private static file: string | null = null;
    private static app: App | null = null;
    private static plugin: Plugin | null = null;
    private static origWarn: typeof console.warn | null = null;
    private static origError: typeof console.error | null = null;
    private static noticeObserver: MutationObserver | null = null;
    private static onWindowError: ((e: ErrorEvent) => void) | null = null;
    private static onRejection: ((e: PromiseRejectionEvent) => void) | null = null;
    private static writing = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private static settings: any = null;

    // ============================== LIFECYCLE ==============================

    static init(plugin: Plugin): void {
        try {
            this.plugin = plugin;
            this.app = plugin.app;
            const dir = this.resolveLogsDir(plugin);
            if (!dir) return;
            fs.mkdirSync(dir, { recursive: true });
            const stamp = this.timestamp().replace(/[: ]/g, "-").replace(/\.\d+$/, "");
            this.file = path.join(dir, `session_${stamp}.log`);
            this.writeHeader();
            this.hookConsole();
            this.hookNotices();
            this.hookGlobalErrors();
            this.hookGraphEvents(plugin);
            // Notes are only indexed once the layout is ready: count them there, not at onload.
            plugin.app.workspace.onLayoutReady(() => this.logVaultReady());
        } catch (e) {
            this.file = null;
            console.error("[GraphView CC] logger init failed:", e);
        }
    }

    static close(): void {
        this.log("CLOSE", "plugin unloaded");
        if (this.origWarn) console.warn = this.origWarn;
        if (this.origError) console.error = this.origError;
        this.noticeObserver?.disconnect();
        if (this.onWindowError) window.removeEventListener("error", this.onWindowError);
        if (this.onRejection) window.removeEventListener("unhandledrejection", this.onRejection);
        this.origWarn = this.origError = null;
        this.noticeObserver = null;
        this.file = null;
    }

    static get logFile(): string | null {
        return this.file;
    }

    // =============================== WRITING ===============================

    static log(level: Level, message: string): void {
        if (!this.file || this.writing) return;
        this.writing = true; // guards against recursion through hooked console
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
        const e = err as Error;
        this.log("ERROR", `${context}: ${e?.message ?? String(err)}${e?.stack ? "\n" + e.stack : ""}`);
    }

    /** Self-test run from the command palette: proves the log is written and summarizes graph views. */
    static selfTest(): string {
        if (!this.app) return "Logger not initialized";
        const leaves = [
            ...this.app.workspace.getLeavesOfType("graph"),
            ...this.app.workspace.getLeavesOfType("localgraph"),
        ];
        const files = this.app.vault.getMarkdownFiles().length;
        this.log("TEST", `self-test: ${files} markdown files, ${leaves.length} graph view(s) open`);
        for (const leaf of leaves) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const renderer = (leaf.view as any)?.renderer;
            this.log("TEST", `  view ${leaf.view.getViewType()} id=${(leaf as any).id}: ${renderer?.nodes?.length ?? "?"} nodes, ${renderer?.links?.length ?? "?"} links`);
        }
        return this.file ?? "no log file";
    }

    // =============================== HELPERS ===============================

    private static resolveLogsDir(plugin: Plugin): string | null {
        const adapter = plugin.app.vault.adapter;
        if (!(adapter instanceof FileSystemAdapter) || !plugin.manifest.dir) return null;
        const pluginDir = adapter.getFullPath(plugin.manifest.dir);
        let realDir = pluginDir;
        try { realDir = fs.realpathSync(pluginDir); } catch { /* keep pluginDir */ }
        const devLogs = path.join(path.dirname(realDir), "logs");
        const devZzold = path.join(path.dirname(realDir), "zzold");
        if (realDir !== pluginDir && fs.existsSync(devLogs) && fs.existsSync(devZzold)) return devLogs;
        return path.join(pluginDir, "logs");
    }

    private static writeHeader(): void {
        const p = this.plugin!;
        const app = this.app!;
        const lines = [
            "=".repeat(78),
            `GraphView CC v${CC_VERSION}  (manifest ${p.manifest.version}, based on Extended Graph 2.7.6)`,
            `Session start : ${this.timestamp()}`,
            `Obsidian API  : ${apiVersion}   Platform: ${Platform.isWin ? "Windows" : Platform.isMacOS ? "macOS" : "other"}`,
            `Vault         : ${app.vault.getName()}`,
            `Log file      : ${this.file}`,
            "=".repeat(78),
            "",
        ];
        fs.appendFileSync(this.file!, lines.join("\n") + "\n", "utf8");
    }

    /** Key settings after load: the ones that most often explain "nothing happens". */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static logSettings(s: any): void {
        try {
            const on = (g: Record<string, boolean> | undefined) =>
                g ? Object.entries(g).filter(([, v]) => v).map(([k]) => k).join(", ") || "none" : "?";
            this.log("INIT", `settings loaded: maxNodes=${s?.maxNodes}, delay=${s?.delay}ms, startingState=${s?.startingStateID}`);
            this.log("INIT", `features ON (global graph): ${on(s?.enableFeatures?.graph)}`);
            this.log("INIT", `features ON (local graph) : ${on(s?.enableFeatures?.localgraph)}`);
            this.settings = s;
        } catch (e) {
            this.error("logSettings", e);
        }
    }

    /** Runs once Obsidian has indexed the vault. */
    private static logVaultReady(): void {
        try {
            const files = this.app?.vault.getMarkdownFiles().length ?? 0;
            this.log("INIT", `vault ready: ${files} markdown files`);
            const max = this.settings?.maxNodes;
            if (max !== undefined && files > max) {
                this.log("WARN", `vault has ${files} notes but maxNodes=${max}: the plugin will refuse to enable on a full graph (Settings > Performances)`);
            }
        } catch (e) {
            this.error("logVaultReady", e);
        }
    }

    private static hookConsole(): void {
        this.origWarn = console.warn;
        this.origError = console.error;
        const fmt = (args: unknown[]) => args.map(a => a instanceof Error ? `${a.message}\n${a.stack}` : typeof a === "string" ? a : this.safeJson(a)).join(" ");
        const ow = this.origWarn, oe = this.origError;
        console.warn = (...args: unknown[]) => { this.log("WARN", fmt(args)); ow.apply(console, args); };
        console.error = (...args: unknown[]) => { this.log("ERROR", fmt(args)); oe.apply(console, args); };
    }

    /** Records every Obsidian notice (the small popups), e.g. "node limit exceeded". */
    private static hookNotices(): void {
        this.noticeObserver = new MutationObserver(muts => {
            for (const m of muts) {
                m.addedNodes.forEach(n => {
                    const el = n as HTMLElement;
                    if (el.classList?.contains("notice")) this.log("NOTICE", el.innerText.trim());
                });
            }
        });
        const target = document.body.querySelector(".notice-container") ?? document.body;
        this.noticeObserver.observe(target, { childList: true, subtree: true });
    }

    private static hookGlobalErrors(): void {
        this.onWindowError = (e: ErrorEvent) => {
            if (this.isOurs(e.filename) || this.isOurs(e.error?.stack)) this.error("uncaught", e.error ?? e.message);
        };
        this.onRejection = (e: PromiseRejectionEvent) => {
            const stack = (e.reason as Error)?.stack;
            if (this.isOurs(stack)) this.error("unhandled promise", e.reason);
        };
        window.addEventListener("error", this.onWindowError);
        window.addEventListener("unhandledrejection", this.onRejection);
    }

    private static hookGraphEvents(plugin: Plugin): void {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ws = plugin.app.workspace as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const describe = (view: any) => `${view?.getViewType?.()} id=${view?.leaf?.id}: ${view?.renderer?.nodes?.length ?? "?"} nodes, ${view?.renderer?.links?.length ?? "?"} links`;
        plugin.registerEvent(ws.on("extended-graph:enabled-in-view", (view: unknown) => this.log("ENABLE", describe(view))));
        plugin.registerEvent(ws.on("extended-graph:disabled-in-view", (view: unknown) => this.log("DISABLE", describe(view))));
        plugin.registerEvent(plugin.app.workspace.on("layout-change", () => {
            const n = plugin.app.workspace.getLeavesOfType("graph").length + plugin.app.workspace.getLeavesOfType("localgraph").length;
            this.log("VIEW", `layout changed: ${n} graph view(s) open`);
        }));
    }

    private static isOurs(text?: string): boolean {
        return !!text && !!this.plugin && text.includes(`plugins/${this.plugin.manifest.id}`) || !!text && text.includes("plugin:graphview-cc");
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
