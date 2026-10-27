import { Component } from "obsidian";
import { GraphView, LocalGraphView } from "obsidian-typings";
import { GCOptions, GraphInstances } from "../../internal";
import { CCNodeFactorSection } from "../../cc/ccNodeFactorUI"; // [CC]
import { setupExtendedGraphSection } from "../../cc/ccExtendedGraphPanel"; // [CC]
import { HeaderToggle } from "../../cc/ccPanel"; // [CC]

export class GraphControlsUI extends Component {
    instances: GraphInstances | null;
    view: GraphView | LocalGraphView;

    graphControls: HTMLElement;

    // Sections
    sectionSettings: GCOptions;
    ccNodeFactor: CCNodeFactorSection; // [CC]
    ccEGToggle: HeaderToggle; // [CC]

    constructor(view: GraphView | LocalGraphView) {
        super();
        this.view = view;
        this.graphControls = view.contentEl.querySelector(".graph-controls") as HTMLElement;
        this.sectionSettings = new GCOptions(view);
        this.ccEGToggle = setupExtendedGraphSection(view, this.sectionSettings.root); // [CC] rename + title switch
        this.ccNodeFactor = new CCNodeFactorSection(view); // [CC]
        this.addChild(this.ccNodeFactor); // [CC]
    }

    onPluginEnabled(instances: GraphInstances): void {
        this.instances = instances;
        this.sectionSettings.onPluginEnabled(instances);
        this.ccNodeFactor.onPluginEnabled(); // [CC]
        this.ccEGToggle.set(true); // [CC]
    }

    onPluginDisabled(): void {
        this.sectionSettings.onPluginDisabled();
        this.ccNodeFactor.onPluginDisabled(); // [CC]
        this.ccEGToggle.set(false); // [CC]
    }
}