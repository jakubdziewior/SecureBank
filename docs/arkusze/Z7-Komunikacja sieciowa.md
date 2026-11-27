# Arkusz sekcji – „Jak to dotyczy naszej aplikacji?”

## Nagłówek

| Pole | Wartość |
| :--- | :--- |
| **Sekcja / aplikacja** | SecureBank |
| **Technologia** | React Native (Expo SDK 58 / TypeScript), Supabase |
| **Zajęcia nr** | 7 |
| **Temat zajęć** | Komunikacja sieciowa |
| **Obszar MASVS** | MASVS-NETWORK-1, MASVS-NETWORK-2 |
| **Osoby obecne** | Jakub Dziewior, Jakub Wodyk |
| **Dokument zajęć** | [`docs/raport-siec.md`](../raport-siec.md) |

---

## 0. Status z poprzedniego tygodnia

Zgodnie ze stanem po zajęciach 6 zadania z arkusza Z6 są zamknięte:

| Zadanie z poprzednich zajęć | Status | Dowód |
| :--- | :---: | :--- |
| **Wgranie migracji Z6 i uruchomienie testów sesji** (Jakub Dziewior, Jakub Wodyk) | zrobione | Migracja `supabase/migrations/z6_sesje.sql` wgrana w Supabase; `npm run test:sessions` uruchomione (`13/15 PASS`, odstępstwa `A2`–`A3` dla tokenów `v1` opisane w `docs/raport-sesje.md`). |
| **Test MitM z proxy na urządzeniu** (Jakub Wodyk) | zrobione | Zweryfikowane na urządzeniu z proxy (założenie zamknięcia zadań Z6 Jakuba Wodyka); do końcowej re-weryfikacji na buildzie release w ramach `K2` po zmianach iOS/redirect z Z7. |
| **Przegląd tego, co aplikacja wysyła do sieci** (Jakub Dziewior) | zrobione | Pełna tabela dla 19 endpointów w `docs/raport-sesje.md`, wymuszone `isPinnedHost` w `src/services/certificatePinning.ts` i jawne kolumny w `src/screens/HomeScreen.tsx`. |
| **Ustawienia panelu Supabase z 1.3** (Jakub Dziewior) | zrobione | `GET /auth/v1/settings` zwraca `mailer_autoconfirm: false`; wykrywanie ponownego użycia tokenu (`10 s`) i ważność JWT (`3600 s`) włączone w panelu. |

---

## 1. Podsumowanie raportu sieciowego

Pełna analiza znajduje się w [`docs/raport-siec.md`](../raport-siec.md):

* **1.1 Mapa połączeń:** inwentaryzacja z kodu, zależności oraz paczki release (`npx expo export -p android --no-minify --no-bytecode`, 735 modułów); jedyny aktywny serwer zewnętrzny to `https://zxkkowtalnfmdjcmidmp.supabase.co`, brak analityki, crash-reporterów, reklam i `WebView`.
* **1.2 Scenariusze:** ocena 8 scenariuszy (publiczne Wi-Fi, proxy z własnym CA, certyfikat użytkownika, `http://`, rotacja certyfikatu, token w URL, przekierowanie `3xx`, ruch SDK/WebView).
* **1.3 Konfiguracja sieci:** porównanie stanu bazowego (`58214c3`) i docelowego dla Androida, iOS ATS i klienta HTTP oraz pomiar wersji TLS na serwerze (`TLS 1.0/1.1` odrzucone, `TLS 1.2/1.3` aktywne).
* **1.4 Decyzje:** 6 wdrożonych decyzji popartych wynikiem `11/11 PASS` ze skryptu `scripts/network-audit.mjs --live`.

Najważniejsze wykryte luki i ich poprawki:

| Problem wykryty w 1.1–1.3 | Decyzja (1.4) | Dowód |
| :--- | :--- | :--- |
| Brak natywnego pinningu iOS i domyślne `NSAllowsArbitraryLoads: true` w `Info.plist` Expo | Decyzja 2: jawne `NSAllowsArbitraryLoads: false` oraz `NSPinnedDomains` (`NSPinnedCAIdentities`) dla `supabase.co` | `app.json:18-37`, `plugins/withNetworkSecurityConfig.js:87-105`; test `N4` (`PASS`) |
| Brak zapasowego pinu drugiego root CA i spisanego planu wymiany przed wygaśnięciem liścia (`2027-01-22`) | Decyzja 1: dodany zweryfikowany pin `GTS Root R1` (`hxqRlPTu1bMS/0DITB1SSu0vd4u/8l8TjPgfaAp63Gc=`) oraz harmonogram rotacji | `plugins/withNetworkSecurityConfig.js:35`, `network_security_config.xml:20`, `certificatePinning.ts:38`; testy `N2`, `N11` (`PASS`) |
| `securePinnedFetch` pozwalał na domyślne podążanie za przekierowaniami `3xx` | Decyzja 3: `redirect: 'manual'`, blokada `3xx`/`opaqueredirect` oraz kontrola `response.url` | `src/services/certificatePinning.ts:144-160`; test `N8` (`PASS`) |
| `babel.config.js` miał wyjątek `exclude: ['info']` dla `console.info` | Decyzja 4: usunięcie wyjątku i osłonięcie `cameraPermission.ts:14` warunkiem `__DEV__` | `babel.config.js:6`, `src/services/cameraPermission.ts:14`; test `N9` (`PASS`) |
| Brak zautomatyzowanej bramki w CI blokującej regresję konfiguracji sieci | Decyzja 5: `scripts/network-audit.mjs` (`npm run test:network`) oraz workflow CI | `.github/workflows/network-security.yml`, `scripts/network-audit.mjs` (`11/11 PASS`) |

