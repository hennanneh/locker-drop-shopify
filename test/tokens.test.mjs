// Expiring offline token regression tests. Runs the real token helpers from
// server.js against PGlite (in-process Postgres) with Shopify mocked.
// Run: npm test

import { PGlite } from '@electric-sql/pglite';
import fs from 'fs'; import vm from 'vm'; import assert from 'assert';
const src = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const grab = (startMarker, endMarker) => { const a = src.indexOf(startMarker), b = src.indexOf(endMarker, a); assert(a >= 0 && b > a, startMarker); return src.slice(a, b); };
const code = [
  grab('async function shopifyGraphQL(', '// Fetch all products with variants'),
  grab('// Persist tokens from an OAuth code-exchange', 'async function registerCarrierService('),
].join('\n');

const pg = new PGlite();
await pg.exec(`CREATE TABLE stores (shop text primary key, access_token text, refresh_token text, token_expires_at timestamptz, refresh_token_expires_at timestamptz, needs_reauth boolean not null default false);`);
const db = { query: (q, p) => pg.query(q, p), encryptToken: t => t };
const calls = [];
let handler;
const axios = { post: async (url, body, opts) => { calls.push({ url, body, opts }); await new Promise(r => setTimeout(r, 20)); return handler(url, body, opts); } };
const err = (status, data) => Object.assign(new Error('HTTP ' + status), { response: { status, data } });
const logs = []; const logger = { info: (...a) => logs.push(['info', ...a]), warn: (...a) => logs.push(['warn', ...a]), error: (...a) => logs.push(['error', ...a]) };
const ctx = { db, axios, logger, accessTokens: new Map(), tokenExpiry: new Map(), refreshInFlight: new Map(), process: { env: { SHOPIFY_API_KEY: 'k', SHOPIFY_API_SECRET: 's' } }, SHOPIFY_API_VERSION: '2026-10', URLSearchParams, setTimeout, Date, Promise, Error, Map };
vm.createContext(ctx); vm.runInContext(code + '\nthis.F={shopifyGraphQL,storeShopTokens,refreshAccessToken,getValidAccessToken,tokenForRequest,migrateLegacyToken,refreshExpiringTokens};', ctx);
const F = ctx.F;
const reset = async (rows) => { await pg.exec('DELETE FROM stores'); ctx.accessTokens.clear(); ctx.tokenExpiry.clear(); calls.length = 0; logs.length = 0;
  for (const r of rows) await pg.query('INSERT INTO stores VALUES ($1,$2,$3,$4,$5,$6)', [r.shop, r.at, r.rt, r.exp, null, r.reauth || false]); };
const row = async shop => (await pg.query('SELECT * FROM stores WHERE shop=$1', [shop])).rows[0];
const isToken = u => u.includes('/admin/oauth/access_token'); let n = 0;
const refreshOK = () => ({ data: { access_token: 'AT' + (++n), refresh_token: 'RT' + n, expires_in: 3600, refresh_token_expires_in: 7776000 } });
const soon = () => new Date(Date.now() + 60 * 1000), later = () => new Date(Date.now() + 50 * 60 * 1000);
let pass = 0; const t = async (name, fn) => { try { await fn(); pass++; console.log('PASS', name); } catch (e) { console.log('FAIL', name, '-', e.message); process.exitCode = 1; } };

