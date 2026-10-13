import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AgentsConfig } from '@nocobase/app-plugin-agents/server/tokens';

/**
 * The Agents plugin's section (template 1.0.0-beta.64). Agents call ITAM
 * through its command line, named `itam` here rather than after the
 * application's mount path, so the commands they run, the skill that
 * explains them (server/providers/itam-agents/skill.ts) and their help read
 * alike.
 */
const agents: AppConfigFactory<AgentsConfig> = defineAppConfig({
  defaults: {
    cli: { name: 'itam' },
    app: { id: 'nocoitam', name: 'NocoITAM' },
    // Model calls an online run may make before it gives up (the plugin's
    // 16 by default): a question across the register reads statistics,
    // lists and several records before answering.
    server: { maxSteps: 40 },
  },
});

export default agents;
