/**
 * Electrum protocol client (TLS) for payment detection.
 * Uses public server — Settlr never holds keys.
 */

import tls from 'tls';
import { createHash } from 'crypto';
import { decodeCashaddr } from './cashaddr';

const ELECTRUM_HOST = process.env.ELECTRUM_HOST || 'electrum.imaginary.cash';
const ELECTRUM_PORT = Number(process.env.ELECTRUM_PORT || 50002);

function scriptHashForP2pkh(hash160hex: string): string {
  const hash = Buffer.from(hash160hex, 'hex');
  const script = Buffer.concat([
    Buffer.from([0x76, 0xa9, 0x14]),
    hash,
    Buffer.from([0x88, 0xac]),
  ]);
  return createHash('sha256').update(script).digest().reverse().toString('hex');
}

type ElectrumCall = { id: number; method: string; params: unknown[] };

function electrum(calls: ElectrumCall[]): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: ELECTRUM_HOST,
      port: ELECTRUM_PORT,
      servername: ELECTRUM_HOST,
      rejectUnauthorized: true,
    });
    let buf = '';
    const results = new Map<number, unknown>();
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('Electrum timeout'));
    }, 12000);
    socket.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    socket.on('data', (chunk) => {
      buf += chunk.toString();
      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id != null) results.set(msg.id, msg.result ?? msg.error);
        } catch {
          /* ignore partial */
        }
        if (results.size >= calls.length) {
          clearTimeout(timer);
          socket.end();
          resolve(calls.map((c) => results.get(c.id)));
        }
      }
    });
    socket.on('connect', () => {
      for (const c of calls) {
        socket.write(JSON.stringify(c) + '\n');
      }
    });
  });
}

export interface Utxo {
  tx_hash: string;
  tx_pos: number;
  value: number;
  height: number;
}

/** List unspent outputs for a P2PKH cashaddr via Electrum. */
export async function listUnspent(address: string): Promise<Utxo[]> {
  const { hash160 } = decodeCashaddr(address);
  const sh = scriptHashForP2pkh(hash160);
  const [res] = await electrum([
    { id: 1, method: 'blockchain.scripthash.listunspent', params: [sh] },
  ]);
  if (!Array.isArray(res)) return [];
  return res as Utxo[];
}

/**
 * Look for a UTXO matching expected sats (exact, for satoshi-tag attribution).
 * Returns the matching UTXO or null.
 */
export async function findPayment(
  address: string,
  expectedSats: number
): Promise<Utxo | null> {
  const utxos = await listUnspent(address);
  // Exact match preferred (satoshi tag)
  const exact = utxos.find((u) => u.value === expectedSats);
  if (exact) return exact;
  // Allow small under/over without tag collision (legacy tolerance)
  const close = utxos.find(
    (u) =>
      u.value >= Math.floor(expectedSats * 0.99) &&
      u.value <= Math.ceil(expectedSats * 1.05)
  );
  return close ?? null;
}
