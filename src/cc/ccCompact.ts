/*
 * GraphView CC — Compact mode for the plugin settings page.
 *
 * Each settings group (top-level setting or feature section) gets a pin.
 * Compact mode ON  -> only pinned groups are shown.
 * Compact mode OFF -> everything is shown (Extended Graph default).
 * Hiding never changes a value: a hidden feature keeps working.
 *
 * Stored in <plugin folder>/cc-settings.json (never shipped by a delivery).
 */
import { ExtraButtonComponent, Plugin } from "obsidian";
import { CCLogger } from "./ccLogger";
import { NodeFactorSettings, normalizeNodeFactor } from "./ccNodeFactor";
import { OPTIONCC_DEFAULTS, OptionCCSettings } from "./ccOptionCC";
import type { FilterRow } from "./ccFilterRows";

interface CCSettingsData {
    compactMode: boolean;
    pinnedGroups: string[];
    nodeFactor: NodeFactorSettings;
    egPanelCompact: boolean;   // ExtendedGraph section of the graph panel: compact options only
    otherCollapsed: boolean;   // "Other settings" section folded
    optionCC: OptionCCSettings; // local-graph options for the global graph
    filterRows: FilterRow[];    // extra queries under the Filters search box
}

const DEFAULTS: CCSettingsData = { compactMode: false, pinnedGroups: [], nodeFactor: normalizeNodeFactor(undefined), egPanelCompact: false, otherCollapsed: true, optionCC: { ...OPTIONCC_DEFAULTS }, filterRows: [] };

/** Section id -> feature keys in settings.enableFeatures (used for the "with features ON" counter). */
const SECTION_FEATURES: Record<string, string[]> = {
    "cc-other": [],
    "images": ["imagesFromProperty", "imagesFromEmbeds", "imagesForAttachments"],
    "links": ["links", "linksSameColorAsNode"],
};

/** Sub-sections that belong to a parent group. */
const GROUP_ALIASES: Record<string, string> = { "property-key": "properties" };

const NAV_CLASS = "extended-graph-nav-settings";

interface Group {
    id: string;
    title: string;
    pin: ExtraButtonComponent;
}

export class CCSettings {
    static data: CCSettingsData = { ...DEFAULTS, nodeFactor: normalizeNodeFactor(undefined), optionCC: { ...OPTIONCC_DEFAULTS }, filterRows: [] };
    private static plugin: Plugin | null = null;

    static async load(plugin: Plugin): Promise<void> {
        this.plugin = plugin;
        try {
            const p = this.path();
            if (p && await plugin.app.vault.adapter.exists(p)) {
                const raw = JSON.parse(await plugin.app.vault.adapter.read(p));
                this.data = { ...DEFAULTS, ...raw, nodeFactor: normalizeNodeFactor(raw.nodeFactor), optionCC: { ...OPTIONCC_DEFAULTS, ...(raw.optionCC ?? {}) }, filterRows: Array.isArray(raw.filterRows) ? raw.filterRows : [] };
            }
            CCLogger.log("INIT", `compact mode=${this.data.compactMode ? "ON" : "OFF"}, pinned=[${this.data.pinnedGroups.join(", ")}]`);
            CCLogger.log("INIT", `OptionCC: ${JSON.stringify(this.data.optionCC)}`);
            CCLogger.log("INIT", `ExtendedGraph panel: ${this.data.egPanelCompact ? "compact" : "full"} options`);
            CCLogger.log("INIT", `NodeFactor ${this.data.nodeFactor.enabled ? "ON" : "OFF"}: ${JSON.stringify(this.data.nodeFactor)}`);
        } catch (e) {
            this.data = { ...DEFAULTS, nodeFactor: normalizeNodeFactor(undefined), optionCC: { ...OPTIONCC_DEFAULTS }, filterRows: [] };
            CCLogger.error("cc-settings.json load failed (defaults used)", e);
        }
    }

    static async save(): Promise<void> {
        try {
            const p = this.path();
            if (p && this.plugin) await this.plugin.app.vault.adapter.write(p, JSON.stringify(this.data, null, 2));
        } catch (e) {
            CCLogger.error("cc-settings.json save failed", e);
        }
    }

    private static path(): string | null {
        return this.plugin?.manifest.dir ? `${this.plugin.manifest.dir}/cc-settings.json` : null;
    }
}

export class CCCompact {
    private static groups: Group[] = [];
    private static container: HTMLElement | null = null;
    private static counterEl: HTMLElement | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private static settings: any = null;

