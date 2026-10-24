import type { AppConfigFactory } from '@nocobase/app-server/config';
import {
  defineDemoModeConfig,
  type DemoModeConfig,
} from '@nocobase/app-plugin-demo-mode/config';

const demoMode: AppConfigFactory<DemoModeConfig> = defineDemoModeConfig();

export default demoMode;
