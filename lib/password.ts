import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
const dummyHash = `${"0".repeat(32)}:${"0".repeat(128)}`;
export const passwordLength = { min: 6, max: 128 } as const;
export const passwordLengthText = `${passwordLength.min} a ${passwordLength.max}`;

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt, 64) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, hash = dummyHash) {
  const [salt, expected] = hash.split(":");
  const key = await derive(password, salt, 64) as Buffer;
  return timingSafeEqual(key, Buffer.from(expected, "hex"));
}

export function validPassword(password: string) {
  return password.length >= passwordLength.min && password.length <= passwordLength.max && Boolean(password.trim());
}
