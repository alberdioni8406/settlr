/**
 * Settlr production-path server (Node builtins only).
 *
 * Non-custodial rules:
 * - Never accepts or stores private keys, seeds, or nsecs.
 * - Invoice payment address is the merchant's own cashaddr.
 * - Payments are attributed by a unique satoshi tag on a shared address.
 * - Payment status comes from a public Electrum server, not a demo button.
 * - Stablecoin conversion is an unsigned settlement plan the merchant signs.
 *   Settlr never broadcasts a settlement it did not observe on-chain.
 *
 * Run: node standalone/server.mjs
 */

import http from 'node:http';
import tls from 'node:tls';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = process.env.SETTLR_DATA || path.join(ROOT, 'data', 'store.json');
const PORT = Number(process.env.PORT || 3847);
const INDEXER = process.env.CAULDRON_INDEXER_URL || 'https://indexer.riften.net';
const ELECTRUM_HOST = process.env.ELECTRUM_HOST || 'electrum.imaginary.cash';
const ELECTRUM_PORT = Number(process.env.ELECTRUM_PORT || 50002);

const ASSETS = {
  BCH: { symbol: 'BCH', name: 'Bitcoin Cash', tokenId: null, decimals: 8, settlementEnabled: true },
  PUSD: {
    symbol: 'PUSD',
    name: 'ParyOnUSD',
    tokenId: '2469acc5afa4b10cb5b5c04afb89c3a3ffd61c5da9c01e26d00951cae2a02544',
    decimals: 2,
    settlementEnabled: true,
    minLiquiditySats: 10_000_000,
  },
  MUSD: {
    symbol: 'MUSD',
    name: 'MORIA USD',
    tokenId: 'b38a33f750f84c5c169a6f23cb873e6e79605021585d4f3408789689ed87f366',
    decimals: 8,
    settlementEnabled: false,
    minLiquiditySats: 10_000_000,
  },
};

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function uid(n = 16) {
  return randomBytes(Math.ceil((n * 3) / 4)).toString('base64url').slice(0, n);
}

function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch {
    return { merchants: {}, invoices: {}, quotes: {} };
  }
}
function saveStore(store) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  const tmp = DATA_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, DATA_PATH);
}
let store = loadStore();

function polymod(values) {
  const GEN = [0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n];
  let chk = 1n;
  for (const v of values) {
    const value = BigInt(v);
    const top = chk >> 35n;
    chk = ((chk & 0x07ffffffffn) << 5n) ^ value;
    for (let i = 0; i < 5; i++) if ((top >> BigInt(i)) & 1n) chk ^= GEN[i];
  }
  return chk;
}
function prefixExpand(prefix) {
  const out = [];
  for (const c of prefix) out.push(c.charCodeAt(0) & 31);
  out.push(0);
  return out;
}
function convertBits(data, from, to, pad) {
  let acc = 0;
  let bits = 0;
  const ret = [];
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

/** Validate cashaddr and return 20-byte hash for P2PKH (type 0). */
export function decodeCashaddr(input) {
  let addr = String(input || '').trim().toLowerCase();
  if (!addr.startsWith('bitcoincash:')) addr = 'bitcoincash:' + addr;
  const prefix = 'bitcoincash';
  const payload = addr.slice(prefix.length + 1);
  if (!payload || payload.length < 8) throw new Error('Invalid cashaddr');
  const data = [];
  for (const c of payload) {
    const v = CHARSET.indexOf(c);
    if (v < 0) throw new Error('Invalid cashaddr character');
    data.push(v);
  }
  if (polymod(prefixExpand(prefix).concat(data)) !== 1n) throw new Error('Invalid cashaddr checksum');
  const decoded = convertBits(data.slice(0, -8), 5, 8, false);
  if (!decoded || decoded.length < 21) throw new Error('Invalid cashaddr payload');
  const version = decoded[0];
  const type = version >> 3;
  const hash = Buffer.from(decoded.slice(1));
  if (type !== 0 || hash.length !== 20) {
    throw new Error('Only P2PKH cashaddr destinations are accepted in this release');
  }
  return { address: addr, hash160: hash.toString('hex'), type: 'p2pkh' };
}

function scriptHashForP2pkh(hash160hex) {
  const hash = Buffer.from(hash160hex, 'hex');
  const script = Buffer.concat([
    Buffer.from([0x76, 0xa9, 0x14]),
    hash,
    Buffer.from([0x88, 0xac]),
  ]);
  return createHash('sha256').update(script).digest().reverse().toString('hex');
}

function electrum(calls) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: ELECTRUM_HOST,
      port: ELECTRUM_PORT,
      servername: ELECTRUM_HOST,
      rejectUnauthorized: true,
    });
    let buf = '';
    const results = new Map();
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
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id != null) results.set(msg.id, msg);
        } catch {}
      }
      if (results.size >= calls.length) {
        clearTimeout(timer);
        socket.end();
        resolve(calls.map((c) => results.get(c.id)));
      }
    });
    socket.on('secureConnect', () => {
      for (const c of calls) socket.write(JSON.stringify(c) + '\n');
    });
  });
}

