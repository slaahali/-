import { randomBytes } from "node:crypto";
import { VARIANT_COUNT } from "./types";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
/** Largest multiple of 62 that fits in a byte; bytes >= this are rejected to avoid modulo bias. */
const REJECT_FROM = 248;

export const ID_LENGTH = 10;

/** Accepts ids we generate plus a little slack (older/imported ids). */
export const ID_PATTERN = /^[A-Za-z0-9_-]{4,32}$/;

export function isValidId(id: unknown): id is string {
  return typeof id === "string" && ID_PATTERN.test(id);
}

/** Random, URL-safe, base62 id (≈59.5 bits for the default length). */
export function newId(length: number = ID_LENGTH): string {
  let out = "";
  while (out.length < length) {
    const bytes = randomBytes(length * 2);
    for (let i = 0; i < bytes.length && out.length < length; i++) {
      const b = bytes[i];
      if (b < REJECT_FROM) out += ALPHABET[b % 62];
    }
  }
  return out;
}

/** Fallback card colour when the writer didn't pick one: stable per id (FNV-1a 32-bit). */
export function variantFor(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % VARIANT_COUNT;
}