await t('concurrent refreshes share one request (single-flight)', async () => {
  await reset([{ shop: 'a', at: 'old', rt: 'r0', exp: soon() }]);
  handler = (u) => isToken(u) ? refreshOK() : { data: { data: {} } };
  const out = await Promise.all([1,2,3,4,5].map(() => F.getValidAccessToken('a')));
  assert.equal(calls.filter(c => isToken(c.url)).length, 1); assert(out.every(x => x === out[0] && x.startsWith('AT')));
});
await t('GraphQL refreshes a token about to expire before calling', async () => {
  await reset([{ shop: 'a', at: 'old', rt: 'r0', exp: soon() }]);
  handler = (u, b, o) => isToken(u) ? refreshOK() : { data: { data: { ok: o.headers['X-Shopify-Access-Token'] } } };
  const d = await F.shopifyGraphQL('a', 'old', '{x}');
  assert(d.ok.startsWith('AT')); assert.equal((await row('a')).access_token, d.ok);
});
await t('GraphQL uses cached fresh token over a stale one passed in', async () => {
  await reset([{ shop: 'a', at: 'new', rt: 'r0', exp: later() }]); ctx.accessTokens.set('a', 'new');
  handler = (u, b, o) => ({ data: { data: { ok: o.headers['X-Shopify-Access-Token'] } } });
  assert.equal((await F.shopifyGraphQL('a', 'stale', '{x}')).ok, 'new'); assert.equal(calls.length, 1);
});
await t('GraphQL 401 -> one forced refresh + retry succeeds', async () => {
  await reset([{ shop: 'a', at: 'bad', rt: 'r0', exp: later() }]);
  handler = (u, b, o) => { if (isToken(u)) return refreshOK(); if (o.headers['X-Shopify-Access-Token'] === 'bad') throw err(401, {}); return { data: { data: { ok: 1 } } }; };
  assert.equal((await F.shopifyGraphQL('a', 'bad', '{x}')).ok, 1);
  assert.equal(calls.length, 3); assert.equal((await row('a')).needs_reauth, false);
});
await t('dead refresh token (401) -> needs_reauth set, sweep skips shop', async () => {
  await reset([{ shop: 'a', at: 'x', rt: 'dead', exp: soon() }]);
  handler = (u) => { if (isToken(u)) throw err(401, { error: 'invalid_request' }); return { data: { data: {} } }; };
  await F.refreshExpiringTokens();
  assert.equal((await row('a')).needs_reauth, true); calls.length = 0;
  await F.refreshExpiringTokens(); assert.equal(calls.length, 0);
});
await t('transient refresh failure retries and does NOT flag reauth', async () => {
  await reset([{ shop: 'a', at: 'x', rt: 'r0', exp: soon() }]);
  let k = 0; handler = (u) => { if (isToken(u) && ++k < 3) throw err(503, {}); return refreshOK(); };
  const tok = await F.getValidAccessToken('a');
  assert(tok.startsWith('AT')); assert.equal(k, 3); assert.equal((await row('a')).needs_reauth, false);
});
await t('sweep window 30 min: 25-min token refreshed, 50-min token not', async () => {
  await reset([{ shop: 'a', at: 'x', rt: 'r', exp: new Date(Date.now() + 25*60e3) }, { shop: 'b', at: 'y', rt: 'r', exp: later() }]);
  handler = () => refreshOK(); await F.refreshExpiringTokens();
  assert.equal(calls.length, 1); assert(calls[0].url.includes('a/admin'));
});
await t('legacy token migrated via token exchange (correct params, stored, flag clear)', async () => {
  await reset([{ shop: 'L', at: 'legacy', rt: null, exp: null }]);
  handler = () => refreshOK(); await F.refreshExpiringTokens();
  const c = calls[0]; const p = new URLSearchParams(c.body);
  assert.equal(p.get('grant_type'), 'urn:ietf:params:oauth:grant-type:token-exchange');
  assert.equal(p.get('subject_token'), 'legacy'); assert.equal(p.get('expiring'), '1');
  assert.equal(p.get('subject_token_type'), 'urn:shopify:params:oauth:token-type:offline-access-token');
  assert.equal(p.get('requested_token_type'), 'urn:shopify:params:oauth:token-type:offline-access-token');
  assert.equal(c.opts.headers['Content-Type'], 'application/x-www-form-urlencoded');
  const r = await row('L'); assert(r.token_expires_at && r.refresh_token && r.access_token.startsWith('AT') && !r.needs_reauth);
});
await t('legacy migration invalid_subject_token -> needs_reauth', async () => {
  await reset([{ shop: 'L', at: 'revoked', rt: null, exp: null }]);
  handler = () => { throw err(400, { error: 'invalid_subject_token' }); }; await F.refreshExpiringTokens();
  assert.equal((await row('L')).needs_reauth, true);
});
await t('legacy migration transient error -> retried next sweep, no flag, old token kept', async () => {
  await reset([{ shop: 'L', at: 'legacy', rt: null, exp: null }]);
  handler = () => { throw err(502, {}); }; await F.refreshExpiringTokens();
  const r = await row('L'); assert.equal(r.needs_reauth, false); assert.equal(r.access_token, 'legacy');
});
await t('re-auth (storeShopTokens) clears needs_reauth', async () => {
  await reset([{ shop: 'a', at: 'x', rt: null, exp: null, reauth: true }]);
  await F.storeShopTokens('a', refreshOK().data); assert.equal((await row('a')).needs_reauth, false);
});
await t('legacy GraphQL path: no refresh attempted, token used as-is', async () => {
  await reset([{ shop: 'L', at: 'legacy', rt: null, exp: null }]);
  handler = (u, b, o) => ({ data: { data: { ok: o.headers['X-Shopify-Access-Token'] } } });
  assert.equal((await F.shopifyGraphQL('L', 'legacy', '{x}')).ok, 'legacy'); assert.equal(calls.length, 1);
});
console.log(`\n${pass}/12 passed`);
