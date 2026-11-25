import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const loadEnv = () => {
  try {
    for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {}
};

loadEnv();

const URL_BASE = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const ANON = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;

if (!URL_BASE || !ANON || !EMAIL || !PASSWORD) {
  console.error('Wymagane: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY (.env) oraz TEST_EMAIL i TEST_PASSWORD.');
  console.error('Konto testowe nie moze miec wlaczonego Google Authenticator.');
  process.exit(2);
}

const results = [];
const record = (id, name, expected, actual, pass) => {
  results.push({ id, name, expected, actual, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${name}\n      oczekiwane: ${expected}\n      wynik:      ${actual}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const call = async (path, { method = 'GET', token = ANON, body, headers = {} } = {}) => {
  const res = await fetch(`${URL_BASE}${path}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  return { status: res.status, json, text };
};

const decodeJwt = (jwt) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));

const passwordLogin = async () => {
  const r = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  if (r.status !== 200) throw new Error(`Logowanie nie powiodlo sie: HTTP ${r.status} ${r.text}`);
  return r.json;
};

const refresh = (refreshToken) =>
  call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: refreshToken } });

const logout = (token, scope = 'local') => call(`/auth/v1/logout?scope=${scope}`, { method: 'POST', token });

const accountRows = async (token) => {
  const r = await call('/rest/v1/accounts?select=id', { token });
  return Array.isArray(r.json) ? r.json.length : `HTTP ${r.status}`;
};

const main = async () => {
  const s1 = await passwordLogin();
  const claims = decodeJwt(s1.access_token);
  const ttl = claims.exp - claims.iat;
  record('P1', 'Waznosc tokenu dostepu (exp - iat)', '3600 s', `${ttl} s, session_id=${claims.session_id ? 'jest' : 'brak'}`, ttl === 3600 && !!claims.session_id);

  const rows = await accountRows(s1.access_token);
  record('S0', 'Zwykle zapytanie z tokenem dostepu', '1 wiersz rachunku', String(rows), rows === 1);
  if (rows === 0) console.log('      uwaga: 0 wierszy zwykle oznacza konto z wlaczonym 2FA (aal1) albo brak rachunku');

  const r2 = await refresh(s1.refresh_token);
  const r3 = r2.status === 200 ? await refresh(r2.json.refresh_token) : r2;
  record('S4', 'Odswiezenie tokenu (rotacja)', 'nowy, inny token odswiezania przy kazdym uzyciu',
    r3.status === 200 ? 'HTTP 200, tokeny rozne' : `HTTP ${r3.status}`,
    r2.status === 200 && r3.status === 200 && r2.json.refresh_token !== s1.refresh_token && r3.json.refresh_token !== r2.json.refresh_token);

  console.log('      czekam 12 s (okno ponownego uzycia 10 s)...');
  await sleep(12000);
  const reuse = await refresh(s1.refresh_token);
  record('A1', 'Ponowne uzycie starego tokenu odswiezania', 'odrzucone (HTTP 400)', `HTTP ${reuse.status} ${reuse.json?.error_code || reuse.json?.msg || ''}`.trim(), reuse.status === 400);

  const afterReuse = r3.status === 200 ? await refresh(r3.json.refresh_token) : { status: 0 };
  record('A2', 'Aktualny token odswiezania po wykryciu ponownego uzycia', 'odrzucony - cala sesja uniewazniona', `HTTP ${afterReuse.status}`, afterReuse.status === 400);

  const rowsAfterReuse = r3.status === 200 ? await accountRows(r3.json.access_token) : 'brak';
  record('A3', 'Token dostepu sesji uniewaznionej przez reuse', '0 wierszy (session_active)', String(rowsAfterReuse), rowsAfterReuse === 0);

  const s2 = await passwordLogin();
  const before = await accountRows(s2.access_token);
  const out = await logout(s2.access_token, 'local');
  const userAfter = await call('/auth/v1/user', { token: s2.access_token });
  const rowsAfter = await accountRows(s2.access_token);
  const rpcAfter = await call('/rest/v1/rpc/my_sessions', { method: 'POST', token: s2.access_token, body: {} });
  record('D1', 'Stary token dostepu po wylogowaniu: /auth/v1/user', 'odrzucony (401/403)', `logout HTTP ${out.status}, /user HTTP ${userAfter.status}`, [401, 403].includes(userAfter.status));
  record('D2', 'Stary token dostepu po wylogowaniu: dane (PostgREST)', `przed: 1, po: 0`, `przed: ${before}, po: ${rowsAfter}`, before === 1 && rowsAfter === 0);
  record('D3', 'Stary token dostepu po wylogowaniu: RPC', 'not_authorized', `HTTP ${rpcAfter.status} ${rpcAfter.json?.message || ''}`.trim(), /not_authorized/.test(rpcAfter.text));

  const s3 = await passwordLogin();
  const s4 = await passwordLogin();
  const listed = await call('/rest/v1/rpc/my_sessions', { method: 'POST', token: s4.access_token, body: {} });
  const count = Array.isArray(listed.json) ? listed.json.length : 0;
  await logout(s4.access_token, 'others');
  const otherRows = await accountRows(s3.access_token);
  const ownRows = await accountRows(s4.access_token);
  record('C1', 'Wyloguj pozostale urzadzenia (scope=others)', 'inna sesja: 0 wierszy, biezaca: 1', `sesji przed: ${count}, inna: ${otherRows}, biezaca: ${ownRows}`, otherRows === 0 && ownRows === 1);

  const tx = await call('/rest/v1/transactions', {
    method: 'POST', token: s4.access_token,
    body: { sender_account_id: randomUUID(), recipient_account_number: '0'.repeat(26), recipient_name: 'x', amount: 1, title: 'x', status: 'completed' },
  });
  const acc = await call('/rest/v1/accounts', {
    method: 'POST', token: s4.access_token,
    body: { user_id: claims.sub, account_number: 'TEST', balance: 1000000 },
  });
  record('T1', 'Bezposredni zapis przelewu z tokenem uzytkownika', 'odrzucony (401/403)', `HTTP ${tx.status}`, [401, 403].includes(tx.status));
  record('T2', 'Bezposrednie utworzenie rachunku z dowolnym saldem', 'odrzucone (401/403)', `HTTP ${acc.status}`, [401, 403].includes(acc.status));

  const transferNoPin = await call('/rest/v1/rpc/execute_transfer', {
    method: 'POST', token: s4.access_token,
    body: { p_recipient_account: '61109010140000071219812874', p_recipient_name: 'Test', p_amount: 0.01, p_title: 'test', p_pin: '000000', p_request_id: randomUUID() },
  });
  const transferStatus = transferNoPin.json?.status || transferNoPin.json?.message || transferNoPin.status;
  record('R1', 'Przelew bez poprawnego PIN-u', 'status pin_invalid, brak obciazenia', String(transferStatus), transferStatus === 'pin_invalid');
  console.log('      uwaga: R1 zuzywa 1 probe PIN-u konta testowego; licznik zeruje sie po poprawnym PIN-ie');

  const lookup = await call('/rest/v1/rpc/lookup_email_by_client_number', { method: 'POST', body: { p_client_number: '12345678' } });
  record('L1', 'Anonimowe pobranie e-maila po numerze klienta', 'funkcja usunieta (404)', `HTTP ${lookup.status}`, lookup.status === 404);

  const probe = `test-${randomUUID()}@example.invalid`;
  let last = null;
  for (let i = 0; i < 6; i++) {
    last = await call('/rest/v1/rpc/resolve_login', { method: 'POST', body: { p_login: probe, p_password: 'zle-haslo' } });
  }
  record('L2', 'Limit nieudanych logowan (6 prob z blednym haslem)', 'status locked', `${last.json?.status} retry_after=${last.json?.retry_after ?? '-'}`, last.json?.status === 'locked');

  await logout(s3.access_token, 'local');
  await logout(s4.access_token, 'local');

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} PASS`);
  process.exit(failed ? 1 : 0);
};

main().catch((e) => {
  console.error(e.message);
  process.exit(2);
});
