import { Component } from "obsidian";
import { GraphView, LocalGraphView } from "obsidian-typings";
import { GCOptions, GraphInstances } from "../../internal";
import { CCNodeFactorSection } from "../../cc/ccNodeFactorUI"; // [CC]
import { setupExtendedGraphSection } from "../../cc/ccExtendedGraphPanel"; // [CC]
import { HeaderToggle } from "../../cc/ccPanel"; // [CC]
import { CCOptionCCSection } from "../../cc/ccOptionCC"; // [CC]
import { CCFilterRows, renameGroupsSection } from "../../cc/ccFilterRows"; // [CC]

export class GraphControlsUI extends Component {
    instances: GraphInstances | null;
    view: GraphView | LocalGraphView;

    graphControls: HTMLElement;

    // Sections
    sectionSettings: GCOptions;
    ccNodeFactor: CCNodeFactorSection; // [CC]
    ccEGToggle: HeaderToggle; // [CC]
    ccOptionCC?: CCOptionCCSection; // [CC] global graph only
    ccFilterRows: CCFilterRows; // [CC] "+ Add query" under Filters search

    constructor(view: GraphView | LocalGraphView) {
        super();
        this.view = view;
        this.graphControls = view.contentEl.querySelector(".graph-controls") as HTMLElement;
        this.sectionSettings = new GCOptions(view);
        this.ccEGToggle = setupExtendedGraphSection(view, this.sectionSettings.root); // [CC] rename + title switch
        renameGroupsSection(view); // [CC] "Groups" -> "Color by group"
        this.ccFilterRows = new CCFilterRows(view); // [CC]
        this.ccNodeFactor = new CCNodeFactorSection(view); // [CC]
        this.addChild(this.ccNodeFactor); // [CC]
        if (view.getViewType() === "graph") { this.ccOptionCC = new CCOptionCCSection(view); this.addChild(this.ccOptionCC); } // [CC]
    }

    onPluginEnabled(instances: GraphInstances): void {
        this.instances = instances;
        this.sectionSettings.onPluginEnabled(instances);
        this.ccNodeFactor.onPluginEnabled(); // [CC]
        this.ccEGToggle.set(true); // [CC]
        this.ccOptionCC?.onPluginEnabled(); // [CC]
        this.ccFilterRows.enable(instances.engine); // [CC]
    }

    onPluginDisabled(): void {
        this.sectionSettings.onPluginDisabled();
        this.ccNodeFactor.onPluginDisabled(); // [CC]
        this.ccEGToggle.set(false); // [CC]
        this.ccOptionCC?.onPluginDisabled(); // [CC]
        this.ccFilterRows.disable(); // [CC]
    }
}