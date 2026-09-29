import type { AssignOutsider, LookupPerson } from '@gisik-nokma/app-core';
import type { PeopleGateway } from '@gisik-nokma/app-core/online';

/**
 * The two outsider props the flow and the sheets take, bound to one workspace
 * (access plan Task 8). One place, so the four hosts cannot bind them
 * differently.
 */
export function peopleProps(
  people: Pick<PeopleGateway, 'lookup' | 'assignOutsider'>,
  workspaceId: string,
): { lookupPerson: LookupPerson; assignOutsider: AssignOutsider } {
  return {
    lookupPerson: (email) => people.lookup(workspaceId, email),
    assignOutsider: (userId, event) => people.assignOutsider(workspaceId, userId, event),
  };
}
