import { describe, expect, it } from 'vitest';

import {
  applyMasterCapture,
  withAttributes,
} from '../../client/lib/itam/master-capture.js';
import { effectiveAttributes } from '../../client/lib/itam/model-attributes.js';

describe('extended fields kept on the model', () => {
  it('reads a device’s own value first, then its model’s', () => {
    expect(
      effectiveAttributes(
        { os: 'macOS', memory: '32 GB', storage: '' },
        { memory: '16 GB', storage: '512 GB', screenSize: '14', os: 'iOS' },
        ['memory', 'storage', 'screenSize'],
      ),
    ).toEqual({
      os: 'macOS',
      memory: '32 GB',
      storage: '512 GB',
      screenSize: '14',
    });
  });

  it('puts a reading’s extended fields on the form and gathers them back', () => {
    const form = applyMasterCapture(
      { name: 'Old', 'attributes.cpu': 'stale' },
      {
        values: { name: 'New', attributes: { cpu: 'M3', memory: '16 GB' } },
        manufacturerName: null,
        duplicates: [],
        uncertain: [],
        sources: [],
      },
    );
    expect(form).toEqual({
      name: 'New',
      'attributes.cpu': 'M3',
      'attributes.memory': '16 GB',
    });
    // A field the category no longer asks for is not saved.
    expect(
      withAttributes({ ...form, 'attributes.legacy': 'x' }, ['cpu', 'memory']),
    ).toEqual({ name: 'New', attributes: { cpu: 'M3', memory: '16 GB' } });
    expect(
      withAttributes({ name: 'Bare', 'attributes.cpu': '' }, ['cpu']),
    ).toEqual({ name: 'Bare' });
  });
});