    /** Call at the start of the settings tab display(). */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static begin(container: HTMLElement, settings: any, counterEl: HTMLElement): void {
        this.groups = [];
        this.container = container;
        this.settings = settings;
        this.counterEl = counterEl;
    }

    /** Number of entries currently in the section navigation bar. */
    static navCount(): number {
        return this.nav()?.children.length ?? 0;
    }

    /**
     * Marks every container child added since the previous call as belonging to `id`,
     * plus the nav entries added after `navBefore`, then adds the pin on the group's first element.
     */
    static mark(rawId: string, title: string, navBefore = -1, withPin = true): void {
        const container = this.container;
        if (!container) return;
        const id = GROUP_ALIASES[rawId] ?? rawId;
        const fresh = Array.from(container.children).filter(
            el => !(el as HTMLElement).dataset.ccGroup && !el.hasClass("graphview-cc-badge")
        ) as HTMLElement[];
        if (fresh.length === 0) return;
        fresh.forEach(el => el.dataset.ccGroup = id);

        const nav = this.nav();
        if (nav && navBefore >= 0) {
            Array.from(nav.children).slice(navBefore).forEach(el => (el as HTMLElement).dataset.ccGroup = id);
        }

        if (!withPin || this.groups.some(g => g.id === id)) return; // fixed group, or alias sub-section
        const host = fresh[0].querySelector(".setting-item-control") as HTMLElement | null ?? fresh[0];
        const holder = createDiv({ cls: "graphview-cc-pin-holder" });
        host.prepend(holder);
        const pin = new ExtraButtonComponent(holder)
            .setIcon("pin")
            .onClick(() => void this.togglePin(id));
        pin.extraSettingsEl.addClass("graphview-cc-pin");
        this.groups.push({ id, title, pin });
        this.refreshPin(id);
    }

    /** Call at the end of display(): applies compact mode to everything marked. */
    static apply(): void {
        const container = this.container;
        if (!container) return;
        const compact = CCSettings.data.compactMode;
        container.toggleClass("graphview-cc-compact", compact);
        let hidden = 0, hiddenActive = 0;
        for (const g of this.groups) {
            const show = !compact || this.isPinned(g.id);
            const els = Array.from(container.querySelectorAll(`[data-cc-group="${g.id}"], .setting-${g.id}`)) as HTMLElement[];
            if (g.id === "properties") els.push(...Array.from(container.querySelectorAll(".setting-property-key")) as HTMLElement[]);
            els.forEach(el => el.toggleClass("graphview-cc-hidden", !show));
            if (!show) {
                hidden++;
                if (this.isActive(g.id)) hiddenActive++;
            }
        }
        if (this.counterEl) {
            this.counterEl.setText(compact
                ? `${hidden} of ${this.groups.length} groups hidden` + (hiddenActive ? `, ${hiddenActive} with features ON` : "")
                : `All ${this.groups.length} groups shown — pin the ones to keep in compact mode`);
            this.counterEl.toggleClass("mod-warning", hiddenActive > 0);
        }
    }

    static async setCompact(on: boolean): Promise<void> {
        CCSettings.data.compactMode = on;
        await CCSettings.save();
        CCLogger.log("INFO", `compact mode ${on ? "ON" : "OFF"}`);
        this.apply();
    }

    private static async togglePin(id: string): Promise<void> {
        const list = CCSettings.data.pinnedGroups;
        const i = list.indexOf(id);
        if (i >= 0) list.splice(i, 1); else list.push(id);
        await CCSettings.save();
        CCLogger.log("INFO", `${i >= 0 ? "unpinned" : "pinned"} group '${id}'`);
        this.refreshPin(id);
        this.apply();
    }

    private static refreshPin(id: string): void {
        const g = this.groups.find(x => x.id === id);
        if (!g) return;
        const pinned = this.isPinned(id);
        g.pin.extraSettingsEl.toggleClass("is-pinned", pinned);
        g.pin.setTooltip(pinned ? `Pinned: "${g.title}" stays visible in compact mode` : `Pin "${g.title}" to keep it in compact mode`);
    }

    private static isPinned(id: string): boolean {
        return CCSettings.data.pinnedGroups.includes(id);
    }

    private static isActive(id: string): boolean {
        const f = this.settings?.enableFeatures;
        if (!f) return false;
        const keys = SECTION_FEATURES[id] ?? [id];
        return keys.some(k => f.graph?.[k] === true || f.localgraph?.[k] === true);
    }

    private static nav(): HTMLElement | null {
        return this.container?.querySelector(`.${NAV_CLASS}`) as HTMLElement | null;
    }
}
