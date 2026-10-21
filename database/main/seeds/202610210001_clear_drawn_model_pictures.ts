import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * Takes the line drawings off the models (2026-10-21). The model seed gave
 * a model without an open photo a drawing of its kind (a laptop, a monitor,
 * …), and the demo pointed its own models at the same files; a model now
 * shows a photo or nothing, so a database seeded before keeps no drawing.
 * Only a picture that is one of those drawings is cleared — one somebody
 * uploaded is left — and the file rows stay, unused. A repeat run finds
 * none and changes nothing.
 */
const DRAWINGS = [
  '352aed01-d257-59b2-85d0-8dcebb263cb8', // laptop.svg
  '53a59a2b-781b-5db5-9a72-9fa080d06477', // desktop.svg
  'ea3a6843-b16b-5692-9a48-a0b18fb9bf60', // monitor.svg
  'f84af49a-e4e6-5184-84c3-eef620f02bc6', // server.svg
  'd7c3ae10-353d-5d96-9bff-17a44e3ef7c0', // network.svg
  'cabcdf09-99f2-549c-90d6-5a2a496fb04b', // phone.svg
  '70a07617-1091-5f64-b624-a09abbf57924', // printer.svg
  '26531faf-37da-567f-97d1-28efb18cb208', // virtual.svg
  '45ed46d1-1ecc-5352-ad43-d9f875748618', // mouse.svg
  'a4dbb661-6448-5e31-a178-ad054510fd32', // keyboard.svg
  '27995f2d-8017-54e8-ad11-7ca00a6fcefe', // dock.svg
  '335dc32c-7c0c-5dc3-98a0-d16e3e6324d8', // toner.svg
  '1b61195f-bb60-5bfe-a804-20226cfe92aa', // disk.svg
  'fea00f16-4f83-5af6-b8d6-c69ddf120823', // memory.svg
  'f0ba82b1-9f09-5af2-a220-dc8467946dfb', // headset.svg
  '64c8e8c7-7dba-57d7-9dbc-3157f6f98e21', // cable.svg
  'dfb62c27-051e-5729-988f-645e9ebb3b19', // battery.svg
  '575d22ad-fa25-57a2-8417-dd3397dc8200', // webcam.svg
  '5e30baa7-65e8-5850-8a28-f7d233d83fc0', // paper.svg
];

const seed: SeedDefinition = defineSeed({
  name: '202610210001_clear_drawn_model_pictures',

  async run({ query }) {
    await query
      .updateTable('models')
      .set({ imageFileId: null, imageCredit: null })
      .where('imageFileId', 'in', DRAWINGS)
      .execute();
  },
});

export default seed;
