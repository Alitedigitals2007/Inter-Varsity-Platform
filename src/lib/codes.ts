import { randomBytes } from "crypto";

// Unambiguous alphabet: no O/0, I/1/L confusion.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Cryptographically random, human-typable access code (default 8 chars). */
export function generateAccessCode(length = 8): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  // groups of 4 for readability: XXXX-XXXX
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}
