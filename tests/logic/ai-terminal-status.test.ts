// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { AI_WRITE_SCHEMAS } from '../../server/providers/itam/ai-writes.js';
import {
  CORRECTABLE_STATUSES,
  DEVICE_STATUSES,
  OPERATION_FROM,
  type DeviceStatus,
} from '../../server/providers/itam/device-status.js';

/**
 * A terminal state is a person's own act, taken on the record's page with
 * everything that page shows. The assistant proposes; a card the user confirms
 * still writes what the card says, so the proposal itself has to be impossible
 * rather than merely discouraged in the instructions.
 */
describe('the assistant cannot propose a terminal device status', () => {
  const correct = (status: string) =>
    AI_WRITE_SCHEMAS.itam_correct_device_status.safeParse({
      title: 'Correct it',
      deviceId: 'device-1',
      status,
      reason: 'The audit found it on the shelf',
    });

  it('refuses the status executing a disposal produces', () => {
    expect(correct('disposed').success).toBe(false);
  });

  it('refuses the status a disposal request produces', () => {
    expect(correct('pendingDisposal').success).toBe(false);
  });

  it('still corrects the ones a person can get back out of', () => {
    const accepted = CORRECTABLE_STATUSES.filter(
      (status) => correct(status).success,
    );
    expect(accepted).toEqual(CORRECTABLE_STATUSES);
  });

  it('offers every status no operation leads out of, and no others', () => {
    // The list is derived here rather than repeated: a status is correctable
    // exactly when some operation can leave it.
    const escapable = new Set<DeviceStatus>(
      DEVICE_STATUSES.filter((status) =>
        Object.values(OPERATION_FROM).some((from) => from.includes(status)),
      ),
    );
    expect([...CORRECTABLE_STATUSES].sort()).toEqual(
      [...escapable].filter((status) => status !== 'pendingDisposal').sort(),
    );
  });
});
