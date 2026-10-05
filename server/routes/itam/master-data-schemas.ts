import { z, type ZodTypeAny } from 'zod';

/** Input validation for master-data create and update bodies. */
const text = z.string().trim().min(1).max(255);
const optionalText = z.string().trim().max(512).nullable().optional();
const optionalLong = z.string().max(20000).nullable().optional();
const optionalId = z.string().min(1).max(64).nullable().optional();
const optionalInt = z.number().int().min(0).nullable().optional();
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional();

const fieldTemplateEntry = z.object({
  key: z.string().min(1).max(64),
  label: z.string().min(1).max(128),
  type: z.enum(['text', 'number', 'date', 'select', 'boolean']),
  required: z.boolean().optional(),
  defaultValue: z.unknown().optional(),
  options: z.array(z.string()).optional(),
  /** Kept with its values but not shown on device pages. */
  hidden: z.boolean().optional(),
});

const schemas: Readonly<
  Record<string, z.ZodObject<Record<string, ZodTypeAny>>>
> = {
  manufacturers: z.object({
    name: text,
    website: optionalText,
    supportPhone: optionalText,
    supportEmail: z.string().trim().email().max(255).nullable().optional(),
    supportUrl: optionalText,
    notes: optionalLong,
  }),
  vendors: z.object({
    name: text,
    types: z
      .array(
        z.enum([
          'equipment',
          'softwareReseller',
          'serviceProvider',
          'repairProvider',
          'lessor',
          'recycler',
          'other',
        ]),
      )
      .min(1),
    contactName: optionalText,
    phone: optionalText,
    email: z.string().trim().email().max(255).nullable().optional(),
    address: optionalText,
    website: optionalText,
    notes: optionalLong,
  }),
  categories: z.object({
    name: text,
    parentId: optionalId,
    appliesTo: z.enum([
      'device',
      'accessory',
      'consumable',
      'component',
      'entitlement',
    ]),
    requiresSerial: z.boolean().optional(),
    assignableToPerson: z.boolean().optional(),
    depreciationMethod: z.enum(['none', 'straightLine']).nullable().optional(),
    usefulLifeMonths: optionalInt,
    residualRate: z.number().min(0).max(1).nullable().optional(),
    warrantyMonths: optionalInt,
    replacementMonths: optionalInt,
    auditCycleDays: optionalInt,
    fieldTemplate: z.array(fieldTemplateEntry).nullable().optional(),
    sort: z.number().int().optional(),
  }),
  models: z.object({
    name: text,
    categoryId: z.string().min(1).max(64),
    manufacturerId: z.string().min(1).max(64),
    code: optionalText,
    specification: optionalLong,
    imageFileId: optionalId,
    imageCredit: optionalText,
    warrantyMonths: optionalInt,
    replacementMonths: optionalInt,
    releaseDate: optionalDate,
    eolDate: optionalDate,
    eosDate: optionalDate,
  }),
  softwareProducts: z.object({
    name: text,
    manufacturerId: optionalId,
    categoryId: z.string().min(1).max(64),
    deliveryMethod: z.enum(['onPremise', 'saas', 'both']),
    description: optionalLong,
    website: optionalText,
    notes: optionalLong,
  }),
  locations: z.object({
    name: text,
    parentId: optionalId,
    type: z.enum([
      'company',
      'campus',
      'building',
      'floor',
      'room',
      'rack',
      'warehouse',
      'other',
    ]),
    address: optionalText,
    ownerId: optionalId,
    notes: optionalLong,
    sort: z.number().int().optional(),
  }),
  departments: z.object({
    name: text,
    parentId: optionalId,
    code: optionalText,
    costCenter: optionalText,
    managerId: optionalId,
    sort: z.number().int().optional(),
  }),
  onboardingKits: z.object({
    name: text,
    departmentId: z.string().min(1).max(64),
    // Empty for the department's default kit.
    position: optionalText,
    items: z
      .array(
        z
          .object({
            modelId: z.string().min(1).max(64).optional(),
            categoryId: z.string().min(1).max(64).optional(),
            softwareProductId: z.string().min(1).max(64).optional(),
            quantity: z.number().int().min(1).max(100),
          })
          .strict()
          // Each item is exactly one thing: a model, any model of a
          // category, or a software product.
          .refine(
            (item) =>
              [item.modelId, item.categoryId, item.softwareProductId].filter(
                Boolean,
              ).length === 1,
            { message: 'An item is one model, one category or one product' },
          ),
      )
      .max(50),
    notes: optionalLong,
  }),
  people: z.object({
    name: text,
    employeeNo: optionalText,
    email: z.string().trim().email().max(255).nullable().optional(),
    phone: optionalText,
    departmentId: z.string().min(1).max(64),
    position: optionalText,
    locationId: optionalId,
    userId: optionalId,
    employmentStatus: z.enum(['active', 'left']).optional(),
    hireDate: optionalDate,
    leaveDate: optionalDate,
    notes: optionalLong,
  }),
};

export function masterDataSchema(
  collection: string,
): z.ZodObject<Record<string, ZodTypeAny>> | undefined {
  return schemas[collection];
}

/** Defaults applied on create when the body omits them. */
export const CREATE_DEFAULTS: Readonly<
  Record<string, Readonly<Record<string, unknown>>>
> = {
  // 在职状态 is not defaulted here: the service derives it from the leave
  // date on every write (`employmentFor`), and a default of `active` was the
  // value a person entered with a date already passed kept until the nightly
  // job came round.
  categories: {
    requiresSerial: false,
    assignableToPerson: true,
    depreciationMethod: 'none',
    sort: 0,
  },
  onboardingKits: { items: [] },
  locations: { sort: 0 },
  departments: { sort: 0 },
};
