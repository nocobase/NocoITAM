// The role editor shows only the business operations and settings the
// application opts into (client/pages/settings/permission-workspace.ts), so
// every operation ITAM registers on the server has to be listed there, or an
// administrator can no longer grant or see it.
import { describe, expect, it } from 'vitest';
import {
  resolveAppClientContributions,
  type AppClientRegisteredRoute,
} from '@nocobase/app-client/plugins';
import type { AuthorizationOptionsResponse } from '@nocobase/app-plugin-authorization/client';
import applicationRoutes from '../../client/routes.js';
import {
  permissionWorkspaceCatalog,
  permissionWorkspaceSelection,
} from '../../client/pages/settings/permission-workspace.js';
import {
  ITAM_COLLECTIONS,
  ITAM_SETTINGS_RESOURCE,
} from '../../server/providers/itam/collections.js';
import {
  operationsOf,
  resourceIdOf,
} from '../../server/providers/itam/authz-resources.js';

const selected = (id: string) =>
  permissionWorkspaceSelection.business.find(
    (entry) => entry.type === 'composite' && entry.id === id,
  )?.actions;

describe("ITAM's permission workspace", () => {
  it("lists every Collection's operations", () => {
    const withOperations = ITAM_COLLECTIONS.filter(
      (collection) => operationsOf(collection).length > 0,
    );
    expect(
      permissionWorkspaceSelection.business.map((entry) => entry.id).sort(),
    ).toEqual(
      withOperations.map((collection) => resourceIdOf(collection.name)).sort(),
    );
    for (const collection of withOperations)
      expect(selected(resourceIdOf(collection.name))).toEqual([
        ...operationsOf(collection),
      ]);
  });

  it("offers ITAM's settings item, whose pages check a page grant", () => {
    const routes: readonly AppClientRegisteredRoute[] =
      resolveAppClientContributions([
        {
          packageName: 'itam-workspace-check',
          source: 'application',
          routes: applicationRoutes,
        },
      ]).routes;
    const source: AuthorizationOptionsResponse = {
      sections: [
        {
          name: 'administration',
          title: 'Administration',
          order: 200,
          subsections: [
            {
              name: 'itam.admin',
              title: 'ITAM',
              resources: [
                {
                  ...ITAM_SETTINGS_RESOURCE,
                  title: 'ITAM settings',
                  actions: [
                    { name: 'read', title: 'Read' },
                    { name: 'update', title: 'Update' },
                  ],
                },
              ],
            },
          ],
        },
      ],
      subjectTypes: [],
      recordAccess: [],
      collections: [],
    };
    const configuration = permissionWorkspaceCatalog(
      source,
      routes,
      [],
    ).sections.find((section) => section.name === 'configuration');
    expect(
      configuration?.subsections
        .flatMap((sub) => sub.resources)
        .map((resource) => [
          resource.id,
          resource.actions.map((action) => action.name),
        ]),
    ).toEqual([[ITAM_SETTINGS_RESOURCE.id, ['read', 'update']]]);
  });
});
