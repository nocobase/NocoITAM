import { demoModeServiceToken } from '@nocobase/app-plugin-demo-mode/server/tokens';
import type { ServiceContainer } from '@nocobase/service-provider';

/** Also works in the generator's bare service harness, without plugins. */
export function isDemoMode(container: ServiceContainer): boolean {
  return (
    container.has(demoModeServiceToken) &&
    container.resolve(demoModeServiceToken).enabled
  );
}
