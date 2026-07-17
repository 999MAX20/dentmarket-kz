import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function encodeBase32(value: Buffer) {
  let bits = "";
  for (const byte of value) bits += byte.toString(2).padStart(8, "0");
  let encoded = "";
  for (let index = 0; index < bits.length; index += 5) encoded += alphabet[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  return encoded;
}

export function decodeBase32(value: string) {
  const normalized = value.toUpperCase().replace(/=+$/g, "").replace(/\s/g, "");
  let bits = "";
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("TOTP secret is not valid base32");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

export function generateTotpSecret() { return encodeBase32(randomBytes(20)); }

export function generateTotp(secret: string, at = Date.now(), digits = 6, periodSeconds = 30) {
  const counter = BigInt(Math.floor(at / 1_000 / periodSeconds));
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(counter);
  const digest = createHmac("sha1", decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(value).padStart(digits, "0");
}

export function verifyTotp(secret: string, candidate: string, at = Date.now(), window = 1) {
  if (!/^\d{6}$/.test(candidate)) return false;
  const candidateBuffer = Buffer.from(candidate);
  for (let offset = -window; offset <= window; offset += 1) {
    const expected = Buffer.from(generateTotp(secret, at + offset * 30_000));
    if (expected.length === candidateBuffer.length && timingSafeEqual(expected, candidateBuffer)) return true;
  }
  return false;
}

export function generateRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => randomBytes(6).toString("hex").toUpperCase().replace(/(.{4})(.{4})(.{4})/, "$1-$2-$3"));
}
