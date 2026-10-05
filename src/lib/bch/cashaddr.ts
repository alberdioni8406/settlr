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

function friendlyError(raw: string, reason: string): Error {
  const sample = raw.trim().slice(0, 28) || '(empty)';
  return new Error(
    `${reason} Got: "${sample}${raw.trim().length > 28 ? '…' : ''}". ` +
      `Expected format: bitcoincash:q… (P2PKH cashaddr, lowercase, valid checksum).`
  );
}

/** Validate P2PKH cashaddr. Throws with a clear message on invalid input. */
export function decodeCashaddr(input: string): {
  address: string;
  hash160: string;
} {
  const trimmed = String(input || '').trim();
  if (!trimmed) {
    throw friendlyError(trimmed, 'Address is empty.');
  }
  if (/\s/.test(trimmed)) {
    throw friendlyError(trimmed, 'Address contains spaces.');
  }
  if (
    trimmed.startsWith('1') ||
    trimmed.startsWith('3') ||
    trimmed.startsWith('bc1')
  ) {
    throw friendlyError(
      trimmed,
      'Looks like a Bitcoin (BTC) address, not Bitcoin Cash.'
    );
  }
  if (trimmed.startsWith('bitcoincash:p') || trimmed.toLowerCase().includes(':p')) {
    // p-type is often token-aware payload; we still accept if checksum/type ok —
    // but note: our decoder only accepts type 0 P2PKH. Soft message below if fail.
  }

  const addr = normalizeCashaddr(trimmed);
  const prefix = 'bitcoincash';
  const payload = addr.slice(prefix.length + 1);
  if (!payload || payload.length < 8) {
    throw friendlyError(trimmed, 'Cashaddr payload is too short.');
  }
  const data: number[] = [];
  for (const c of payload) {
    const v = CHARSET.indexOf(c);
    if (v < 0) {
      throw friendlyError(
        trimmed,
        `Invalid cashaddr character "${c}". Only qp zry9x8gf2tvdw0s3jn54khce6mua7l allowed.`
      );
    }
    data.push(v);
  }
  if (polymod(prefixExpand(prefix).concat(data)) !== BigInt(1)) {
    throw friendlyError(
      trimmed,
      'Cashaddr checksum failed — typo or incomplete address.'
    );
  }
  const decoded = convertBits(data.slice(0, -8), 5, 8, false);
  if (!decoded || decoded.length < 21) {
    throw friendlyError(trimmed, 'Cashaddr payload could not be decoded.');
  }
  const version = decoded[0];
  const type = version >> 3;
  const hash = Buffer.from(decoded.slice(1));
  if (type !== 0 || hash.length !== 20) {
    throw friendlyError(
      trimmed,
      'Only P2PKH cashaddrs (type q…, 20-byte hash) are accepted. Token-aware wallets still use a P2PKH cashaddr to receive CashTokens.'
    );
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
