import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// ITAM master data: manufacturers, vendors, categories, models, software
// products, locations, departments, people and tags. Every table uses an
// application-generated string id so the schema is portable across dialects
// and services can create parent and child rows in one transaction.
const migration: MigrationDefinition = defineMigration({
  name: '202609120001_create_master_data',

  async up({ builder }) {
    await builder.createCollection('manufacturers', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.string('website', { length: 512 }).nullable();
      collection.string('supportPhone', { length: 64 }).nullable();
      collection.text('notes').nullable();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_manufacturers' });
      collection.unique('name', { name: 'uq_manufacturers_name' });
    });

    await builder.createCollection('vendors', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      // Multi-select of: equipment | softwareReseller | serviceProvider |
      // repairProvider | lessor | recycler | other
      collection.json('types').notNull();
      collection.string('contactName', { length: 255 }).nullable();
      collection.string('phone', { length: 64 }).nullable();
      collection.string('email', { length: 255 }).nullable();
      collection.string('address', { length: 512 }).nullable();
      collection.string('website', { length: 512 }).nullable();
      collection.text('notes').nullable();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_vendors' });
      collection.unique('name', { name: 'uq_vendors_name' });
    });

    await builder.createCollection('categories', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.string('parentId', { length: 64 }).nullable();
      // asset | accessory | consumable | component | software
      collection.string('appliesTo', { length: 32 }).notNull();
      collection.boolean('requiresSerial').notNull().defaultTo(false);
      collection.boolean('assignableToPerson').notNull().defaultTo(true);
      // none | straightLine
      collection.string('depreciationMethod', { length: 32 }).nullable();
      collection.integer('usefulLifeMonths').nullable();
      collection.decimal('residualRate', { precision: 5, scale: 4 }).nullable();
      collection.integer('warrantyMonths').nullable();
      collection.integer('replacementMonths').nullable();
      collection.integer('auditCycleDays').nullable();
      // Extended field definitions: [{ key, label, type, required, defaultValue, options }]
      collection.json('fieldTemplate').nullable();
      collection.integer('sort').notNull().defaultTo(0);
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_categories' });
      collection.index('parentId', { name: 'idx_categories_parent' });
      collection.index('appliesTo', { name: 'idx_categories_applies_to' });
    });

    await builder.createCollection('models', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.string('categoryId', { length: 64 }).notNull();
      collection.string('manufacturerId', { length: 64 }).notNull();
      collection.string('code', { length: 128 }).nullable();
      collection.text('specification').nullable();
      collection.string('imageFileId', { length: 64 }).nullable();
      collection.integer('warrantyMonths').nullable();
      collection.date('releaseDate').nullable();
      collection.date('eolDate').nullable();
      collection.date('eosDate').nullable();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_models' });
      collection.index('categoryId', { name: 'idx_models_category' });
      collection.index('manufacturerId', { name: 'idx_models_manufacturer' });
      collection.index('name', { name: 'idx_models_name' });
    });

    await builder.createCollection('softwareProducts', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.string('manufacturerId', { length: 64 }).nullable();
      collection.string('categoryId', { length: 64 }).notNull();
      // onPremise | saas | both
      collection.string('deliveryMethod', { length: 32 }).notNull();
      collection.text('description').nullable();
      collection.string('website', { length: 512 }).nullable();
      collection.text('notes').nullable();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_software_products' });
      collection.unique('name', { name: 'uq_software_products_name' });
      collection.index('categoryId', {
        name: 'idx_software_products_category',
      });
    });

    await builder.createCollection('locations', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.string('parentId', { length: 64 }).nullable();
      // company | campus | building | floor | room | rack | warehouse | other
      collection.string('type', { length: 32 }).notNull();
      // Materialized "/id1/id2/" ancestry path for subtree queries.
      collection.text('path').notNull();
      collection.string('address', { length: 512 }).nullable();
      collection.string('ownerId', { length: 64 }).nullable();
      collection.text('notes').nullable();
      collection.integer('sort').notNull().defaultTo(0);
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_locations' });
      collection.index('parentId', { name: 'idx_locations_parent' });
    });

    await builder.createCollection('departments', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.string('parentId', { length: 64 }).nullable();
      collection.string('code', { length: 64 }).nullable();
      collection.text('path').notNull();
      collection.string('costCenter', { length: 64 }).nullable();
      collection.string('managerId', { length: 64 }).nullable();
      collection.integer('sort').notNull().defaultTo(0);
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_departments' });
      collection.index('parentId', { name: 'idx_departments_parent' });
    });

    await builder.createCollection('people', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.string('employeeNo', { length: 64 }).nullable();
      collection.string('email', { length: 255 }).nullable();
      collection.string('phone', { length: 64 }).nullable();
      collection.string('departmentId', { length: 64 }).notNull();
      collection.string('position', { length: 255 }).nullable();
      collection.string('locationId', { length: 64 }).nullable();
      collection.string('userId', { length: 64 }).nullable();
      // active | left
      collection.string('employmentStatus', { length: 32 }).notNull();
      collection.date('hireDate').nullable();
      collection.date('leaveDate').nullable();
      collection.text('notes').nullable();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_people' });
      collection.unique('employeeNo', { name: 'uq_people_employee_no' });
      collection.unique('userId', { name: 'uq_people_user' });
      collection.index('departmentId', { name: 'idx_people_department' });
      collection.index('employmentStatus', { name: 'idx_people_status' });
      collection.index('name', { name: 'idx_people_name' });
    });

    await builder.createCollection('tags', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('name', { length: 128 }).notNull();
      collection.string('color', { length: 32 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_tags' });
      collection.unique('name', { name: 'uq_tags_name' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('tags');
    await builder.dropCollection('people');
    await builder.dropCollection('departments');
    await builder.dropCollection('locations');
    await builder.dropCollection('softwareProducts');
    await builder.dropCollection('models');
    await builder.dropCollection('categories');
    await builder.dropCollection('vendors');
    await builder.dropCollection('manufacturers');
  },
});

export default migration;
