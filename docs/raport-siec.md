# Raport: komunikacja sieciowa — SecureBank

| Pole | Wartość |
| :--- | :--- |
| **Aplikacja** | SecureBank, `com.securebank.app` (React Native, Expo SDK 58, TypeScript) |
| **Backend** | Supabase: Auth (GoTrue), PostgREST, PostgreSQL (`zxkkowtalnfmdjcmidmp.supabase.co`) |
| **Obszar MASVS** | MASVS-NETWORK-1, MASVS-NETWORK-2 |
| **Stan bazowy („u nas teraz”)** | commit `58214c3` (po Z6) |
| **Stan po poprawkach („docelowo”)** | zmiany Z7 w `plugins/withNetworkSecurityConfig.js`, `app.json`, `src/services/certificatePinning.ts`, `src/services/cameraPermission.ts`, `babel.config.js`, `scripts/network-audit.mjs`, `.github/workflows/network-security.yml` |
| **Testy i weryfikacja** | `npm run test:network` / `node scripts/network-audit.mjs --live` (`11/11 PASS`), analiza paczki release `npx expo export -p android --no-minify --no-bytecode` (735 modułów, `3.9 MB`), przegląd `android/` i `ios.infoPlist` |

Źródła:

* **[MASVS]** OWASP MASVS v2, kategoria `MASVS-NETWORK` (`MASVS-NETWORK-1`, `MASVS-NETWORK-2`); OWASP MASTG
* **[ANSC]** Android Developers, *Network security configuration* (`cleartextTrafficPermitted`, `trust-anchors`, `pin-set`)
* **[ATS]** Apple Developer Documentation, *Identity Pinning* (`NSAppTransportSecurity`, `NSPinnedDomains`, `NSPinnedCAIdentities`)
* **[REST-CS]** OWASP REST Security Cheat Sheet (brak tokenów w URL, nagłówek `Authorization`)
* **[TLS]** RFC 8446 (TLS 1.3), RFC 8996 (wycofanie TLS 1.0 i TLS 1.1), RFC 7469 (SPKI SHA-256)

---

## 1.1 Mapa połączeń

Źródła sprawdzone podczas inwentaryzacji:

1. **Kod aplikacji (`src/`, `App.tsx`, `plugins/`, `app.json`)**: wszystkie żądania sieciowe przechodzą wyłącznie przez jednego klienta `supabase` (`src/services/supabase.ts:141`) z adapterem `securePinnedFetch` (`src/services/certificatePinning.ts:134`).
2. **Paczka release Android (`npx expo export -p android --no-minify --no-bytecode`)**: 735 modułów (`3.9 MB` JS / `2.6 MB` Hermes `.hbc`). Jedynym aktywnym hostem produkcyjnym jest `https://zxkkowtalnfmdjcmidmp.supabase.co` (oraz fallback `https://placeholder-project.supabase.co` używany wyłącznie przy braku zmiennej `.env`). Pozostałe adresy URL w paczce to komentarze/linki dokumentacyjne bibliotek (`w3.org`, `github.com`, `supabase.com/docs`), nieaktywne w runtime ciągi z zależności oraz adres deweloperski Metro `http://localhost:8081`.
3. **Zależności (`package.json`)**: brak SDK analitycznych, reklamowych, crash-reportingowych, map, płatności i brak `WebView`.

