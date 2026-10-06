/**
 * UTXO lookup for payment detection.
 * Tries Electrum TLS, then Haskoin REST (works from serverless hosts that block port 50002).
 */

import tls from 'tls';
import { createHash } from 'crypto';
import { decodeCashaddr, normalizeCashaddr } from './cashaddr';

const ELECTRUM_HOST = process.env.ELECTRUM_HOST || 'electrum.imaginary.cash';
const ELECTRUM_PORT = Number(process.env.ELECTRUM_PORT || 50002);

export interface Utxo {
  tx_hash: string;
  tx_pos: number;
  value: number;
  height: number;
}

function scriptHashForP2pkh(hash160hex: string): string {
  const hash = Buffer.from(hash160hex, 'hex');
  const script = Buffer.concat([
    Buffer.from([0x76, 0xa9, 0x14]),
    hash,
    Buffer.from([0x88, 0xac]),
  ]);
  return createHash('sha256').update(script).digest().reverse().toString('hex');
}

async function electrumList(address: string): Promise<Utxo[]> {
  const { hash160 } = decodeCashaddr(address);
  const sh = scriptHashForP2pkh(hash160);
  const payload = JSON.stringify({
    id: 1,
    method: 'blockchain.scripthash.listunspent',
    params: [sh],
  });
  const raw = await new Promise<string>((resolve, reject) => {
    const socket = tls.connect({
      host: ELECTRUM_HOST,
      port: ELECTRUM_PORT,
      servername: ELECTRUM_HOST,
      rejectUnauthorized: true,
    });
    let buf = '';
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('Electrum timeout'));
    }, 8000);
    socket.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    socket.on('data', (chunk) => {
      buf += chunk.toString();
      if (buf.includes('\n')) {
        clearTimeout(timer);
        socket.end();
        resolve(buf);
      }
    });
    socket.on('secureConnect', () => {
      socket.write(payload + '\n');
    });
  });
  const msg = JSON.parse(raw.split('\n')[0]);
  if (!Array.isArray(msg.result)) return [];
  return msg.result as Utxo[];
}

async function haskoinList(address: string): Promise<Utxo[]> {
  const addr = normalizeCashaddr(address);
  const url = `https://api.haskoin.com/bch/address/${addr}/unspent`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Haskoin ${res.status}`);
  const json = (await res.json()) as Array<{
    txid?: string;
    tx_hash?: string;
    index?: number;
    vout?: number;
    value?: number;
    block?: { height?: number };
    height?: number;
  }>;
  if (!Array.isArray(json)) return [];
  return json.map((u) => ({
    tx_hash: u.txid || u.tx_hash || '',
    tx_pos: u.index ?? u.vout ?? 0,
    value: Number(u.value || 0),
    height: u.block?.height ?? u.height ?? 0,
  }));
}

export async function listUnspent(address: string): Promise<{
  utxos: Utxo[];
  source: string;
}> {
  const errors: string[] = [];
  try {
    const utxos = await electrumList(address);
    return { utxos, source: `electrum:${ELECTRUM_HOST}` };
  } catch (e) {
    errors.push(e instanceof Error ? e.message : 'electrum');
  }
  try {
    const utxos = await haskoinList(address);
    return { utxos, source: 'haskoin' };
  } catch (e) {
    errors.push(e instanceof Error ? e.message : 'haskoin');
  }
  throw new Error(`Could not read UTXOs (${errors.join('; ')})`);
}

/** Prefer exact satoshi tag, then a close payment on a shared merchant address. */
export function matchPayment(
  utxos: Utxo[],
  expectedSats: number
): Utxo | null {
  const exact = utxos.find((u) => u.value === expectedSats);
  if (exact) return exact;
  const near = utxos
    .filter(
      (u) =>
        u.value >= expectedSats - 20 &&
        u.value <= expectedSats + 50
    )
    .sort((a, b) => Math.abs(a.value - expectedSats) - Math.abs(b.value - expectedSats));
  if (near[0]) return near[0];
  const band = utxos
    .filter(
      (u) =>
        u.value >= Math.floor(expectedSats * 0.98) &&
        u.value <= Math.ceil(expectedSats * 1.03)
    )
    .sort((a, b) => Math.abs(a.value - expectedSats) - Math.abs(b.value - expectedSats));
  return band[0] ?? null;
}
