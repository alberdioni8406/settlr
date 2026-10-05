/**
 * Cashaddr decode + checksum.
 * Types (CHIP CashTokens):
 *   0 = P2PKH (q…) — BCH only
 *   1 = P2SH  (p…)
 *   2 = Token-aware P2PKH (z…) — can receive CashTokens
 *   3 = Token-aware P2SH  (r…)
 */

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

export type CashaddrKind = 'p2pkh' | 'p2sh' | 'token_p2pkh' | 'token_p2sh';

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
  const sample = raw.trim().slice(0, 36) || '(empty)';
  return new Error(
    `${reason} Got: "${sample}${raw.trim().length > 36 ? '…' : ''}". ` +
      `BCH: bitcoincash:q… · CashTokens: bitcoincash:z…`
  );
}

function kindFromType(type: number): CashaddrKind | null {
  switch (type) {
    case 0:
      return 'p2pkh';
    case 1:
      return 'p2sh';
    case 2:
      return 'token_p2pkh';
    case 3:
      return 'token_p2sh';
    default:
      return null;
  }
}

export interface DecodedCashaddr {
  address: string;
  hash160: string;
  type: number;
  kind: CashaddrKind;
  /** True for type 2 / 3 — safe to receive CashTokens */
  tokenAware: boolean;
}

/** Decode any standard mainnet cashaddr (q/p/z/r). Throws with a clear message. */
export function decodeCashaddr(input: string): DecodedCashaddr {
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
        `Invalid cashaddr character "${c}".`
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
  const sizeCode = version & 7;
  const hash = Buffer.from(decoded.slice(1));
  // size code 0 => 20 bytes (160-bit hash)
  if (sizeCode !== 0 || hash.length !== 20) {
    throw friendlyError(
      trimmed,
      'Unsupported hash size (expected 20-byte P2PKH/P2SH hash).'
    );
  }
  const kind = kindFromType(type);
  if (!kind) {
    throw friendlyError(
      trimmed,
      `Unsupported address type ${type}. Use q (BCH), z (CashTokens P2PKH), p/r (script).`
    );
  }
  return {
    address: addr,
    hash160: hash.toString('hex'),
    type,
    kind,
    tokenAware: type === 2 || type === 3,
  };
}

/** BCH customer payments: q… or z… (token-aware can also receive BCH). */
export function decodeBchReceiveAddress(input: string): DecodedCashaddr {
  const d = decodeCashaddr(input);
  if (d.kind !== 'p2pkh' && d.kind !== 'token_p2pkh') {
    throw friendlyError(
      input,
      'BCH receive address must be P2PKH (q…) or token-aware P2PKH (z…).'
    );
  }
  return d;
}

/** PUSD / CashToken destination: must be token-aware (z… or r…). */
export function decodeTokenReceiveAddress(input: string): DecodedCashaddr {
  const d = decodeCashaddr(input);
  if (!d.tokenAware) {
    throw friendlyError(
      input,
      'CashToken destination must start with z (token P2PKH) or r (token P2SH). A plain q… address cannot receive PUSD.'
    );
  }
  return d;
}

export function isValidCashaddr(input: string): boolean {
  try {
    decodeCashaddr(input);
    return true;
  } catch {
    return false;
  }
}
