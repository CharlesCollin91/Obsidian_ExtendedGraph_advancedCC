/*
 * GraphView CC — badge at the top of the plugin settings:
 * version, session log path, compact mode switch and hidden-groups counter.
 */
import { ToggleComponent } from "obsidian";
import { CCLogger, CC_VERSION } from "./ccLogger";
import { CCCompact, CCSettings } from "./ccCompact";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function addCCVersionBadge(container: HTMLElement, settings?: any): void {
    const badge = container.createDiv({ cls: "graphview-cc-badge" });

    const top = badge.createDiv({ cls: "graphview-cc-badge-row" });
    const title = top.createDiv();
    title.createSpan({ cls: "graphview-cc-badge-version", text: `GraphView CC v${CC_VERSION}` });
    title.createSpan({ cls: "graphview-cc-badge-base", text: "based on Extended Graph 2.7.6" });

    const sw = top.createDiv({ cls: "graphview-cc-compact-switch" });
    sw.createSpan({ text: "Compact mode" });
    new ToggleComponent(sw)
        .setValue(CCSettings.data.compactMode)
        .setTooltip("ON: show only pinned groups. OFF: show everything.")
        .onChange(v => void CCCompact.setCompact(v));

    const counter = badge.createDiv({ cls: "graphview-cc-badge-counter" });
    const file = CCLogger.logFile;
    badge.createDiv({ cls: "graphview-cc-badge-log", text: file ? `Session log: ${file}` : "Session log: disabled" });

    CCCompact.begin(container, settings, counter);
}