async function listUnspent(address) {
  const { hash160 } = decodeCashaddr(address);
  const sh = scriptHashForP2pkh(hash160);
  const [res] = await electrum([
    { id: 1, method: 'blockchain.scripthash.listunspent', params: [sh] },
  ]);
  if (res?.error) throw new Error(res.error.message || 'Electrum error');
  return res?.result || [];
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function getBchUsd() {
  const d = await fetchJson(`${INDEXER}/oracle/cash/closest`);
  const raw = d?.oracle_price ?? d?.price;
  if (typeof raw !== 'number' || raw <= 0) throw new Error('Oracle returned no BCH/USD price');
  // Delphi prices are integer cents.
  return raw > 1000 ? raw / 100 : raw;
}

async function getLiquidity(tokenId) {
  const d = await fetchJson(`${INDEXER}/cauldron/pool/active?token=${encodeURIComponent(tokenId)}`);
  const pools = d.active || [];
  let totalSats = 0;
  let totalTokens = 0;
  for (const p of pools) {
    totalSats += Number(p.sats) || 0;
    totalTokens += Number(p.tokens) || 0;
  }
  return { totalSats, totalTokens, poolCount: pools.length, pools };
}

function cpmmOut(satsIn, reserveSats, reserveTokens) {
  // k = tokens * (sats - fee); fee = 0.3% of sats added. Output tokens.
  const fee = Math.floor(satsIn * 3 / 1000);
  const effective = satsIn - fee;
  if (effective <= 0 || reserveSats <= 0 || reserveTokens <= 0) return 0;
  const k = reserveSats * reserveTokens;
  const newSats = reserveSats + effective;
  const newTokens = k / newSats;
  return Math.max(0, reserveTokens - newTokens);
}

async function createQuote(invoiceId, usdAmount, settlementAsset) {
  if (!ASSETS[settlementAsset]?.settlementEnabled) {
    throw new Error(`${settlementAsset} settlement is not enabled`);
  }
  const bchUsd = await getBchUsd();
  const baseSats = Math.ceil((usdAmount / bchUsd) * 1e8);
  // Unique 1–999 sat tag so a shared merchant address can attribute the payment.
  const tag = (parseInt(invoiceId.replace(/[^0-9a-f]/gi, '').slice(0, 6), 16) % 999) + 1;
  const bchAmountSats = baseSats + tag;

  let expectedSettlement = (bchAmountSats / 1e8).toFixed(8) + ' BCH';
  let conversionFeeBps;
  let priceImpactBps;
  let routeSummary = 'Native BCH to merchant address — no conversion';
  let settlementPlan = null;

  if (settlementAsset !== 'BCH') {
    const asset = ASSETS[settlementAsset];
    const liq = await getLiquidity(asset.tokenId);
    if (liq.poolCount === 0 || liq.totalSats < asset.minLiquiditySats) {
      throw new Error(`Insufficient Cauldron liquidity for ${settlementAsset}`);
    }
    const best = [...liq.pools].sort((a, b) => b.sats - a.sats)[0];
    const outBase = cpmmOut(bchAmountSats, best.sats, best.tokens);
    const human = outBase / 10 ** asset.decimals;
    conversionFeeBps = 30;
    priceImpactBps = Math.min(Math.round((bchAmountSats / best.sats) * 10000), 5000);
    expectedSettlement = human.toFixed(Math.min(asset.decimals, 4)) + ' ' + settlementAsset;
    routeSummary = `Unsigned Cauldron plan BCH → ${settlementAsset} via deepest pool (${liq.poolCount} pools, ${(liq.totalSats / 1e8).toFixed(2)} BCH). Merchant must sign.`;
    settlementPlan = {
      kind: 'unsigned',
      supply: 'BCH',
      demand: settlementAsset,
      tokenId: asset.tokenId,
      poolTxid: best.txid,
      poolVout: best.tx_pos,
      poolSats: best.sats,
      poolTokens: best.tokens,
      estimatedOutputBaseUnits: Math.floor(outBase),
      note: 'Not a broadcast transaction. Construction via @cashlab/cauldron and merchant signature still required before settlement can complete.',
    };
  }

  const now = Date.now();
  const q = {
    id: uid(16),
    invoiceId,
    usdAmount,
    bchAmountSats,
    satoshiTag: tag,
    bchAmount: (bchAmountSats / 1e8).toFixed(8),
    bchUsdPrice: bchUsd,
    settlementAsset,
    expectedSettlementAmount: expectedSettlement,
    conversionFeeBps,
    priceImpactBps,
    routeSummary,
    settlementPlan,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
  };
  store.quotes[q.id] = q;
  saveStore(store);
  return q;
}

async function watchInvoice(inv) {
  if (!['AWAITING_PAYMENT', 'UNDERPAID', 'QUOTED', 'CREATED'].includes(inv.status)) return inv;
  if (inv.quoteExpiresAt && Date.now() > new Date(inv.quoteExpiresAt).getTime() && !inv.paymentTxId) {
    inv.status = 'EXPIRED';
    inv.updatedAt = new Date().toISOString();
    saveStore(store);
    return inv;
  }
  const utxos = await listUnspent(inv.paymentAddress);
  const match = utxos.find((u) => Number(u.value) === Number(inv.bchAmountSats));
  const close = utxos.find((u) => {
    const v = Number(u.value);
    return v >= inv.bchAmountSats * 0.99 && v <= inv.bchAmountSats * 1.02;
  });
  const hit = match || close;
  if (!hit) return inv;
  const amount = Number(hit.value);
  let status = 'PAYMENT_DETECTED';
  if (hit.height && hit.height > 0) status = 'PAYMENT_VALIDATED';
  if (amount < inv.bchAmountSats * 0.99) status = 'UNDERPAID';
  else if (amount > inv.bchAmountSats * 1.02) status = 'OVERPAID';
  inv.status = status;
  inv.paymentTxId = hit.tx_hash;
  inv.paymentAmountSats = amount;
  inv.paymentHeight = hit.height || 0;
  inv.paymentDetectedAt = inv.paymentDetectedAt || new Date().toISOString();
  inv.updatedAt = new Date().toISOString();
  if (inv.settlementAsset === 'BCH' && status === 'PAYMENT_VALIDATED') {
    inv.status = 'SETTLED';
    inv.settledAmount = (amount / 1e8).toFixed(8) + ' BCH';
    inv.settlementTxId = hit.tx_hash;
    inv.settlementNote = 'Settled directly to merchant cashaddr. Settlr did not custody funds.';
  } else if (inv.settlementAsset !== 'BCH' && status === 'PAYMENT_VALIDATED') {
    inv.status = 'SETTLEMENT_REQUIRED';
    inv.settlementNote = 'BCH received at merchant address. Unsigned Cauldron plan is attached. Settlement completes only after the merchant-signed swap is observed.';
  }
  saveStore(store);
  return inv;
}

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(body));
}
function html(res, body) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
}
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString();
  return raw ? JSON.parse(raw) : {};
}

