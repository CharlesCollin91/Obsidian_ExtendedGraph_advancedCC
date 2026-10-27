/*
 * ExtendedGraph_advancedCC — Compact mode for the plugin settings page.
 *
 * Each settings group (top-level setting or feature section) gets a pin.
 * Compact mode ON  -> only pinned groups are shown.
 * Compact mode OFF -> everything is shown (Extended Graph default).
 * Hiding never changes a value: a hidden feature keeps working.
 *
 * Pins and the switch are stored in CCSettings (cc-settings.json).
 */
import { ExtraButtonComponent } from "obsidian";
import { CCLogger } from "./ccLogger";
import { CCSettings } from "./ccSettings";
import type { EGSettingsView } from "./ccTypes";

/** Section id -> feature keys in settings.enableFeatures (used for the "with features ON" counter). */
const SECTION_FEATURES: Record<string, string[]> = {
    "cc-other": [],
    "images": ["imagesFromProperty", "imagesFromEmbeds", "imagesForAttachments"],
    "links": ["links", "linksSameColorAsNode"],
};

/** Sub-sections that belong to a parent group. */
const GROUP_ALIASES: Record<string, string> = { "property-key": "properties" };

const NAV_CLASS = "extended-graph-nav-settings";

interface Group {
    id: string;
    title: string;
    pin: ExtraButtonComponent;
}

export class CCCompact {
    private static groups: Group[] = [];
    private static container: HTMLElement | null = null;
    private static counterEl: HTMLElement | null = null;
    private static settings: EGSettingsView | null = null;

    /** Call at the start of the settings tab display(). */
    static begin(container: HTMLElement, settings: EGSettingsView | undefined, counterEl: HTMLElement): void {
        this.groups = [];
        this.container = container;
        this.settings = settings ?? null;
        this.counterEl = counterEl;
    }

    /** Number of entries currently in the section navigation bar. */
    static navCount(): number {
        return this.nav()?.children.length ?? 0;
    }

    /**
     * Marks every container child added since the previous call as belonging to `id`,
     * plus the nav entries added after `navBefore`, then adds the pin on the group's first element.
     */
    static mark(rawId: string, title: string, navBefore = -1, withPin = true): void {
        const container = this.container;
        if (!container) return;
        const id = GROUP_ALIASES[rawId] ?? rawId;
        const fresh = Array.from(container.children).filter(
            el => !(el as HTMLElement).dataset.ccGroup && !el.hasClass("graphview-cc-badge")
        ) as HTMLElement[];
        if (fresh.length === 0) return;
        fresh.forEach(el => el.dataset.ccGroup = id);

        const nav = this.nav();
        if (nav && navBefore >= 0) {
            Array.from(nav.children).slice(navBefore).forEach(el => (el as HTMLElement).dataset.ccGroup = id);
        }

        if (!withPin || this.groups.some(g => g.id === id)) return; // fixed group, or alias sub-section
        const host = fresh[0].querySelector<HTMLElement>(".setting-item-control") ?? fresh[0];
        const holder = createDiv({ cls: "graphview-cc-pin-holder" });
        host.prepend(holder);
        const pin = new ExtraButtonComponent(holder)
            .setIcon("pin")
            .onClick(() => void this.togglePin(id));
        pin.extraSettingsEl.addClass("graphview-cc-pin");
        this.groups.push({ id, title, pin });
        this.refreshPin(id);
    }

    /** Call at the end of display(): applies compact mode to everything marked. */
    static apply(): void {
        const container = this.container;
        if (!container) return;
        const compact = CCSettings.data.compactMode;
        container.toggleClass("graphview-cc-compact", compact);
        let hidden = 0, hiddenActive = 0;
        for (const g of this.groups) {
            const show = !compact || this.isPinned(g.id);
            const els = Array.from(container.querySelectorAll<HTMLElement>(`[data-cc-group="${g.id}"], .setting-${g.id}`));
            if (g.id === "properties") els.push(...Array.from(container.querySelectorAll<HTMLElement>(".setting-property-key")));
            els.forEach(el => el.toggleClass("graphview-cc-hidden", !show));
            if (!show) {
                hidden++;
                if (this.isActive(g.id)) hiddenActive++;
            }
        }
        if (this.counterEl) {
            this.counterEl.setText(compact
                ? `${hidden} of ${this.groups.length} groups hidden` + (hiddenActive ? `, ${hiddenActive} with features ON` : "")
                : `All ${this.groups.length} groups shown — pin the ones to keep in compact mode`);
            this.counterEl.toggleClass("mod-warning", hiddenActive > 0);
        }
    }

    static async setCompact(on: boolean): Promise<void> {
        CCSettings.data.compactMode = on;
        await CCSettings.save();
        CCLogger.log("INFO", `compact mode ${on ? "ON" : "OFF"}`);
        this.apply();
    }

    private static async togglePin(id: string): Promise<void> {
        const list = CCSettings.data.pinnedGroups;
        const i = list.indexOf(id);
        if (i >= 0) list.splice(i, 1); else list.push(id);
        await CCSettings.save();
        CCLogger.log("INFO", `${i >= 0 ? "unpinned" : "pinned"} group '${id}'`);
        this.refreshPin(id);
        this.apply();
    }

    private static refreshPin(id: string): void {
        const g = this.groups.find(x => x.id === id);
        if (!g) return;
        const pinned = this.isPinned(id);
        g.pin.extraSettingsEl.toggleClass("is-pinned", pinned);
        g.pin.setTooltip(pinned ? `Pinned: "${g.title}" stays visible in compact mode` : `Pin "${g.title}" to keep it in compact mode`);
    }

    private static isPinned(id: string): boolean {
        return CCSettings.data.pinnedGroups.includes(id);
    }

    private static isActive(id: string): boolean {
        const f = this.settings?.enableFeatures;
        if (!f) return false;
        const keys = SECTION_FEATURES[id] ?? [id];
        return keys.some(k => f.graph?.[k] === true || f.localgraph?.[k] === true);
    }

    private static nav(): HTMLElement | null {
        return this.container?.querySelector<HTMLElement>(`.${NAV_CLASS}`) ?? null;
    }
}
