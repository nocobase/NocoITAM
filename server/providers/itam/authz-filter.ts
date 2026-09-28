import type { DatabaseAuthorizationConditions } from '@nocobase/app-plugin-authorization/server';
import type {
  ComparisonOperator,
  Expression,
  ExpressionBuilder,
  FilterAst,
  FilterNode,
  SqlBool,
} from '@nocobase/db';

import { UnauthorizedFieldsError } from './errors.js';

/**
 * Translates the authorization plugin's scope into the query builder. Kept in
 * one place so every ITAM service applies record access the same way, inside
 * the same WHERE clause as its own conditions.
 *
 * Since template beta.43 a decision carries `scope`: `true` for every row, or
 * a `FilterAst` whose nodes are groups and conditions on the collection's own
 * columns (the plugin rejects relation traversal before it reaches here).
 */
const comparisons: Readonly<Record<string, ComparisonOperator>> = {
  $eq: '=',
  $ne: '!=',
  $gt: '>',
  $gte: '>=',
  $lt: '<',
  $lte: '<=',
};

function compileNode(
  eb: ExpressionBuilder,
  node: FilterNode,
): Expression<SqlBool> {
  if (node.kind === 'group') {
    const items = node.items.map((item) => compileNode(eb, item));
    if (items.length === 0) {
      return node.logic === 'and' ? alwaysTrue(eb) : alwaysFalse(eb);
    }
    return node.logic === 'and' ? eb.and(items) : eb.or(items);
  }
  if (node.kind !== 'condition') {
    throw new TypeError(`Unsupported scope node: ${String(node.kind)}`);
  }
  const [field, ...rest] = node.path;
  if (typeof field !== 'string' || rest.length > 0) {
    throw new TypeError('A scope condition must name a direct field');
  }
  const operator = node.operator;
  if (operator === '$empty') return eb(field, 'is', null);
  if (operator === '$notEmpty') return eb(field, 'is not', null);
  const comparison = comparisons[operator];
  if (!comparison) {
    throw new TypeError(`Unsupported scope operator: ${String(operator)}`);
  }
  return eb(field, comparison, node.value);
}

/** The scope of one decision as a WHERE fragment; `true` adds no condition. */
export function compileAuthzScope(
  eb: ExpressionBuilder,
  scope: true | FilterAst,
): Expression<SqlBool> {
  return scope === true ? alwaysTrue(eb) : compileNode(eb, scope.root);
}

// The adapter compiles an empty AND group to no condition at all, which is
// the tautology we need. An empty IN list compiles to a contradiction, which
// is how an empty OR (nothing allowed) is expressed; every collection filtered
// through here has an `id` column.
const alwaysTrue = (eb: ExpressionBuilder): Expression<SqlBool> => eb.and([]);
const alwaysFalse = (eb: ExpressionBuilder): Expression<SqlBool> =>
  eb('id', 'in', []);

export function assertInputFields(
  input: Readonly<Record<string, unknown>>,
  allowed: '*' | readonly string[],
): void {
  if (allowed === '*') return;
  const rejected = Object.keys(input).filter(
    (field) => !allowed.includes(field),
  );
  if (rejected.length > 0) throw new UnauthorizedFieldsError(rejected);
}

/** The fields a read may return: the requested set narrowed by the decision. */
export function outputFields(
  all: readonly string[],
  conditions: DatabaseAuthorizationConditions,
): readonly string[] {
  const output = conditions.fieldAccess?.output ?? '*';
  return output === '*' ? all : all.filter((field) => output.includes(field));
}

export function pickFields<T extends Readonly<Record<string, unknown>>>(
  row: T,
  fields: readonly string[],
): Partial<T> {
  const picked: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in row) picked[field] = row[field];
  }
  return picked as Partial<T>;
}

/**
 * Conditions for internal steps another service drives inside its own
 * authorized operation (a disposal reclaiming seats, an audit correcting an
 * device): the caller's route already decided; the nested step sees every
 * record and field.
 */
export function unrestricted(
  collection: string,
  action: string,
): DatabaseAuthorizationConditions {
  return {
    type: 'database',
    collection: `main.${collection}`,
    action,
    scope: true,
    fields: [],
    fieldAccess: { input: '*', output: '*' },
    allFields: true,
  };
}
