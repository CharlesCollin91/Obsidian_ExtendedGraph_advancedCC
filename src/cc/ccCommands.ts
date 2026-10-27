/*
 * GraphView CC — command palette entries (Ctrl+P, type "GraphView CC").
 * Both write to the debug log (Settings → Other settings → Debug log).
 */
import { Notice, Plugin } from "obsidian";
import { CCLogger, CC_VERSION } from "./ccLogger";
import { CCNodeFactor } from "./ccNodeFactor";

export function addCCCommands(plugin: Plugin): void {
    plugin.addCommand({
        id: "cc-log-self-test",
        name: "Debug log: self-test",
        callback: () => {
            new Notice(`GraphView CC v${CC_VERSION}: ${CCLogger.selfTest()}`, 8000);
        },
    });

    plugin.addCommand({
        id: "cc-nodefactor-table",
        name: "Debug log: write node weight table",
        callback: () => {
            if (!CCLogger.isOn) {
                new Notice("GraphView CC: debug log is off (Settings → Other settings → Debug log)");
                return;
            }
            CCLogger.log("TEST", CCNodeFactor.table());
            new Notice(`GraphView CC: node weight table (${CCNodeFactor.results().size} nodes) written to the debug log`, 6000);
        },
    });
}
