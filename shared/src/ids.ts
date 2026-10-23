import { nanoid } from 'nanoid';

export const HASH_LENGTH = 10;
export const HASH_REGEX = /^[A-Za-z0-9_-]{10}$/;

export function isValidHash(value: unknown): value is string {
  return typeof value === 'string' && HASH_REGEX.test(value);
}

export function generateHash(): string {
  return nanoid(HASH_LENGTH);
}
