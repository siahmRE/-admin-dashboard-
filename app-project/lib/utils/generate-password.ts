import { randomInt } from "crypto";

// Unambiguous character set: no 0/O, 1/l/I, to reduce transcription errors
// when a teacher reads this out loud or writes it on a slip of paper.
const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/**
 * Generates a random temporary password for a new student account.
 * This is shown to the admin ONCE at creation time and is never stored
 * anywhere in plaintext — Supabase Auth stores only its hash, and our own
 * `profiles` table never has a password column at all.
 */
export function generateTemporaryPassword(length = 12): string {
  let password = "";
  for (let i = 0; i < length; i++) {
    password += CHARS[randomInt(0, CHARS.length)];
  }
  return password;
}
