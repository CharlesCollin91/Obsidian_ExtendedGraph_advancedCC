/*
 * GraphView CC — version badge shown at the top of the plugin settings.
 */
import { CCLogger, CC_VERSION } from "./ccLogger";

export function addCCVersionBadge(container: HTMLElement): void {
    const badge = container.createDiv({ cls: "graphview-cc-badge" });
    badge.createSpan({ cls: "graphview-cc-badge-version", text: `GraphView CC v${CC_VERSION}` });
    badge.createSpan({ cls: "graphview-cc-badge-base", text: "based on Extended Graph 2.7.6" });
    const file = CCLogger.logFile;
    badge.createDiv({ cls: "graphview-cc-badge-log", text: file ? `Session log: ${file}` : "Session log: disabled" });
}
