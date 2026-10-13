import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';

/** A model service as `config.yml` declares it under `ai.llmServices`, keyed by its name. */
export interface ItamModelService {
  title?: string;
  provider?: string;
  enabled?: boolean;
  sort?: number;
  options?: Record<string, unknown>;
  enabledModels?: { value: string; label?: string }[];
}

export interface ItamAiConfig {
  llmServices: Record<string, ItamModelService>;
}

/**
 * Application section (template 1.0.0-beta.64, after NocoCRM's): the model
 * services a deployment configures for ITAM's assistant, which
 * `server/providers/itam-agents/model-services.ts` creates on the Agents
 * plugin's model services page at start when they are not there yet. The
 * AI Employee plugin that once owned `ai` is gone, and the Agents plugin
 * reads its services only from that page; a deployment's `config.yml` keeps
 * the section it always had. A key is written as the value itself — a
 * `${NAME}` placeholder is not expanded.
 */
const ai: AppConfigFactory<ItamAiConfig> = defineAppConfig({
  defaults: { llmServices: {} },
});

export default ai;