| Połączenie | Domena | Co wysyłamy | Protokół | Uwierzytelnienie | Problem | Decyzja i źródło |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **API aplikacji (PostgREST i RPC)** | `zxkkowtalnfmdjcmidmp.supabase.co` | Zapytania o profil (bez `pesel`), rachunek, historię, RPC: `resolve_login` (`p_login`, `p_password`), `pin_status`, `verify_pin` (`pin`), `set_pin`, `set_daily_limit` (`new_limit`, `p_pin`), `execute_transfer` (dane przelewu, `p_pin`, `p_request_id`), `my_sessions` | HTTPS (TLS 1.2 / 1.3) z SPKI pinningiem | Klucz `apikey` + nagłówek `Authorization: Bearer <JWT>` (RLS + `mfa_satisfied()`) | Przed Z7 `securePinnedFetch` nie blokował przekierowań `3xx` na obce domeny (`redirect: 'follow'`), a na iOS brakowało `NSPinnedDomains` i `NSAllowsArbitraryLoads: false` | Decyzje D2, D3 (`src/services/certificatePinning.ts:148`, `app.json:18`); [MASVS], [ATS] |
| **Logowanie, sesje i 2FA (Supabase Auth)** | `zxkkowtalnfmdjcmidmp.supabase.co` | Rejestracja (`/auth/v1/signup`: `email`, `password`, `user_metadata`), logowanie (`/auth/v1/token`: `email`+`password` lub `refresh_token`), wylogowanie (`/auth/v1/logout?scope=...`), zmiana hasła (`/auth/v1/user`), TOTP (`/auth/v1/factors*`), test TLS (`/auth/v1/health`) | HTTPS (TLS 1.2 / 1.3) z SPKI pinningiem | Klucz `apikey` + `Bearer <JWT>` (dla operacji zalogowanego użytkownika) | Brak zapasowego pinu Root CA `GTS Root R1` obok `GTS Root R4` oraz brak spisanego planu rotacji | Decyzja D1 (`plugins/withNetworkSecurityConfig.js:34`, `src/services/certificatePinning.ts:38`); [ANSC], [ATS] |
| **Analityka i raporty awarii** | brak | Nic — brak SDK (brak Sentry, Firebase, Amplitude, Crashlytics w `package.json`) | — | — | Brak | Brak zbędnych połączeń telemetrycznych; [MASVS] |
| **Moduły SDK w zależnościach (`expo-asset`, `@supabase/supabase-js`)** | `classic-assets.eascdn.net`, `realtime.supabase.com` (wyłącznie nieużywane stałe w kodzie bibliotek) | Nic w runtime: `expo.modules.updates.ENABLED="false"` (`AndroidManifest.xml:18`), wszystkie zasoby lokalne; brak wywołań `supabase.channel()` / `realtime` | — | — | Ciągi URL są obecne w wiązce JS jako martwe ścieżki bibliotek, mogą pojawiać się w audytach statycznych | Zweryfikowano brak wywołań w runtime; odnotować w audycie statycznym paczki (zadanie B) |
| **WebView** | brak | Nic — brak `react-native-webview` i brak użycia komponentu WebView w `src/` | — | — | Brak | Nie dotyczy |
| **Lokalne deep-linki systemowe (`Linking`)** | `otpauth-migration://offline` (Google Authenticator), ustawienia systemu OS | Sekret TOTP i nazwa konta przekazywane lokalnym intentem między aplikacjami na urządzeniu (`TotpSetupModal.tsx:105`); ustawienia aparatu (`TransferModal.tsx:184`) | IPC systemu OS (nie jest ruchem sieciowym HTTP/HTTPS) | — | Brak ruchu sieciowego; po skopiowaniu sekretu schowek czyszczony po 60 s (`secureClipboard.ts`) | Bez zmian sieciowych; zachować czyszczenie schowka (Z5) |

---

## 1.2 Scenariusze