const CSS = `
:root{--bg:#0a0c0f;--card:#161a21;--border:#252b36;--text:#e6e9ef;--muted:#8b95a8;--accent:#0ac18e;--warn:#f5a623;--ok:#30a46c;--danger:#e5484d}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
a{color:var(--accent);text-decoration:none}.card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:1.25rem}
.btn{display:inline-flex;padding:.7rem 1.1rem;border-radius:8px;font-weight:600;border:none;cursor:pointer;background:var(--accent);color:#04140f}
.input{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:.7rem .9rem;color:var(--text);font-size:1rem}
.label{font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:.3rem;display:block}
.mono{font-family:ui-monospace,monospace}.wrap{max-width:32rem;margin:0 auto;padding:1.5rem 1rem}
header{border-bottom:1px solid var(--border);padding:.75rem 1rem;display:flex;justify-content:space-between;align-items:center}
`;
function shell(title, body) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title} · Settlr</title><style>${CSS}</style></head><body>
<header><a href="/" style="color:var(--text);font-weight:700">Settlr</a><nav style="display:flex;gap:1rem;font-size:.875rem"><a href="/merchant">Merchant</a><a href="/dashboard">Dashboard</a></nav></header>
${body}<footer style="text-align:center;padding:1.5rem;font-size:.75rem;color:var(--muted)">Non-custodial · pays the merchant address · Electrum watch · no keys stored</footer></body></html>`;
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
    const pathName = u.pathname;
    const method = req.method || 'GET';

    if (pathName === '/api/health') {
      return json(res, 200, {
        ok: true,
        electrum: `${ELECTRUM_HOST}:${ELECTRUM_PORT}`,
        indexer: INDEXER,
        custody: false,
      });
    }
    if (pathName === '/api/assets' && method === 'GET') {
      return json(res, 200, { assets: Object.values(ASSETS) });
    }
    if (pathName === '/api/merchants' && method === 'GET') {
      return json(res, 200, { merchants: Object.values(store.merchants) });
    }
    if (pathName === '/api/merchants' && method === 'POST') {
      const body = await readBody(req);
      if (!body.name) return json(res, 400, { error: 'name required' });
      const dest = {};
      if (body.bchAddress) dest.BCH = decodeCashaddr(body.bchAddress).address;
      if (body.pusdAddress) dest.PUSD = decodeCashaddr(body.pusdAddress).address;
      if (body.musdAddress) dest.MUSD = decodeCashaddr(body.musdAddress).address;
      if (!dest.BCH) return json(res, 400, { error: 'A merchant-controlled BCH cashaddr is required. Settlr does not generate keys.' });
      const id = uid(12);
      const m = {
        id,
        name: String(body.name).slice(0, 80),
        defaultSettlement: ['BCH', 'PUSD', 'MUSD'].includes(body.defaultSettlement) ? body.defaultSettlement : 'BCH',
        destinations: dest,
        createdAt: new Date().toISOString(),
      };
      store.merchants[id] = m;
      saveStore(store);
      return json(res, 200, m);
    }

    if (pathName === '/api/invoices' && method === 'POST') {
      const body = await readBody(req);
      const merchant = store.merchants[body.merchantId];
      if (!merchant) return json(res, 400, { error: 'Unknown merchant. Onboard a merchant-controlled address first.' });
      const usd = Number(body.usdAmount);
      if (!(usd > 0) || usd > 1_000_000) return json(res, 400, { error: 'Invalid usdAmount' });
      let settlement = body.settlementAsset || merchant.defaultSettlement || 'BCH';
      if (!ASSETS[settlement]?.settlementEnabled) {
        return json(res, 400, { error: `${settlement} settlement is disabled` });
      }
      const payTo = merchant.destinations.BCH;
      if (!payTo) return json(res, 400, { error: 'Merchant has no BCH destination' });
      const id = uid(16);
      const quote = await createQuote(id, usd, settlement);
      const inv = {
        id,
        merchantId: merchant.id,
        description: String(body.description || '').slice(0, 200),
        usdAmount: usd,
        settlementAsset: settlement,
        status: 'AWAITING_PAYMENT',
        paymentAddress: payTo,
        bchAmountSats: quote.bchAmountSats,
        currentQuoteId: quote.id,
        quoteExpiresAt: quote.expiresAt,
        paymentTxId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.invoices[id] = inv;
      saveStore(store);
      return json(res, 200, publicInvoice(inv, quote));
    }

    if (pathName === '/api/invoices' && method === 'GET') {
      const merchantId = u.searchParams.get('merchantId');
      const list = Object.values(store.invoices)
        .filter((i) => !merchantId || i.merchantId === merchantId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return json(res, 200, { invoices: list.map((i) => publicInvoice(i, store.quotes[i.currentQuoteId])) });
    }

    const invMatch = pathName.match(/^\/api\/invoices\/([^/]+)$/);
    if (invMatch && method === 'GET') {
      const inv = store.invoices[invMatch[1]];
      if (!inv) return json(res, 404, { error: 'Invoice not found' });
      if (inv.status === 'AWAITING_PAYMENT' && inv.quoteExpiresAt && Date.now() > new Date(inv.quoteExpiresAt).getTime()) {
        try {
          const q = await createQuote(inv.id, inv.usdAmount, inv.settlementAsset);
          inv.bchAmountSats = q.bchAmountSats;
          inv.currentQuoteId = q.id;
          inv.quoteExpiresAt = q.expiresAt;
          inv.updatedAt = new Date().toISOString();
          saveStore(store);
        } catch (e) {
          inv.status = 'EXPIRED';
          inv.updatedAt = new Date().toISOString();
          saveStore(store);
        }
      }
      try {
        await watchInvoice(inv);
      } catch (e) {
        inv.watchError = e.message;
      }
      return json(res, 200, publicInvoice(inv, store.quotes[inv.currentQuoteId]));
    }

    const watchMatch = pathName.match(/^\/api\/invoices\/([^/]+)\/watch$/);
    if (watchMatch && method === 'POST') {
      const inv = store.invoices[watchMatch[1]];
      if (!inv) return json(res, 404, { error: 'Invoice not found' });
      await watchInvoice(inv);
      return json(res, 200, publicInvoice(inv, store.quotes[inv.currentQuoteId]));
    }

    if (pathName === '/' ) {
      return html(res, shell('Home', `<div class="wrap" style="max-width:42rem;padding-top:2.5rem">
        <p style="color:var(--accent);letter-spacing:.08em;text-transform:uppercase;font-size:.8rem">Bitcoin Cash payment infrastructure</p>
        <h1 style="font-size:2.4rem;margin:.4rem 0">Pay in BCH.<br><span style="color:var(--muted)">Settle your way.</span></h1>
        <p style="color:var(--muted)">Customers pay the merchant's own address. Settlr watches the chain and never holds keys.</p>
        <p><a class="btn" href="/merchant">Merchant setup</a></p>
      </div>`));
    }
    if (pathName === '/merchant') {
      return html(res, shell('Merchant', `<div class="wrap"><h1>Merchant</h1>
        <div class="card">
          <label class="label">Business name</label><input class="input" id="name" placeholder="Cafe" style="margin-bottom:.8rem"/>
          <label class="label">Your BCH cashaddr (you control this)</label><input class="input mono" id="bch" placeholder="bitcoincash:q..." style="margin-bottom:.8rem"/>
          <label class="label">PUSD cashaddr (optional, same wallet)</label><input class="input mono" id="pusd" placeholder="bitcoincash:q..." style="margin-bottom:.8rem"/>
          <button class="btn" id="save">Save merchant</button>
          <p id="mid" class="mono" style="font-size:.8rem;color:var(--muted)"></p>
        </div>
        <div class="card" style="margin-top:1rem">
          <label class="label">Merchant id</label><input class="input mono" id="midIn" style="margin-bottom:.8rem"/>
          <label class="label">Description</label><input class="input" id="desc" value="Coffee" style="margin-bottom:.8rem"/>
          <label class="label">USD</label><input class="input mono" id="usd" value="5.00" style="margin-bottom:.8rem"/>
          <label class="label">Settlement</label>
          <select class="input" id="settl"><option>BCH</option><option>PUSD</option></select>
          <p id="err" style="color:var(--danger);font-size:.85rem"></p>
          <button class="btn" id="go" style="margin-top:.6rem">Create invoice</button>
        </div></div>
        <script>
        const saved=localStorage.getItem('settlr_merchant');
        if(saved){const m=JSON.parse(saved);document.getElementById('midIn').value=m.id;document.getElementById('mid').textContent='Saved '+m.id;}
        document.getElementById('save').onclick=async()=>{
          const res=await fetch('/api/merchants',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:document.getElementById('name').value,bchAddress:document.getElementById('bch').value,pusdAddress:document.getElementById('pusd').value||undefined,defaultSettlement:'BCH'})});
          const d=await res.json();
          if(!res.ok){document.getElementById('err').textContent=d.error;return;}
          localStorage.setItem('settlr_merchant',JSON.stringify(d));
          document.getElementById('midIn').value=d.id;
          document.getElementById('mid').textContent='Saved '+d.id;
        };
        document.getElementById('go').onclick=async()=>{
          document.getElementById('err').textContent='';
          const res=await fetch('/api/invoices',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({merchantId:document.getElementById('midIn').value,usdAmount:Number(document.getElementById('usd').value),description:document.getElementById('desc').value,settlementAsset:document.getElementById('settl').value})});
          const d=await res.json();
          if(!res.ok){document.getElementById('err').textContent=d.error;return;}
          location.href='/pay/'+d.invoice_id;
        };
        </script>`));
    }
    const pay = pathName.match(/^\/pay\/([^/]+)$/);
    if (pay) {
      const id = pay[1];
      return html(res, shell('Pay', `<div class="wrap"><div class="card" id="box">Loading…</div></div>
        <script>
        const id=${JSON.stringify(id)};
        async function load(){
          const res=await fetch('/api/invoices/'+id);
          const d=await res.json();
          if(!res.ok){document.getElementById('box').innerHTML=d.error;return;}
          const left=d.expires_at?Math.max(0,Math.floor((new Date(d.expires_at)-Date.now())/1000)):null;
          const qr='https://api.qrserver.com/v1/create-qr-code/?size=220x220&data='+encodeURIComponent(d.payment_uri);
          document.getElementById('box').innerHTML='<p class="label">Pay with Bitcoin Cash</p><h1>$'+d.usd_amount.toFixed(2)+' USD</h1>'
            +(d.status==='AWAITING_PAYMENT'?'<img alt="qr" width="220" height="220" src="'+qr+'" style="background:#fff;padding:8px;border-radius:8px"/>':'')
            +'<p class="mono" style="font-size:1.2rem">'+d.bch_amount+' BCH</p>'
            +(left!=null&&d.status==='AWAITING_PAYMENT'?'<p style="color:var(--warn)">Quote '+Math.floor(left/60)+':'+String(left%60).padStart(2,"0")+'</p>':'')
            +'<p class="mono" style="font-size:.72rem;word-break:break-all">'+d.payment_address+'</p>'
            +'<p>Status <strong>'+d.status+'</strong></p>'
            +(d.payment_txid?'<p class="mono" style="font-size:.72rem">tx '+d.payment_txid+'</p>':'')
            +'<p style="color:var(--muted);font-size:.85rem">'+ (d.route_summary||'') +'</p>'
            +(d.expected_settlement?'<p>Merchant receives ~'+d.expected_settlement+'</p>':'')
            +(d.settlement_note?'<p style="font-size:.8rem;color:var(--muted)">'+d.settlement_note+'</p>':'');
        }
        load(); setInterval(load, 8000);
        </script>`));
    }
    if (pathName === '/dashboard') {
      return html(res, shell('Dashboard', `<div class="wrap" style="max-width:50rem"><h1>Dashboard</h1><div class="card" id="list">Loading…</div></div>
        <script>
        async function load(){
          const m=JSON.parse(localStorage.getItem('settlr_merchant')||'null');
          const q=m?'?merchantId='+m.id:'';
          const d=await (await fetch('/api/invoices'+q)).json();
          const rows=d.invoices||[];
          document.getElementById('list').innerHTML=rows.length?('<table style="width:100%;font-size:.85rem"><tr><th align="left">Invoice</th><th>USD</th><th>Asset</th><th>Status</th></tr>'+rows.map(i=>'<tr><td><a href="/pay/'+i.invoice_id+'">'+i.invoice_id.slice(0,10)+'</a></td><td>$'+i.usd_amount.toFixed(2)+'</td><td>'+i.settlement_asset+'</td><td>'+i.status+'</td></tr>').join('')+'</table>'):'No invoices for this merchant yet.';
        }
        load(); setInterval(load,10000);
        </script>`));
    }
    json(res, 404, { error: 'Not found' });
  } catch (e) {
    json(res, 500, { error: e.message || 'error' });
  }
});

function publicInvoice(inv, quote) {
  const amount = quote?.bchAmount || (inv.bchAmountSats ? (inv.bchAmountSats / 1e8).toFixed(8) : null);
  return {
    invoice_id: inv.id,
    merchant_id: inv.merchantId,
    description: inv.description,
    usd_amount: inv.usdAmount,
    settlement_asset: inv.settlementAsset,
    status: inv.status,
    payment_address: inv.paymentAddress,
    payment_uri: amount ? `${inv.paymentAddress}?amount=${amount}` : inv.paymentAddress,
    bch_amount: amount,
    bch_amount_sats: inv.bchAmountSats,
    satoshi_tag: quote?.satoshiTag ?? null,
    expected_settlement: quote?.expectedSettlementAmount ?? inv.settledAmount ?? null,
    route_summary: quote?.routeSummary ?? null,
    conversion_fee_bps: quote?.conversionFeeBps ?? null,
    price_impact_bps: quote?.priceImpactBps ?? null,
    bch_usd_price: quote?.bchUsdPrice ?? null,
    settlement_plan: quote?.settlementPlan ?? null,
    settlement_note: inv.settlementNote ?? null,
    expires_at: quote?.expiresAt ?? inv.quoteExpiresAt,
    payment_txid: inv.paymentTxId,
    settlement_txid: inv.settlementTxId || null,
    created_at: inv.createdAt,
    watch_error: inv.watchError || null,
  };
}

server.listen(PORT, () => {
  console.log(`Settlr listening on http://127.0.0.1:${PORT}`);
  console.log(`data ${DATA_PATH}`);
  console.log(`electrum ${ELECTRUM_HOST}:${ELECTRUM_PORT}`);
});
