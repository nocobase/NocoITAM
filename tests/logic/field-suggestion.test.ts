import { describe, expect, it } from 'vitest';

import type { TemplateField } from '../../client/lib/itam/field-template.js';
import { keepHeldFields } from '../../client/lib/itam/field-suggestion.js';

const field = (key: string, label = key): TemplateField => ({
  key,
  label,
  type: 'text',
});

describe('keepHeldFields', () => {
  const held = [field('ip'), field('contrast'), field('weight')];

  it('keeps the fields the category has when an adjustment drops them', () => {
    // "不扩充了": the model handed back only one of them and nothing new.
    expect(
      keepHeldFields(held, [...held, field('throw')], [field('ip')]).map(
        (each) => each.key,
      ),
    ).toEqual(['ip', 'contrast', 'weight']);
  });

  it('takes the changes and new fields the adjustment made', () => {
    const fields = keepHeldFields(held, held, [
      field('contrast', 'Contrast ratio'),
      field('lamp'),
    ]);
    expect(fields.map((each) => [each.key, each.label])).toEqual([
      ['ip', 'ip'],
      ['contrast', 'Contrast ratio'],
      ['weight', 'weight'],
      ['lamp', 'lamp'],
    ]);
  });

  it('leaves out a held field deleted in the editor by hand', () => {
    expect(
      keepHeldFields(held, [field('ip'), field('weight')], []).map(
        (each) => each.key,
      ),
    ).toEqual(['ip', 'weight']);
  });
});
