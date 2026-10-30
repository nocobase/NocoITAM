/** Domain errors the ITAM services throw; routes map them to responses. */
export class UnauthorizedFieldsError extends Error {
  readonly code = 'UNAUTHORIZED_FIELDS' as const;
  constructor(readonly fields: readonly string[]) {
    super(`Input fields are not authorized: ${fields.join(', ')}`);
  }
}

export class RecordNotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const;
  constructor(collection: string, id: string) {
    super(`${collection} ${id} not found`);
  }
}

export class DuplicateValueError extends Error {
  readonly code = 'DUPLICATE' as const;
  constructor(
    readonly field: string,
    readonly value: unknown,
  ) {
    super(`${field} must be unique`);
  }
}

export interface DeleteReference {
  readonly collection: string;
  readonly field: string;
  readonly count: number;
}

export interface DeleteImpact {
  /** blocked: dangling references would remain; warn: side effects; plain. */
  readonly level: 'blocked' | 'warn' | 'plain';
  readonly references: readonly DeleteReference[];
  /**
   * What goes with the record when an unrestricted caller deletes it past
   * the business rules (2026-10-30): its lines, approvals, seats, movements.
   */
  readonly parts?: readonly DeleteReference[];
}

/**
 * How a delete is asked. `unrestricted` is root's (`isUnrestricted`): the
 * record's state does not matter, its own parts go with it, and only other
 * records still depending on it block.
 */
export interface DeleteOptions {
  readonly unrestricted?: boolean;
}

export class DeleteBlockedError extends Error {
  readonly code = 'DELETE_BLOCKED' as const;
  constructor(readonly impact: DeleteImpact) {
    super('Record is referenced by other records');
  }
}

export class ValidationError extends Error {
  readonly code = 'VALIDATION' as const;
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

/** A business rule refused the operation (wrong state, no stock, …). */
export class BusinessRuleError extends Error {
  readonly code = 'BUSINESS_RULE' as const;
  constructor(
    message: string,
    readonly rule: string,
  ) {
    super(message);
  }
}
