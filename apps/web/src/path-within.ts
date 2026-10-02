/**
 * Whether `pathname` is `root` or a route under it, bounded at a path SEGMENT (UX fixes Task 3, case 23.044): the nav's
 * "where am I" rule for a section. `/settings/x` is within `/settings`; `/settingsx` is not.
 */
export function isWithin(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}
