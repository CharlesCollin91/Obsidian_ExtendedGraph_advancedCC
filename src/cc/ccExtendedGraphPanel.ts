/*
 * GraphView CC — the Extended Graph "Options" section of the graph panel, renamed "ExtendedGraph":
 *  - on/off switch in its title (enables/disables Extended Graph on this graph view),
 *  - compact options (setting at the end of the plugin settings page).
 */
import { Setting } from "obsidian";
import { GraphView, LocalGraphView } from "obsidian-typings";
import { addHeaderToggle, HeaderToggle, renameSection } from "./ccPanel";
import { CCSettings } from "./ccCompact";
import { CCLogger } from "./ccLogger";
import { ExtendedGraphInstances } from "../internal";

/** Options kept in compact mode (the others are hidden). */
export const EG_COMPACT_KEEP = ["saveForDefaultState", "saveForNormalState", "unpinAllNodes", "pinMultipleNodes"] as const;
export type EGOption = "importConfig" | "saveForDefaultState" | "saveForNormalState" | "zoomOnNode" | "screenshot"
    | "viewState" | "pinMultipleNodes" | "unpinAllNodes" | "selectionModes";

/** Used by GCOptions.display(): should this option be shown? */
export function egShow(option: EGOption): boolean {
    return !CCSettings.data.egPanelCompact || (EG_COMPACT_KEEP as readonly string[]).includes(option);
}

export function setupExtendedGraphSection(view: GraphView | LocalGraphView, sectionRoot: HTMLElement): HeaderToggle {
    renameSection(sectionRoot, "ExtendedGraph");
    const lm = () => ExtendedGraphInstances.graphsManager.lifecycleManager;
    const toggle = addHeaderToggle(sectionRoot, "Extended Graph on/off for this graph view", false, v => {
        CCLogger.log("INFO", `ExtendedGraph ${v ? "enable" : "disable"} requested from panel title`);
        if (v) lm().enablePlugin(view); else lm().disablePlugin(view);
        // enabling can be refused (e.g. node limit): re-sync the switch with the real state
        window.setTimeout(() => toggle.set(lm().isPluginAlreadyEnabled(view)), 800);
    });
    return toggle;
}

/** Redraws the ExtendedGraph section of every open graph panel. */
export function refreshExtendedGraphSections(): void {
    for (const ui of ExtendedGraphInstances.graphsManager?.graphLeavesManager.globalUIs.values() ?? []) {
        const opts = ui.control.sectionSettings;
        opts.display(!!opts.instances);
    }
}

/** Block at the end of the plugin settings page. */
export function addCCPanelSettings(container: HTMLElement): void {
    new Setting(container).setName("Graph panel (GraphView CC)").setHeading();
    new Setting(container)
        .setName("ExtendedGraph section: compact options")
        .setDesc("ON: the ExtendedGraph section of the graph panel only shows Save for default state, Save for native state, Unpin all nodes and Pin multiple nodes. OFF: all options.")
        .addToggle(t => t.setValue(CCSettings.data.egPanelCompact).onChange(async v => {
            CCSettings.data.egPanelCompact = v;
            await CCSettings.save();
            CCLogger.log("INFO", `ExtendedGraph panel: ${v ? "compact" : "full"} options`);
            refreshExtendedGraphSections();
        }));
}