| Scenariusz | Co powinno się stać | Co dzieje się u nas | Jak sprawdziliśmy |
| :--- | :--- | :--- | :--- |
| **Publiczne Wi-Fi z podsłuchem** | Atakujący w tej samej sieci nie widzi treści żądań ani nie podszywa się pod serwer (`MASVS-NETWORK-1`, `MASVS-NETWORK-2`) | Cały ruch idzie przez HTTPS (TLS 1.2/1.3, serwer odrzuca TLS 1.0/1.1), bez `http://` i bez `usesCleartextTraffic` w release; próba podstawienia certyfikatu zrywa handshake | `node scripts/network-audit.mjs --live` (`N1`, `N3`–`N5`, `N10`: TLS 1.0/1.1 odrzucone, TLS 1.2/1.3 aktywne); przegląd `network_security_config.xml` |
| **Proxy z własnym certyfikatem CA** | Aplikacja w buildzie release odrzuca połączenie przez proxy bez zaufanego CA i przerywa transmisję | Na Androidzie `network_security_config.xml` ogranicza zaufanie do `<certificates src="system" />` i weryfikuje `<pin-set>`; na iOS `NSPinnedCAIdentities` w `Info.plist`; w JS `isTlsOrMitmError` mapuje błędy na `SSLHandshakeException` | `scripts/network-audit.mjs` (`N1`, `N2`, `N4`), przycisk „Test MitM” (`certificatePinning.ts:209`), w Z6 test z proxy (do ponownej weryfikacji na APK release w `K2`) |
| **Certyfikat dodany przez użytkownika** | Certyfikat zainstalowany ręcznie w ustawieniach telefonu nie może odszyfrować ruchu aplikacji w release | `network_security_config.xml` nie zawiera `<certificates src="user" />`; iOS ATS ma `NSPinnedDomains` wymagające klucza SPKI Google Trust Services | Przegląd `android/app/src/main/res/xml/network_security_config.xml:4-25` oraz kontrola `N1` w CI |
| **Zapytanie przez `http://`** | Ruch nieszyfrowany jest zablokowany zarówno przez OS, jak i przez klienta HTTP | Android `cleartextTrafficPermitted="false"`, iOS `NSAllowsArbitraryLoads: false`, JS `assertNetworkSecurityPolicy` rzuca `SSLHandshakeException` dla `protocol !== 'https:'`; `usesCleartextTraffic="true"` istnieje wyłącznie w `src/debug/AndroidManifest.xml:6` dla Metro | `scripts/network-audit.mjs` (`N1`, `N3`, `N4`, `N5`, `N8`) oraz przegląd `src/debug/AndroidManifest.xml:6` |
| **Serwer wymienia certyfikat** | Aplikacja nie przestaje działać po rutynowej wymianie certyfikatu liścia dzięki pinom pośrednim/zapasowym | `network_security_config.xml` i `AUTHORIZED_SPKI_PINS` mają piny `WE1` (pośredni), `GTS Root R4` (root) oraz `GTS Root R1` (zapasowy root); iOS `NSPinnedCAIdentities` weryfikuje piny CA (działa bez aktualizacji przy wymianie liścia co ~90 dni) | Pobrano certyfikaty z `pki.goog` (`gtsr1.der`, `gtsr4.der`, `we1.der`) i porównano skróty SPKI SHA-256 (`scripts/network-audit.mjs --live`, `N11`: `B9zUXavotYYIs217h2OZnCqCTp2vB/2pNC1zDijcIAo=`) |
| **Token lub dane w adresie URL** | JWT, `refresh_token`, PIN, hasło i `apikey` nigdy nie pojawiają się w parametrach query URL ([REST-CS]) | Tokeny i `apikey` idą wyłącznie w nagłówkach (`Authorization`, `apikey`), a hasło, PIN i dane przelewu w ciele JSON (`POST`). W Z6 z `HomeScreen` usunięto nawet niepotrzebne pobieranie `request_id` przez `select('*')` | Przegląd wszystkich 19 wywołań w `src/` oraz automatyczna kontrola `N7` (`/[?&](token|access_token|apikey|refresh_token)=/i`) w `scripts/network-audit.mjs` |
| **Przekierowanie na obcą domenę** | Klient HTTP nie podąża za przekierowaniem `3xx` na inny host i nie przesyła tam nagłówków autoryzacji | Przed Z7 `fetch` miał domyślne `redirect: 'follow'`. Po Z7 `securePinnedFetch` wymusza `redirect: 'manual'`, odrzuca `3xx`/`opaqueredirect` wyjątkiem `SSLHandshakeException` i sprawdza `isPinnedHost(url)` | Przegląd `src/services/certificatePinning.ts:73-163` oraz test `N8` w `scripts/network-audit.mjs` |
| **Ruch z SDK i WebView** | Żadna biblioteka nie wysyła ukrytych danych użytkownika ani nie otwiera niezabezpieczonego WebView | Brak SDK analitycznych, reklamowych i brak `WebView`; wyłączony `expo-updates` (`AndroidManifest.xml:18`); jedyny ruch zewnętrzny to `supabase-js` → `securePinnedFetch` | Analiza paczki Android release (`735` modułów, `index-bf47edb25ed599d4fb77e95653135da8.js`) i przegląd `package.json` |

