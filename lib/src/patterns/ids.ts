/**
 * URL-safe short id generator for patterns, compositions, placements, events, and lanes.
 *
 * Not cryptographic. Uses `crypto.getRandomValues` when available (browser, jsdom, modern
 * Node) and falls back to `Math.random()`. Collisions across a single user's library are
 * astronomically unlikely at 12 base36 characters; we don't try to guarantee global
 * uniqueness.
 */

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 12;

export function generateId(prefix?: string): string {
  let out = '';
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    const bytes = new Uint8Array(ID_LENGTH);
    globalThis.crypto.getRandomValues(bytes);
    for (let i = 0; i < ID_LENGTH; i++) {
      out += ALPHABET[bytes[i] % ALPHABET.length];
    }
  } else {
    for (let i = 0; i < ID_LENGTH; i++) {
      out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
  }
  return prefix ? `${prefix}_${out}` : out;
}