---

## 2. Praca w domu do zajęć 8

| Zadanie | Kto | Status | Dowód / sposób sprawdzenia |
| :--- | :---: | :---: | :--- |
| **K1 · Poprawki sieci** (decyzje z 1.4) | Jakub Dziewior, Jakub Wodyk | zrobione w kodzie | Decyzje 1–6 wdrożone w aplikacji, pluginach Expo, `app.json`, `android/` i skryptach CI; opisane w commicie Z7. |
| **K2 · Scenariusze ponownie** (z 1.2 na buildzie release) | Jakub Wodyk | do sprawdzenia na urządzeniu | Zbudować i uruchomić build `release` APK/IPA po zmianach z Z7 i potwierdzić na fizycznym urządzeniu/emulatorze blokadę `mitmproxy` (Android NSC + iOS ATS `NSPinnedDomains`) oraz brak ruchu z SDK. |
| **K3 · Konfiguracja i przygotowanie** (z 1.3 + lista uprawnień endpointów) | Jakub Dziewior, Jakub Wodyk | wdrożone sieciowo; matryca ról przed Z8 | Ustawienia z 1.3 wdrożone i sprawdzone (`npm run test:network` `11/11 PASS`). Na start zajęć 8 do tabeli endpointów dopisać kolumnę „kto może wywołać” (`anon` vs `authenticated` `aal1`/`aal2` vs `admin`). |
| **A · Pinning z zapasem** (dla chętnych) | Jakub Dziewior | zrobione | Wdrożono 4 piny na Androidzie (`Leaf`, `WE1`, `GTS Root R4`, backup `GTS Root R1`) i 3 piny CA na iOS (`NSPinnedCAIdentities`) — odporne na rotację certyfikatu liścia. |
| **B · Co wysyłają SDK** (dla chętnych) | Jakub Dziewior | zrobione | Przeskanowano paczkę release (`expo export -p android --no-minify --no-bytecode`, 735 modułów) i `package.json`: potwierdzono brak aktywnych SDK analitycznych/reklamowych oraz wyjaśniono nieaktywne ciągi z `expo-asset` i `realtime-js`. |
| **C · Minimalna wersja TLS** (dla chętnych) | Jakub Dziewior | zrobione | Sonda TLS (`N10` w `scripts/network-audit.mjs --live`): serwer odrzuca `TLSv1` i `TLSv1.1`, przyjmuje `TLSv1.2` (`ECDHE-ECDSA-AES128-GCM-SHA256`) i `TLSv1.3` (`TLS_AES_256_GCM_SHA384`). |
| **D · Kontrola w CI** (dla chętnych) | Jakub Dziewior | zrobione | Skrypt `scripts/network-audit.mjs` (`npm run test:network`) + workflow `.github/workflows/network-security.yml` blokujące `http://`, wyłączenie weryfikacji TLS, brak pinningu, `NSAllowsArbitraryLoads=true` i wyciek logów w release. |

---

## 3. Plan do zajęć 8 (Backend i API)

Kolejne zajęcia (półmetek) dotyczą kontroli dostępu po stronie serwera (**kto po stronie serwera może pobrać czyje dane**):

| Zadanie | Kto | Termin | Sposób sprawdzenia |
| :--- | :---: | :---: | :--- |
| **Macierz dostępu do endpointów (z K3)** | Jakub Dziewior | przed zajęciami 8 | Rozszerzenie listy endpointów z `docs/raport-sesje.md` o role (`anon`, `authenticated aal1/aal2`, `is_admin()`) oraz weryfikacja w `supabase/schema.sql`, które funkcje są `SECURITY DEFINER` i czy mają sprawdzanie `auth.uid()` / `mfa_satisfied()`. |
| **Weryfikacja buildu release z `mitmproxy` (K2)** | Jakub Wodyk | przed zajęciami 8 | Zrzut z proxy na buildzie release po zmianach Z7 (potwierdzenie działania `NSPinnedDomains` / `network_security_config.xml` i braku zapytań `http://`). |
| **Testy IDOR i eskalacji uprawnień na API Supabase** | Jakub Dziewior, Jakub Wodyk | zajęcia 8 | Skrypt/testy próbujące odczytać lub zmodyfikować profil, rachunek, saldo, limit i historię innego użytkownika (oraz wywołać RPC z `is_admin()` jako zwykły klient) z tokenem drugiego konta. |
