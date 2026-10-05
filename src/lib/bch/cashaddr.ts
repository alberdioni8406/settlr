/**
 * Minimal cashaddr decode + checksum (P2PKH only).
 * Uses BigInt() (no bigint literals) so it typechecks with target ES2017+.
 */

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function polymod(values: number[]): bigint {
  const GEN = [
    BigInt('0x98f2bc8e61'),
    BigInt('0x79b76d99e2'),
    BigInt('0xf33e5fb3c4'),
    BigInt('0xae2eabe2a8'),
    BigInt('0x1e4f43e470'),
  ];
  let c = BigInt(1);
  const mask = BigInt('0x07ffffffff');
  const one = BigInt(1);
  const five = BigInt(5);
  const thirtyFive = BigInt(35);
  for (const v of values) {
    const c0 = c >> thirtyFive;
    c = ((c & mask) << five) ^ BigInt(v);
    for (let i = 0; i < 5; i++) {
      if (((c0 >> BigInt(i)) & one) !== BigInt(0)) c ^= GEN[i];
    }
  }
  return c;
}

function prefixExpand(prefix: string): number[] {
  const out: number[] = [];
  for (const ch of prefix) out.push(ch.charCodeAt(0) & 31);
  out.push(0);
  return out;
}

function convertBits(
  data: number[],
  from: number,
  to: number,
  pad: boolean
): number[] {
  let acc = 0;
  let bits = 0;
  const ret: number[] = [];
  const maxv = (1 << to) - 1;
  for (const value of data) {
    acc = (acc << from) | value;
    bits += from;
    while (bits >= to) {
      bits -= to;
      ret.push((acc >> bits) & maxv);
    }
  }
  if (pad && bits) ret.push((acc << (to - bits)) & maxv);
  return ret;
}

export function normalizeCashaddr(input: string): string {
  let addr = String(input || '').trim().toLowerCase();
  if (!addr.startsWith('bitcoincash:')) addr = 'bitcoincash:' + addr;
  return addr;
}

/** Validate P2PKH cashaddr. Throws on invalid. */
export function decodeCashaddr(input: string): {
  address: string;
  hash160: string;
} {
  const addr = normalizeCashaddr(input);
  const prefix = 'bitcoincash';
  const payload = addr.slice(prefix.length + 1);
  if (!payload || payload.length < 8) throw new Error('Invalid cashaddr');
  const data: number[] = [];
  for (const c of payload) {
    const v = CHARSET.indexOf(c);
    if (v < 0) throw new Error('Invalid cashaddr character');
    data.push(v);
  }
  if (polymod(prefixExpand(prefix).concat(data)) !== BigInt(1)) {
    throw new Error('Invalid cashaddr checksum');
  }
  const decoded = convertBits(data.slice(0, -8), 5, 8, false);
  if (!decoded || decoded.length < 21) throw new Error('Invalid cashaddr payload');
  const version = decoded[0];
  const type = version >> 3;
  const hash = Buffer.from(decoded.slice(1));
  if (type !== 0 || hash.length !== 20) {
    throw new Error('Only P2PKH cashaddr destinations are accepted');
  }
  return { address: addr, hash160: hash.toString('hex') };
}

export function isValidCashaddr(input: string): boolean {
  try {
    decodeCashaddr(input);
    return true;
  } catch {
    return false;
  }
}
