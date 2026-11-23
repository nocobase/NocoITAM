/**
 * The record field naming the lifecycle definition that created a record
 * (lifecycle 0.1.0-beta.6, 2026-11-23): `lifecycleDefinition` on every
 * table a lifecycle runs on, written by `runtime.create()` only and never
 * by a form or an update (each service keeps it among its lifecycle fields).
 * Every version of a process uses the same field.
 */
export const LIFECYCLE_DEFINITION_FIELD = 'lifecycleDefinition';
