/*
 * GraphView CC — helpers for the graph controls panel (right side of the graph view):
 *  - an on/off switch at the far right of a section title,
 *  - the same margin at the bottom of the panel as at the top.
 */
import { setTooltip, ToggleComponent } from "obsidian";

export interface HeaderToggle {
    set(value: boolean): void;          // update without firing onChange
    setDisabled(disabled: boolean): void;
}

/** Adds a switch at the far right of a section header (".tree-item-self"). Clicking it never folds the section. */
export function addHeaderToggle(sectionRoot: HTMLElement, tooltip: string, initial: boolean, onChange: (v: boolean) => void): HeaderToggle {
    const head = sectionRoot.querySelector(":scope > .tree-item-self") as HTMLElement;
    head.querySelectorAll(":scope > .graphview-cc-head-toggle").forEach(el => el.remove()); // stale copy (hot reload)
    const holder = head.createDiv({ cls: "graphview-cc-head-toggle" });
    ["click", "mousedown", "pointerdown"].forEach(ev => holder.addEventListener(ev, e => e.stopPropagation()));
    setTooltip(holder, tooltip, { placement: "left" });
    let syncing = false;
    const toggle = new ToggleComponent(holder).setValue(initial).onChange(v => {
        if (!syncing) onChange(v);
    });
    return {
        set(value: boolean) {
            if (toggle.getValue() === value) return;
            syncing = true;
            toggle.setValue(value);
            syncing = false;
        },
        setDisabled(disabled: boolean) {
            toggle.setDisabled(disabled);
            holder.toggleClass("is-disabled", disabled);
        },
    };
}

/** Bottom margin = top margin when the panel is taller than the view (it then scrolls inside). */
export function equalizePanelMargins(controls: HTMLElement): void {
    const measured = parseFloat(getComputedStyle(controls).top);
    const top = measured > 0 ? measured : 8; // not laid out yet -> Obsidian's usual offset
    controls.style.setProperty("--graphview-cc-panel-gap", `${top}px`);
    controls.addClass("graphview-cc-panel-margins");
}

/** Renames a section title (the text in ".graph-control-section-header"). */
export function renameSection(sectionRoot: HTMLElement, title: string): void {
    const h = sectionRoot.querySelector(".graph-control-section-header");
    if (h) h.textContent = title;
}