---

## 1.3 Konfiguracja sieci

| Ustawienie | U nas teraz (plik:linia) | Docelowo | Uzasadnienie i źródło |
| :--- | :--- | :--- | :--- |
| **Ruch bez szyfrowania (`http`)** | Android: `cleartextTrafficPermitted="false"` (`network_security_config.xml:4`, `:11`), `debug/AndroidManifest.xml:6` z `usesCleartextTraffic="true"`. iOS przed Z7: brak `NSAppTransportSecurity` w `app.json` (Expo domyślnie wstawiało `NSAllowsArbitraryLoads: true`) | Android bez zmian (HTTP tylko w wariancie `debug` dla Metro). iOS: jawne `NSAllowsArbitraryLoads: false` w `app.json:19` i `plugins/withNetworkSecurityConfig.js:88`. JS: blokada w `assertNetworkSecurityPolicy` (`certificatePinning.ts:82`) | Brak `NSAllowsArbitraryLoads: false` pozwalał na degradację połączeń na iOS [ATS], [MASVS] `MASVS-NETWORK-1` |
| **Zaufane urzędy certyfikacji** | Android: wyłącznie `<certificates src="system" />` (`network_security_config.xml:6`, `:24`). iOS: systemowy magazyn zaufania ograniczony przez `NSPinnedCAIdentities` (`app.json:24`) | Utrzymać zaufanie wyłącznie do certyfikatów systemowych w obu platformach | Uniemożliwia akceptację certyfikatów prywatnych / proxy [ANSC], [ATS] |
| **Certyfikaty dodane przez użytkownika** | Brak `<certificates src="user" />` w `network_security_config.xml` (także w `debug` nie dodano `debug-overrides` dla `user` CA — testy proxy w `debug` korzystają z osobnej weryfikacji lub tymczasowego debug override bez trafiania do `main`) | W `release` bezwzględnie zabronione; na iOS zablokowane przez `NSPinnedDomains` | Zabezpiecza przed atakiem przez instalację certyfikatu CA w profilu urządzenia [ANSC], [MASVS] `MASVS-NETWORK-2` |
| **Pinning — czy i dla których domen** | Android `<pin-set>` dla `supabase.co` (`includeSubdomains="true"`, `network_security_config.xml:11-22`). iOS przed Z7: brak. JS: `isPinnedHost` + `securePinnedFetch` (`certificatePinning.ts:57`, `:129`) | Pinning aktywny dla `supabase.co` (`includeSubdomains=true`) na obu platformach: Android (`<pin-set>`) oraz iOS (`NSPinnedDomains` → `NSPinnedCAIdentities`) | Chroni jedyny backend aplikacji przed podstawieniem certyfikatu przez fałszywe CA [ANSC], [ATS], [MASVS] `MASVS-NETWORK-2` |
| **Zapasowy pin i plan wymiany** | Przed Z7: 3 piny (liść `*.supabase.co`, pośredni `WE1`, root `GTS Root R4`), bez drugiego root CA i bez spisanego planu wymiany | 4 piny SPKI SHA-256 na Androidzie (liść `B9zUXavotYYIs217h2OZnCqCTp2vB/2pNC1zDijcIAo=` do `2027-01-22`, pośredni `WE1` `kIdp6NNEd8wsugYyyIYFsi1ylMCED3hZbSR8ZFsa/A4=` do `2029-02-20`, root `GTS Root R4` `mEflZT5enoR1FuXLgYYGqnVEoZvmf9c2bVBpiOjYQ0c=`, zapasowy root `GTS Root R1` `hxqRlPTu1bMS/0DITB1SSu0vd4u/8l8TjPgfaAp63Gc=`) i 3 piny CA na iOS; `expiration="2027-12-31"`. Plan wymiany: co kwartał weryfikacja `npm run test:network -- --live` przed wygaśnięciem liścia (`2027-01-22`) oraz wymiana `pin-set` w aktualizacji aplikacji min. 30 dni przed `2027-12-31` | Chroni przed odcięciem użytkowników po rotacji certyfikatu serwera [ATS], [ANSC] |
| **Różnice między debug a release** | Android: `src/debug/AndroidManifest.xml:6` ma `usesCleartextTraffic="true"` (Metro), `main/AndroidManifest.xml:17` ma `@xml/network_security_config`, R8 włączone w `gradle.properties:32` (`enableMinifyInReleaseBuilds=true`). iOS: `NSAllowsArbitraryLoads: false` w `app.json:19` | Zachować wyraźny rozdział: `usesCleartextTraffic="true"` wyłącznie w `src/debug/AndroidManifest.xml`, nigdy w `src/main/`; automatyczna blokada w CI (`scripts/network-audit.mjs` kontrola `N3`) | Testowe obejścia dla dev/Metro nie mogą wyciec do buildu produkcyjnego [MASVS] |
| **Logowanie ruchu sieciowego** | Android release: `proguard-rules.pro:17-22` usuwa `android.util.Log`. JS przed Z7: `babel.config.js:6` miał wyjątek `{ exclude: ['info'] }`, a `cameraPermission.ts:14` logował bez `__DEV__`; brak logowania nagłówków/ciał zapytań sieciowych w kodzie | Usunięto wyjątek z `babel.config.js:6` (`transform-remove-console` usuwa wszystkie `console.*` w release) i dodano strażnika `if (__DEV__)` w `cameraPermission.ts:14` | Zapobiega zapisaniu metadanych i logów operacyjnych w `logcat` w wersji release [MASVS], [REST-CS] |
| **Minimalna wersja TLS (serwer, zadanie C)** | Sonda TLS na `zxkkowtalnfmdjcmidmp.supabase.co:443`: `TLSv1` i `TLSv1.1` odrzucane (`ERR_SSL_NO_PROTOCOLS_AVAILABLE`), akceptowane `TLSv1.2` (`ECDHE-ECDSA-AES128-GCM-SHA256`) oraz `TLSv1.3` (`TLS_AES_256_GCM_SHA384`) | Akceptowalne minimum na serwerze (`TLSv1.2` + preferowany `TLSv1.3`); Android API >= 29 domyślnie negocjuje `TLSv1.3`/`1.2`, iOS ATS wymusza minimum `TLSv1.2` | Wycofane wersje TLS 1.0/1.1 są odrzucane po obu stronach połączenia [TLS], RFC 8996 |

