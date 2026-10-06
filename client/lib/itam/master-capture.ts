/**
 * 新建型号 / 新建软件产品 → AI 整理, as the server checks it
 * (`server/providers/itam/master-capture.ts`): the values that hold, a maker
 * not on the books, records that already exist, what to check, and where it
 * was read.
 */
export type MasterCaptureCollection = 'models' | 'softwareProducts';

export interface MasterCapture {
  /** A model's extended fields come under `attributes`, by template key. */
  readonly values: Readonly<Record<string, unknown>>;
  readonly manufacturerName: string | null;
  readonly duplicates: readonly {
    readonly id: string;
    readonly name: string;
  }[];
  /** Same maker, another wording of the name: possibly the same record. */
  readonly similar?: readonly {
    readonly id: string;
    readonly name: string;
  }[];
  readonly uncertain: readonly string[];
  readonly sources: readonly { readonly title: string; readonly url: string }[];
}

/** The page tool each dialog hands its reading back through. */
export const MASTER_CAPTURE_TOOLS: Readonly<
  Record<MasterCaptureCollection, string>
> = {
  models: 'fillModel',
  softwareProducts: 'fillSoftwareProduct',
};

export const isMasterCaptureCollection = (
  collection: string,
): collection is MasterCaptureCollection =>
  collection === 'models' || collection === 'softwareProducts';

/** The form's key for an extended field kept on the model. */
export const attributeKey = (key: string): string => `attributes.${key}`;

/**
 * The form after a reading: every field the reading gave replaces what was
 * there, and nothing else changes. An adjustment hands the whole form back,
 * so a field the reader cleared on purpose stays cleared unless asked for.
 * Extended fields are form fields of their own (`attributes.<key>`).
 */
export function applyMasterCapture(
  values: Readonly<Record<string, unknown>>,
  capture: MasterCapture,
): Record<string, unknown> {
  const { attributes, ...rest } = capture.values;
  const next: Record<string, unknown> = { ...values, ...rest };
  if (attributes && typeof attributes === 'object')
    for (const [key, value] of Object.entries(attributes))
      next[attributeKey(key)] = value;
  return next;
}

/**
 * The record a form saves: its extended fields gathered back into
 * `attributes`, keeping only those the template still asks for (a category
 * changed after they were filled takes its fields with it).
 */
export function withAttributes(
  values: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  const attributes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!key.startsWith('attributes.')) record[key] = value;
    else {
      const field = key.slice('attributes.'.length);
      if (keys.includes(field) && value !== null && value !== '')
        attributes[field] = value;
    }
  }
  if (Object.keys(attributes).length > 0) record.attributes = attributes;
  return record;
}
