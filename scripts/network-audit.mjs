import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import tls from 'node:tls';
import crypto from 'node:crypto';

const results = [];
const check = (id, name, ok, detail) => {
  results.push({ id, name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name} — ${detail}`);
};

const read = (rel) => readFileSync(join(process.cwd(), rel), 'utf8');

const walk = (dir) => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(ts|tsx|js)$/.test(entry.name) ? [full] : [];
  });
};

const nsc = read('android/app/src/main/res/xml/network_security_config.xml');
const pinsInXml = [...nsc.matchAll(/<pin digest="SHA-256">([^<]+)<\/pin>/g)].map((m) => m[1]);
const expMatch = nsc.match(/<pin-set expiration="(\d{4}-\d{2}-\d{2})">/);
const expValid = expMatch ? new Date(expMatch[1]) > new Date() : false;

check(
  'N1',
  'Android Network Security Config (brak HTTP i CA uzytkownika)',
  nsc.includes('cleartextTrafficPermitted="false"') &&
    nsc.includes('<certificates src="system"') &&
    !/<certificates\s+src="user"/i.test(nsc),
  `cleartextTrafficPermitted=false, tylko system CA`
);

check(
  'N2',
  'Android SPKI pin-set z zapasowym pinem i waznym terminem',
  nsc.includes('supabase.co') && pinsInXml.length >= 3 && expValid,
  `piny=${pinsInXml.length}, wygasa=${expMatch?.[1] ?? 'brak'}`
);

const mainManifest = read('android/app/src/main/AndroidManifest.xml');
check(
  'N3',
  'AndroidManifest release bez usesCleartextTraffic i z allowBackup=false',
  mainManifest.includes('android:networkSecurityConfig="@xml/network_security_config"') &&
    mainManifest.includes('android:allowBackup="false"') &&
    !mainManifest.includes('usesCleartextTraffic="true"'),
  'networkSecurityConfig i allowBackup=false obecne'
);

const appJson = JSON.parse(read('app.json'));
const ats = appJson.expo?.ios?.infoPlist?.NSAppTransportSecurity;
const iosPins = ats?.NSPinnedDomains?.['supabase.co']?.NSPinnedCAIdentities ?? [];
check(
  'N4',
  'iOS Info.plist ATS bez NSAllowsArbitraryLoads i z NSPinnedDomains',
  ats?.NSAllowsArbitraryLoads === false &&
    ats?.NSPinnedDomains?.['supabase.co']?.NSIncludesSubdomains === true &&
    iosPins.length >= 2,
  `NSAllowsArbitraryLoads=${ats?.NSAllowsArbitraryLoads}, CA pins=${iosPins.length}`
);

const sourceFiles = [...walk(join(process.cwd(), 'src')), join(process.cwd(), 'App.tsx')];
const httpHits = [];
const bypassHits = [];
const tokenInUrlHits = [];

for (const file of sourceFiles) {
  const txt = readFileSync(file, 'utf8');
  if (/http:\/\/(?!localhost|127\.0\.0\.1|10\.0\.2\.2)/.test(txt)) httpHits.push(file);
  if (/badCertificateCallback|rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED/.test(txt)) {
    bypassHits.push(file);
  }
  if (/[?&](token|access_token|apikey|refresh_token)=/i.test(txt)) {
    tokenInUrlHits.push(file);
  }
}

check('N5', 'Brak niezaszyfrowanych adresow http:// w kodzie aplikacji', httpHits.length === 0, `znaleziono=${httpHits.length}`);
check('N6', 'Brak wylaczenia weryfikacji certyfikatow TLS w kodzie', bypassHits.length === 0, `znaleziono=${bypassHits.length}`);
check('N7', 'Brak tokenow i kluczy przekazywanych w parametrach URL', tokenInUrlHits.length === 0, `znaleziono=${tokenInUrlHits.length}`);

const pinningTs = read('src/services/certificatePinning.ts');
check(
  'N8',
  'Klient HTTP wymusza HTTPS, dozwolony host i blokade przekierowan',
  pinningTs.includes("redirect: 'manual'") && pinningTs.includes('isPinnedHost(urlStr)'),
  'redirect=manual + isPinnedHost aktywne'
);

const babelCfg = read('babel.config.js');
const proguard = read('android/app/proguard-rules.pro');
check(
  'N9',
  'Logowanie JS i Android natywne usuwane w buildzie release',
  babelCfg.includes('transform-remove-console') &&
    !babelCfg.includes('exclude') &&
    proguard.includes('android.util.Log'),
  'babel transform-remove-console (pelne) + ProGuard strip Log'
);

const runLiveChecks = async () => {
  if (!process.argv.includes('--live')) return;
  let urlStr = '';
  try {
    const envTxt = read('.env');
    const match = envTxt.match(/^EXPO_PUBLIC_SUPABASE_URL=(.+)$/m);
    if (match) urlStr = match[1].trim();
  } catch {}
  if (!urlStr) {
    check('N10', 'Weryfikacja live TLS na serwerze Supabase', false, 'brak EXPO_PUBLIC_SUPABASE_URL w .env');
    return;
  }
  const host = new URL(urlStr).hostname;
  const probe = (minVersion, maxVersion) =>
    new Promise((resolve) => {
      try {
        const s = tls.connect({ host, port: 443, servername: host, minVersion, maxVersion }, () => {
          const cert = s.getPeerCertificate(true);
          const x = new crypto.X509Certificate(cert.raw);
          const spki = crypto
            .createHash('sha256')
            .update(x.publicKey.export({ type: 'spki', format: 'der' }))
            .digest('base64');
          const proto = s.getProtocol();
          s.end();
          resolve({ ok: true, proto, spki });
        });
        s.on('error', (err) => resolve({ ok: false, error: err.code || err.message }));
      } catch (err) {
        resolve({ ok: false, error: err.message });
      }
    });

  const [t10, t11, t12, t13] = await Promise.all([
    probe('TLSv1', 'TLSv1'),
    probe('TLSv1.1', 'TLSv1.1'),
    probe('TLSv1.2', 'TLSv1.2'),
    probe('TLSv1.3', 'TLSv1.3'),
  ]);

  check(
    'N10',
    'Serwer odrzuca TLS 1.0/1.1 i obsluguje TLS 1.2/1.3',
    !t10.ok && !t11.ok && t12.ok && t13.ok,
    `TLS1.0=${t10.ok} TLS1.1=${t11.ok} TLS1.2=${t12.ok} TLS1.3=${t13.ok}`
  );
  check(
    'N11',
    'Aktualny certyfikat serwera pasuje do pinu SPKI w network_security_config.xml',
    t13.ok && pinsInXml.includes(t13.spki),
    `live_spki=${t13.spki}`
  );
};

runLiveChecks().then(() => {
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} PASS`);
  process.exit(failed ? 1 : 0);
});
