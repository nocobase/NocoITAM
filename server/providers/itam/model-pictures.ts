import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { databaseManagerToken } from '@nocobase/db';

import { PICTURE_FILE_IDS } from '../../../database/main/seeds/202609150001_seed_itam_manufacturers_models.js';

/**
 * Older hosted installs recorded the pictures but wrote their bytes outside the
 * application's volume. Their seed has already run, so repair missing objects
 * at start without resetting data or replaying installation history.
 */
export async function restoreModelPictures(app: Application): Promise<number> {
  const files = await app.container
    .resolve(databaseManagerToken)
    .query()
    .selectFrom('itamFiles')
    .select(['id', 'disk', 'key', 'filename', 'ext', 'mimeType', 'size'])
    .where('id', 'in', Object.values(PICTURE_FILE_IDS))
    .execute();
  const byId = new Map(files.map((file) => [String(file.id), file]));
  const disk = app.container.resolve(driveManagerToken).use('local');
  let restored = 0;
  for (const [filename, id] of Object.entries(PICTURE_FILE_IDS)) {
    const file = byId.get(id);
    const key = `objects/${id}${path.extname(filename)}`;
    // A deleted or changed file record belongs to the administrator. Only
    // repair the original seed's objects, and never replace existing bytes.
    if (
      !file ||
      file.disk !== 'local' ||
      file.key !== key ||
      file.filename !== filename ||
      file.ext !== path.extname(filename).slice(1) ||
      file.mimeType !== 'image/jpeg' ||
      (await disk.exists(key))
    )
      continue;
    const bytes = await readFile(
      app.paths.database(`main/seeds/assets/models/${filename}`),
    );
    if (Number(file.size) !== bytes.byteLength) continue;
    await disk.put(key, bytes);
    restored += 1;
  }
  return restored;
}