---

## 1.4 Decyzje

| Nr | Decyzja | Zmiana w kodzie | Dowód | Źródło |
| :---: | :--- | :--- | :--- | :--- |
| **1** | Dodać zapasowy pin głównego urzędu `GTS Root R1` oraz plan rotacji certyfikatów przed `2027-01-22` i `2027-12-31`. | `plugins/withNetworkSecurityConfig.js:35`, `android/app/src/main/res/xml/network_security_config.xml:20`, `src/services/certificatePinning.ts:38` | Pobrano `gtsr1.der`, `gtsr4.der`, `we1.der` z `pki.goog` i zweryfikowano skróty SPKI SHA-256; test `N2`, `N11` w `scripts/network-audit.mjs --live` (`PASS`) | [ANSC], [ATS], przykład 4 (slajd 10) |
| **2** | Włączyć natywny pinning iOS (`NSPinnedDomains` → `NSPinnedCAIdentities`) i wyłączyć `NSAllowsArbitraryLoads` w `Info.plist`. | `app.json:18-37`, `plugins/withNetworkSecurityConfig.js:87-105` | Introspekcja prebuild iOS (`compileModsAsync`): `NSAllowsArbitraryLoads: false`, 3 piny CA dla `supabase.co`; test `N4` (`PASS`) | [ATS], przykład 4 (slajd 10) |
| **3** | Zablokować automatyczne podążanie za przekierowaniami HTTP `3xx` i wymusić sprawdzenie domeny docelowej w kliencie `fetch`. | `src/services/certificatePinning.ts:144-160` (`redirect: 'manual'`, odrzucenie `3xx`/`opaqueredirect`, walidacja `response.url`) | Test `N8` w `scripts/network-audit.mjs` (`PASS`); przegląd `certificatePinning.ts` | [MASVS] `MASVS-NETWORK-1`, scenariusz ze slajdu 5 |
| **4** | Usunąć wyjątek `exclude: ['info']` w `babel.config.js` i osłonić `console.info` warunkiem `__DEV__`. | `babel.config.js:6`, `src/services/cameraPermission.ts:14` | Test `N9` w `scripts/network-audit.mjs` (`PASS`) | [MASVS], przykład 3 (slajd 9) |
| **5** | Dodać automatyczną kontrolę w CI (`npm run test:network` + GitHub Actions) blokującą niebezpieczną konfigurację sieciową przed mergem/wydaniem. | `scripts/network-audit.mjs`, `package.json:12`, `.github/workflows/network-security.yml` | Wynik uruchomienia `node scripts/network-audit.mjs --live`: `11/11 PASS` (`N1`–`N11`) | Praca w domu zadanie `D` (slajd 11) |
| **6** | Rozdział debug/release na Androidzie pozostaje izolowany (`usesCleartextTraffic="true"` tylko w `src/debug/AndroidManifest.xml`, nigdy w `src/main/`). | Zweryfikowano `android/app/src/main/AndroidManifest.xml:17` i `android/app/src/debug/AndroidManifest.xml:6` po `expo prebuild` | Test `N3` w `scripts/network-audit.mjs` (`PASS`) | [ANSC], przykład 1 (slajd 7) |

