/**
 * 新建型号 / 新建软件产品 → AI 整理, as the server checks it
 * (`server/providers/itam/master-capture.ts`): the values that hold, a maker
 * not on the books, records that already exist, what to check, and where it
 * was read.
 */
export type MasterCaptureCollection = 'models' | 'softwareProducts';

export interface MasterCapture {
  readonly values: Readonly<Record<string, string | number>>;
  readonly manufacturerName: string | null;
  readonly duplicates: readonly {
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

/**
 * The form after a reading: every field the reading gave replaces what was
 * there, and nothing else changes. An adjustment hands the whole form back,
 * so a field the reader cleared on purpose stays cleared unless asked for.
 */
export function applyMasterCapture(
  values: Readonly<Record<string, unknown>>,
  capture: MasterCapture,
): Record<string, unknown> {
  return { ...values, ...capture.values };
}
