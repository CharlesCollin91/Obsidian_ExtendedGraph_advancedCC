/*
 * GraphView CC — our own settings, stored in <plugin folder>/cc-settings.json
 * (separate from Extended Graph's data.json; never shipped by a release).
 */
import { Plugin } from "obsidian";
import { CCLogger } from "./ccLogger";
import { NodeFactorSettings, normalizeNodeFactor } from "./ccNodeFactor";
import { OPTIONCC_DEFAULTS, OptionCCSettings } from "./ccOptionCC";
import type { FilterRow } from "./ccFilterRows";

export interface CCSettingsData {
    debugLog: boolean;          // optional debug log (OFF by default)
    compactMode: boolean;       // settings page: show only pinned groups
    pinnedGroups: string[];
    nodeFactor: NodeFactorSettings;
    egPanelCompact: boolean;    // Extended Graph panel section: essential options only
    otherCollapsed: boolean;    // "Other settings" section folded
    optionCC: OptionCCSettings; // Node level (local-graph options on the global graph)
    filterRows: FilterRow[];    // extra queries under the Filters search box
}

/** Builds a complete settings object from anything read on disk (older versions included). */
function complete(raw: Partial<CCSettingsData> | undefined): CCSettingsData {
    const r = raw ?? {};
    return {
        debugLog: r.debugLog === true,
        compactMode: r.compactMode === true,
        pinnedGroups: Array.isArray(r.pinnedGroups) ? r.pinnedGroups.map(String) : [],
        nodeFactor: normalizeNodeFactor(r.nodeFactor),
        egPanelCompact: r.egPanelCompact === true,
        otherCollapsed: r.otherCollapsed !== false,
        optionCC: { ...OPTIONCC_DEFAULTS, ...(r.optionCC ?? {}) },
        filterRows: Array.isArray(r.filterRows) ? r.filterRows : [],
    };
}

export class CCSettings {
    static data: CCSettingsData = complete(undefined);
    private static plugin: Plugin | null = null;

    static async load(plugin: Plugin): Promise<void> {
        this.plugin = plugin;
        try {
            const p = this.path();
            if (p && await plugin.app.vault.adapter.exists(p)) {
                this.data = complete(JSON.parse(await plugin.app.vault.adapter.read(p)) as Partial<CCSettingsData>);
            }
        } catch (e) {
            this.data = complete(undefined);
            CCLogger.error("cc-settings.json load failed (defaults used)", e);
        }
        const d = this.data;
        CCLogger.log("INIT", `compact mode=${d.compactMode ? "ON" : "OFF"}, pinned=[${d.pinnedGroups.join(", ")}], extended graph panel=${d.egPanelCompact ? "compact" : "full"}`);
        CCLogger.log("INIT", `node weight ${d.nodeFactor.enabled ? "ON" : "OFF"}: ${JSON.stringify(d.nodeFactor)}`);
        CCLogger.log("INIT", `node level: ${JSON.stringify(d.optionCC)} | filter rows: ${JSON.stringify(d.filterRows)}`);
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
