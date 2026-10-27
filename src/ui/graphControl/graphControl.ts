import { Component } from "obsidian";
import { GraphView, LocalGraphView } from "obsidian-typings";
import { GCOptions, GraphInstances } from "../../internal";
import { CCNodeFactorSection } from "../../cc/ccNodeFactorUI"; // [CC]

export class GraphControlsUI extends Component {
    instances: GraphInstances | null;
    view: GraphView | LocalGraphView;

    graphControls: HTMLElement;

    // Sections
    sectionSettings: GCOptions;
    ccNodeFactor: CCNodeFactorSection; // [CC]

    constructor(view: GraphView | LocalGraphView) {
        super();
        this.view = view;
        this.graphControls = view.contentEl.querySelector(".graph-controls") as HTMLElement;
        this.sectionSettings = new GCOptions(view);
        this.ccNodeFactor = new CCNodeFactorSection(view); // [CC]
        this.addChild(this.ccNodeFactor); // [CC]
    }

    onPluginEnabled(instances: GraphInstances): void {
        this.instances = instances;
        this.sectionSettings.onPluginEnabled(instances);
        this.ccNodeFactor.onPluginEnabled(); // [CC]
    }

    onPluginDisabled(): void {
        this.sectionSettings.onPluginDisabled();
        this.ccNodeFactor.onPluginDisabled(); // [CC]
    }
}