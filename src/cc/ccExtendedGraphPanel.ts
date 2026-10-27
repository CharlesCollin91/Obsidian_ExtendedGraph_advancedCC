/*
 * ExtendedGraph_advancedCC — the Extended Graph "Options" section of the graph panel, renamed "Extended Graph":
 *  - on/off switch in its title (enables/disables Extended Graph on this graph view),
 *  - compact options, and the "Other settings" section at the end of the plugin settings page.
 */
import { ExtraButtonComponent, setIcon, Setting, ToggleComponent } from "obsidian";
import { GraphView, LocalGraphView } from "obsidian-typings";
import { addHeaderToggle, HeaderToggle, renameSection } from "./ccPanel";
import { CCSettings } from "./ccSettings";
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
    renameSection(sectionRoot, "Extended Graph");
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

const OTHER_ID = "cc-other";
const OTHER_CLASS = `setting-${OTHER_ID}`;

/**
 * "Other settings" section at the end of the plugin settings page, built like the
 * Extended Graph sections (heading + fold chevron + nav entry; compact-mode pin added by CCCompact).
 * Returns the number of nav entries before it (for CCCompact.mark).
 */
export function addCCOtherSettings(container: HTMLElement): void {
    // Heading
    const header = new Setting(container).setName("Other settings").setHeading();
    header.settingEl.addClass(OTHER_CLASS);
    const iconEl = createDiv();
    header.settingEl.prepend(iconEl);
    setIcon(iconEl, "settings-2");
    const fold = new ExtraButtonComponent(header.nameEl).setIcon("chevron-right");
    fold.extraSettingsEl.addClass("setting-header-fold-icon");
    const setCollapsed = (c: boolean) => {
        header.settingEl.toggleClass("is-collapsed", c);
        CCSettings.data.otherCollapsed = c;
    };
    setCollapsed(CCSettings.data.otherCollapsed);
    fold.onClick(() => { setCollapsed(!header.settingEl.hasClass("is-collapsed")); void CCSettings.save(); });

    // Nav entry ("Go to" bar), like the other sections
    const nav = container.querySelector<HTMLElement>(".extended-graph-nav-settings");
    if (nav) {
        const div = nav.createDiv();
        new ExtraButtonComponent(div).setIcon("settings-2").setTooltip("Other settings")
            .onClick(() => header.settingEl.scrollIntoView());
        div.appendText("Other");
    }

    // Extended Graph panel: label + [Compact mode  (switch)] at the far right
    const row = new Setting(container)
        .setName("Extended Graph panel")
        .setDesc("On: show only essential options. Off: all options.");
    row.settingEl.addClass(OTHER_CLASS);
    const ctl = row.controlEl.createDiv({ cls: "toggle-labelled" });
    ctl.createSpan({ text: "Compact mode" });
    new ToggleComponent(ctl)
        .setValue(CCSettings.data.egPanelCompact)
        .setTooltip("On: show only essential options. Off: all options.")
        .onChange(async v => {
            CCSettings.data.egPanelCompact = v;
            await CCSettings.save();
            CCLogger.log("INFO", `ExtendedGraph panel: ${v ? "compact" : "full"} options`);
            refreshExtendedGraphSections();
        });

    // Debug log (off by default)
    const dbg = new Setting(container)
        .setName("Debug log")
        .setDesc("Writes one diagnostic file per session in the plugin folder (logs). Nothing leaves your computer.")
        .addToggle(t => t.setValue(CCSettings.data.debugLog).onChange(async v => {
            CCSettings.data.debugLog = v;
            await CCSettings.save();
            CCLogger.setEnabled(v);
        }));
    dbg.settingEl.addClass(OTHER_CLASS);
}
