import { z } from 'zod';

import { ASSIGNEE_TYPES } from '../../providers/itam/device-status.js';

/**
 * Input validation for device create and assign bodies. Its own module, with
 * no back-import, because ai-records.ts builds on it at load time and the
 * device routes reach ai-records through the providers (2026-10-21).
 */
const optionalText = z.string().trim().max(512).nullable().optional();
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional();
const optionalNumber = z.number().nullable().optional();
const id = z.string().min(1).max(64);

export const deviceSchema = z.object({
  modelId: id,
  locationId: id,
  deviceNo: optionalText,
  serialNo: optionalText,
  name: optionalText,
  ownership: z.enum(['owned', 'leased', 'borrowed', 'byod']).optional(),
  status: z.literal('inStock').optional(),
  lenderVendorId: id.nullable().optional(),
  returnDueDate: optionalDate,
  departmentId: id.nullable().optional(),
  vendorId: id.nullable().optional(),
  purchaseOrderId: id.nullable().optional(),
  purchaseDate: optionalDate,
  purchasePrice: optionalNumber,
  currency: z.string().trim().max(8).nullable().optional(),
  warrantyEndDate: optionalDate,
  depreciationMethod: z.enum(['none', 'straightLine']).optional(),
  usefulLifeMonths: z.number().int().min(0).nullable().optional(),
  residualRate: z.number().min(0).max(1).nullable().optional(),
  notes: z.string().max(20000).nullable().optional(),
  attributes: z.record(z.string(), z.unknown()).nullable().optional(),
  ownerId: id.optional(),
});

export const assignSchema = z.object({
  targetType: z.enum(ASSIGNEE_TYPES),
  targetId: id,
  locationId: id.optional(),
});
