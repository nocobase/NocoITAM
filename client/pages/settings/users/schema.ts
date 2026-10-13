import { isEmailAddress } from '@nocobase/app-plugin-users/client/user-client';
import { z } from 'zod';

// A single-line value fits the 255-character column text fields are made with.
const TEXT_LIMIT = 255;

/** A user's name, username and email as the create and edit dialogs check them, in the reader's language. */
export function userSchema(
  text: (key: string, options?: Record<string, unknown>) => string,
) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, text('users.errors.name'))
      .max(TEXT_LIMIT, text('users.errors.tooLong', { max: TEXT_LIMIT })),
    username: z
      .string()
      .trim()
      .max(TEXT_LIMIT, text('users.errors.tooLong', { max: TEXT_LIMIT }))
      .regex(/^[A-Za-z0-9._-]*$/u, text('users.errors.username')),
    email: z
      .string()
      .trim()
      .min(1, text('users.errors.email'))
      .refine(
        (value) => value === '' || isEmailAddress(value),
        text('users.errors.emailFormat'),
      ),
  });
}