### Wynik automatycznego audytu sieciowego (`node scripts/network-audit.mjs --live`)

| ID | Kontrola | Wynik | Szczegóły |
| :---: | :--- | :---: | :--- |
| `N1` | Android NSC (`cleartextTrafficPermitted="false"`, brak `user` CA) | **PASS** | `cleartextTrafficPermitted=false`, tylko `system` CA |
| `N2` | Android SPKI `pin-set` z pinem zapasowym i ważnym terminem | **PASS** | `4` piny (liść, `WE1`, `GTS Root R4`, `GTS Root R1`), wygasa `2027-12-31` |
| `N3` | `AndroidManifest.xml` (release) bez `usesCleartextTraffic` i z `allowBackup=false` | **PASS** | `networkSecurityConfig` i `allowBackup=false` obecne |
| `N4` | iOS `Info.plist` ATS (`NSAllowsArbitraryLoads=false` + `NSPinnedDomains`) | **PASS** | `NSAllowsArbitraryLoads=false`, `3` piny CA dla `supabase.co` |
| `N5` | Brak niezaszyfrowanych adresów `http://` w `src/` i `App.tsx` | **PASS** | `0` trafień |
| `N6` | Brak wyłączenia weryfikacji certyfikatów TLS w kodzie | **PASS** | `0` trafień |
| `N7` | Brak tokenów i kluczy w parametrach query URL | **PASS** | `0` trafień |
| `N8` | `securePinnedFetch` wymusza HTTPS, przypięty host i `redirect: 'manual'` | **PASS** | `redirect=manual` + `isPinnedHost` aktywne |
| `N9` | Pełne usuwanie logów JS (`transform-remove-console`) i natywnych (`ProGuard`) | **PASS** | Brak wyjątku `exclude` w `babel.config.js` |
| `N10` | Serwer odrzuca TLS 1.0/1.1 i obsługuje TLS 1.2/1.3 | **PASS** | `TLS1.0=false`, `TLS1.1=false`, `TLS1.2=true`, `TLS1.3=true` |
| `N11` | Certyfikat serwera na żywo pasuje do pinu SPKI w `network_security_config.xml` | **PASS** | `B9zUXavotYYIs217h2OZnCqCTp2vB/2pNC1zDijcIAo=` |
