import { defineTools, type ToolsOptions } from '@nocobase/ai-employee';
import { databaseManagerToken } from '@nocobase/db';
import { z } from 'zod';

import { today } from '../../../server/providers/itam/dates.js';

import {
  maintenanceServiceToken,
  settingsServiceToken,
  runTool,
  toolServices,
  workbenchServiceToken,
} from './shared.js';

const tool: ToolsOptions = defineTools({
  scope: 'GENERAL',
  defaultPermission: 'ALLOW',
  silence: true,
  introduction: {
    title: 'ITAM: business context',
    about:
      'The configured thresholds, business notes, what needs attention and what waits for the user.',
  },
  definition: {
    name: 'itam_business_context',
    description:
      "Read the business context before planning work: reminder thresholds, the administrator's business notes (replacement policy, approval rules, naming), the open reminders by kind, what waits for this user, and who they are (me: userId, and the person record linked to it). Call it once at the start of a task.",
    schema: z.object({}),
  },
  invoke: (ctx) =>
    runTool(async () => {
      const services = toolServices(ctx);
      const settings = services.container.resolve(settingsServiceToken);
      const [general, thresholds, ai] = await Promise.all([
        settings.get('general'),
        settings.get('thresholds'),
        settings.get('ai'),
      ]);
      const reminders = (await services.scope.may('reminders', 'read'))
        ? await services.container
            .resolve(maintenanceServiceToken)
            .reminderCounts()
        : [];
      const myWork = await services.container
        .resolve(workbenchServiceToken)
        .myWork(services.actorId, (collection, action) =>
          services.scope.may(collection, action),
        );
      // Who is asking: an audit's executors and an approval's approver are
      // user ids, and "my devices" means the person linked to this user.
      const person = await services.container
        .resolve(databaseManagerToken)
        .query()
        .selectFrom('people')
        .select(['id', 'name'])
        .where('userId', '=', services.actorId)
        .executeTakeFirst<{ id: string; name: string }>();
      return {
        status: 'success',
        content: {
          today: today(),
          me: {
            userId: services.actorId,
            personId: person?.id ?? null,
            personName: person?.name ?? null,
          },
          currency: general.currency,
          thresholds,
          businessNotes: ai.businessNotes,
          reminders: reminders.filter((entry) => entry.count > 0),
          myWork,
        },
      };
    }),
});

export default tool;
