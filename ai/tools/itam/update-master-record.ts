import type { ToolsOptions } from '@nocobase/ai-employee';

import { writeTool } from './shared.js';

const tool: ToolsOptions = writeTool(
  'itam_update_master_record',
  {
    title: 'ITAM: update a model or software product',
    about:
      'Writes details looked up for a model or software product on the books, once the user confirms.',
  },
  'Update ONE existing model (collection models) or software product (collection softwareProducts) with details you looked up, following the catalog skill: pass only the fields to change. A model takes code, specification, warrantyMonths, releaseDate, eolDate, eosDate (YYYY-MM-DD) and attributes (its category fields by key, each of its type, merged into what it holds); a software product takes deliveryMethod (onPremise, saas, both), description and website. Never the name, maker or category. Propose only empty fields unless the user agreed to replace a value.',
);

export default tool;
