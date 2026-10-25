// @vitest-environment node
import { existsSync, mkdtempSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { driveManagerToken } from '@nocobase/app-server/drive';
import { createSeeder } from '@nocobase/db';
import { createDriveManager } from '@nocobase/drive';
import { ServiceContainer } from '@nocobase/service-provider';
import { expect, it, vi } from 'vitest';

import { PICTURE_FILE_IDS } from '../../database/main/seeds/202609150001_seed_itam_manufacturers_models.js';
import { createTestDatabase } from '../support/test-database.js';

const seedsDirectory = path.resolve('database/main/seeds');

it.each(['container', 'configuration'])(
  'seeds pictures into the application disk from %s, independently of the host process storage',
  async (source) => {
    const directory = mkdtempSync(path.join(tmpdir(), 'itam-picture-seed-'));
    const hostStorage = path.join(directory, 'host');
    const appStorage = path.join(directory, 'app');
    vi.stubEnv('APP_STORAGE_DIR', hostStorage);
    const db = await createTestDatabase();
    try {
      const config = {
        default: 'local',
        disks: {
          local: {
            driver: 'fs' as const,
            location: appStorage,
            visibility: 'private' as const,
          },
        },
      };
      const drive = createDriveManager(config);
      const container = new ServiceContainer();
      if (source === 'container') container.instance(driveManagerToken, drive);
      const seeder = createSeeder({
        database: db.database,
        packageName: 'itam',
        directory: seedsDirectory,
        container,
        config: {
          get: <T>(name: string) =>
            (name === 'drive' ? config : undefined) as T | undefined,
        },
      });
      await seeder.run();
      for (const [filename, id] of Object.entries(PICTURE_FILE_IDS)) {
        const key = `objects/${id}.jpg`;
        expect(Buffer.from(await drive.use('local').getBytes(key))).toEqual(
          await readFile(path.join(seedsDirectory, 'assets/models', filename)),
        );
        expect(existsSync(path.join(hostStorage, key))).toBe(false);
      }
      expect((await seeder.run()).executed).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
      await db.destroy();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
