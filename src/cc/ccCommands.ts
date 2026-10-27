/*
 * GraphView CC — command palette entries (Ctrl+P, type "GraphView CC").
 */
import { Notice, Plugin } from "obsidian";
import { CCLogger, CC_VERSION } from "./ccLogger";

export function addCCCommands(plugin: Plugin): void {
    plugin.addCommand({
        id: "cc-log-self-test",
        name: "Log self-test",
        callback: () => {
            const file = CCLogger.selfTest();
            new Notice(`GraphView CC v${CC_VERSION}: self-test written to\n${file}`, 8000);
        },
    });

    plugin.addCommand({
        id: "cc-open-logs-folder",
        name: "Open logs folder",
        callback: () => {
            const file = CCLogger.logFile;
            if (!file) {
                new Notice("GraphView CC: no log file for this session");
                return;
            }
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            require("electron").shell.showItemInFolder(file);
        },
    });
}
