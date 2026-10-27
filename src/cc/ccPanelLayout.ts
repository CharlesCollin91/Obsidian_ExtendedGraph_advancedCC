/*
 * GraphView CC — layout of the graph controls panel:
 *   order:  Filters · Node Color · Node Repartition · Node Weight · Node level · Extended Graph · (others) · Options
 *   Node Repartition = native "Display" + "Forces" merged (one title, both contents; folding together)
 *   renames: Groups -> Node Color, Display -> Node Repartition (ExtendedGraph/NodeFactor/OptionCC renamed where created)
 *   "Options" = new empty section, last, for future settings.
 */
import { Component, setIcon } from "obsidian";
import { GraphView, LocalGraphView } from "obsidian-typings";

const NATIVE: Record<string, { cls: string; title: string }> = {
    filter: { cls: "mod-filter", title: "Filters" },
    groups: { cls: "mod-color-groups", title: "Groups" },
    display: { cls: "mod-display", title: "Display" },
    forces: { cls: "mod-forces", title: "Forces" },
};

function header(section: Element): HTMLElement | null {
    return section.querySelector(":scope > .tree-item-self .graph-control-section-header");
}

/** Native section by class, or by its (original or already renamed) title. */
function findNative(controls: HTMLElement, key: keyof typeof NATIVE, renamed?: string): HTMLElement | null {
    const byCls = controls.querySelector<HTMLElement>(`:scope > .graph-control-section.${NATIVE[key].cls}`);
    if (byCls) return byCls;
    const all = Array.from(controls.querySelectorAll<HTMLElement>(":scope > .graph-control-section"));
    return all.find(s => { const t = header(s)?.textContent?.trim(); return t === NATIVE[key].title || (!!renamed && t === renamed); }) ?? null;
}

function setTitle(section: HTMLElement | null, title: string): void {
    const h = section ? header(section) : null;
    if (h && h.textContent !== title) h.textContent = title;
}

/** Adds an icon in a native section title (native sections have none), like our sections. */
function addHeaderIcon(section: HTMLElement, icon: string): void {
    const self = section.querySelector<HTMLElement>(":scope > .tree-item-self");
    if (!self || self.querySelector(":scope > .graphview-cc-header-icon")) return;
    const el = createDiv("tree-item-header-icon graphview-cc-header-icon");
    setIcon(el, icon);
    const inner = self.querySelector(":scope > .tree-item-inner");
    self.insertBefore(el, inner ?? null);
}

const isCollapsed = (s: HTMLElement) => s.hasClass("is-collapsed");

/** Display + Forces shown as one section: Forces header hidden, Forces folds with Display. */
function mergeDisplayForces(display: HTMLElement, forces: HTMLElement): void {
    forces.addClass("graphview-cc-merged-forces");
    display.addClass("graphview-cc-merged-display");
    if ((display as HTMLElement & { ccMerged?: boolean }).ccMerged) return;
    (display as HTMLElement & { ccMerged?: boolean }).ccMerged = true;
    const sync = () => {
        if (isCollapsed(display) !== isCollapsed(forces)) {
            forces.querySelector<HTMLElement>(":scope > .tree-item-self")?.click();
        }
    };
    display.querySelector(":scope > .tree-item-self")?.addEventListener("click", () => window.setTimeout(sync, 0));
    window.setTimeout(sync, 0);
}

/** Empty "Options" section, last, for future settings. */
export class CCOptionsSection extends Component {
    private root: HTMLElement;
    constructor(view: GraphView | LocalGraphView) {
        super();
        const controls = view.contentEl.querySelector(".graph-controls") as HTMLElement;
        controls.querySelectorAll(":scope > .mod-graphview-cc-options").forEach(el => el.remove());
        this.root = controls.createDiv("tree-item graph-control-section mod-graphview-cc-options is-collapsed");
        const head = this.root.createDiv("tree-item-self mod-collapsible");
        const icon = head.createDiv("tree-item-icon collapse-icon is-collapsed");
        setIcon(icon, "right-triangle");
        setIcon(head.createDiv("tree-item-header-icon"), "settings");
        head.createDiv("tree-item-inner").createEl("header", { cls: "graph-control-section-header", text: "Options" });
        const children = createDiv("tree-item-children");
        head.onClickEvent(() => {
            const open = this.root.hasClass("is-collapsed");
            this.root.toggleClass("is-collapsed", !open);
            icon.toggleClass("is-collapsed", !open);
            if (open) this.root.appendChild(children); else children.remove();
        });
    }
    onunload(): void { this.root.remove(); }
}

/** Applies names, merge and order. Safe to call often (idempotent). */
export function applyPanelLayout(view: GraphView | LocalGraphView): void {
    const controls = view.contentEl.querySelector<HTMLElement>(".graph-controls");
    if (!controls) return;
    const filter = findNative(controls, "filter");
    const groups = findNative(controls, "groups", "Node Color") ?? findNative(controls, "groups", "Color by group");
    const display = findNative(controls, "display", "Node Repartition");
    const forces = findNative(controls, "forces");
    setTitle(groups, "Node Color");
    setTitle(display, "Node Repartition");
    if (display && forces) mergeDisplayForces(display, forces);
    if (display) addHeaderIcon(display, "orbit");

    const q = (cls: string) => controls.querySelector<HTMLElement>(`:scope > .${cls}`);
    const ordered = [
        filter, groups,
        display, forces,
        q("mod-graphview-cc-nodefactor"), q("mod-graphview-cc-optioncc"),
        q("mod-extended-graph-options"),
    ].filter((x): x is HTMLElement => !!x);
    const options = q("mod-graphview-cc-options");
    const sections = Array.from(controls.querySelectorAll<HTMLElement>(":scope > .graph-control-section"));
    const others = sections.filter(s => !ordered.includes(s) && s !== options);
    const first = sections[0];
    if (!first) return;
    // Insert in order where the first section was; non-section children (buttons) keep their place.
    const anchor = first.previousSibling;
    const list = [...ordered, ...others, ...(options ? [options] : [])];
    let ref: ChildNode | null = anchor ? anchor.nextSibling : controls.firstChild;
    for (const s of list) {
        if (s !== ref) controls.insertBefore(s, ref);
        ref = s.nextSibling;
    }
}
