/*
 * GraphView CC — small structural types for the Obsidian / Extended Graph internals we touch.
 * (Obsidian's graph API is private: these describe only the members we read.)
 */

export type FeatureFlags = Record<string, boolean | undefined>;

/** The part of Extended Graph's settings we read. */
export interface EGSettingsView {
    maxNodes?: number;
    delay?: number;
    startingStateID?: string;
    enableFeatures?: { graph?: FeatureFlags; localgraph?: FeatureFlags };
}

/** A graph view as far as the logger is concerned. */
export interface GraphViewLike {
    getViewType?: () => string;
    leaf?: { id?: string };
    renderer?: { nodes?: unknown[]; links?: unknown[] };
}

/** The graph engine members used by the extra filter rows. */
export interface SearchEngineLike {
    filterOptions?: { search?: { inputEl?: HTMLInputElement } };
    updateSearch: (...args: unknown[]) => unknown;
    getOptions: (...args: unknown[]) => unknown;
}
