import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * The seeded manufacturers' support sites (2026-10-21), so a maker's page
 * says where to go for help. Only the official support URL: a phone number
 * or a mailbox differs by country and is left for the IT team to add. A
 * maker whose support URL somebody has filled in already is left alone, so
 * the seed runs on a database installed before as on a new one.
 */
const SUPPORT: Readonly<Record<string, string>> = {
  'mfr-apple': 'https://support.apple.com',
  'mfr-dell': 'https://www.dell.com/support',
  'mfr-lenovo': 'https://support.lenovo.com',
  'mfr-hp': 'https://support.hp.com',
  'mfr-cisco': 'https://www.cisco.com/c/en/us/support/index.html',
  'mfr-logitech': 'https://support.logi.com',
  'mfr-vmware': 'https://support.broadcom.com',
  'mfr-samsung': 'https://www.samsung.com/support/',
  'mfr-crucial': 'https://www.crucial.com/support',
  'mfr-figma': 'https://help.figma.com',
  'mfr-microsoft': 'https://support.microsoft.com',
  'mfr-adobe': 'https://helpx.adobe.com/support.html',
  'mfr-jetbrains': 'https://www.jetbrains.com/support/',
  'mfr-zoom': 'https://support.zoom.com',
  'mfr-openai': 'https://help.openai.com',
};

const seed: SeedDefinition = defineSeed({
  name: '202610210002_seed_itam_manufacturer_support',

  async run({ query }) {
    for (const [id, supportUrl] of Object.entries(SUPPORT))
      await query
        .updateTable('manufacturers')
        .set({ supportUrl })
        .where('id', '=', id)
        .where((eb) =>
          eb.or([eb('supportUrl', 'is', null), eb('supportUrl', '=', '')]),
        )
        .execute();
  },
});

export default seed;
