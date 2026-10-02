import type { StateCategory } from '@gisik-nokma/domain';

/**
 * The word for each state category, one place for every screen that names one: the builder's state rows, and the
 * workflow list and version history chips (UX fixes T6, 23.093 — a category is never colour alone).
 */
export const CATEGORY_LABEL: Record<StateCategory, string> = { open: 'Open', active: 'Active', terminal: 'Done' };
