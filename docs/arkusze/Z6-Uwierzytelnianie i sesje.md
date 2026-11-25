# Arkusz sekcji – „Jak to dotyczy naszej aplikacji?”

## Nagłówek

| Pole | Wartość |
| :--- | :--- |
| **Sekcja / aplikacja** | SecureBank |
| **Technologia** | React Native (Expo SDK 58 / TypeScript), Supabase |
| **Zajęcia nr** | 6 |
| **Temat zajęć** | Uwierzytelnianie i sesje |
| **Obszar MASVS** | MASVS-AUTH, MASVS-STORAGE |
| **Osoby obecne** | Jakub Dziewior, Jakub Wodyk |
| **Dokument zajęć** | [`docs/raport-sesje.md`](../raport-sesje.md) |

---

## 0. Status z poprzedniego tygodnia

| Zadanie z poprzednich zajęć | Status | Dowód |
| :--- | :---: | :--- |
| **K1 · Przypinanie certyfikatów SSL/TLS** (Jakub Dziewior) | zrobione | Commit `9b58998`: przypięte skróty SPKI SHA-256 dla `*.supabase.co` w `plugins/withNetworkSecurityConfig.js` i weryfikacja kanału w `src/services/certificatePinning.ts:152` (`verifySupabaseTlsChannel`, `/auth/v1/health`). |
| **K2 · Network Security Config dla Androida** (Jakub Dziewior) | zrobione | Commit `9b58998`: `cleartextTrafficPermitted="false"`, zaufanie wyłącznie do `<certificates src="system" />`, bez certyfikatów użytkownika. Import pluginu poprawiony na `expo/config-plugins`, więc `expo start` i `expo prebuild` wczytują konfigurację bez błędu. |
| **K3 · Test odporności na MitM** (Jakub Wodyk) | częściowo | W aplikacji jest symulacja przechwycenia (`src/services/certificatePinning.ts:209`, przycisk „Test MitM” w ustawieniach). Test z działającym proxy (mitmproxy / Burp) na urządzeniu nie został jeszcze udokumentowany i przechodzi na zajęcia 7. |
| **K4 · Ochrona przed powtórzeniem przelewu** (Jakub Wodyk) | zrobione | Przelew ma klucz idempotencji `request_id` z unikalnym indeksem (`supabase/schema.sql:394`), generowany w `src/components/TransferModal.tsx:86`; powtórzenie zlecenia zwraca wynik pierwszego wykonania. Nagłówków z podpisem czasu nie dodawaliśmy: ich rolę pełnią TLS z przypinaniem i JWT z `exp`. Szczegóły: decyzja 3 w raporcie. |
| **Demonstracja komunikacji sieciowej** (Jakub Dziewior, Jakub Wodyk) | do wykonania | Przenosimy na zajęcia 7 razem z testem MitM na urządzeniu. |

---

## 1. Logowanie i sesja

Pełna treść jest w [`docs/raport-sesje.md`](../raport-sesje.md):

* **1.1:** diagram sekwencji i tabela elementów sesji.
* **1.2:** scenariusze z porównaniem „przed” i „po Z6”.
* **1.3:** polityka sesji z konkretnymi wartościami.
* **1.4:** dziesięć decyzji z dowodami i źródłami.

Najważniejsze ustalenia:

| Problem wykryty w 1.1–1.3 | Decyzja (1.4) | Dowód |
| :--- | :--- | :--- |
| Token dostępu działał do godziny po wylogowaniu, zmianie hasła i odwołaniu sesji | Decyzja 1: `session_active()` sprawdza `session_id` z JWT w `auth.sessions` przy każdym zapytaniu i RPC | `supabase/schema.sql:170`; testy `D1`–`D3` |
| Przelew i podwyższenie limitu bez dodatkowego uwierzytelnienia | Decyzja 2: PIN weryfikowany na serwerze w tej samej transakcji | `supabase/schema.sql:352`, `:397`; test `R1` |
| Zalogowany klient mógł sam utworzyć rachunek z dowolnym saldem i dopisywać przelewy | Decyzja 7: zapisy tylko przez trigger i `execute_transfer` | `supabase/schema.sql:382`, `:545`; testy `T1`, `T2` |
| Anonimowe pobranie e-maila po numerze klienta i brak limitu prób logowania na konto | Decyzja 5: `resolve_login`, 5 prób i blokada 15 min | `supabase/schema.sql:558`; testy `L1`, `L2` |
| Brak blokady przy bezczynności na pierwszym planie | Decyzja 4: blokada PIN-em po 5 min | `src/services/activity.ts:1`, `App.tsx:211` |
| Użytkownik nie widzi swoich sesji i nie może zakończyć sesji zgubionego telefonu | Decyzja 6: lista sesji, „Wyloguj pozostałe urządzenia”, „Wyloguj wszędzie” | `supabase/schema.sql:629`; test `C1` |

---

## 2. Praca w domu do zajęć 7

| Zadanie | Kto | Status | Dowód / sposób sprawdzenia |
| :--- | :---: | :---: | :--- |
| **K1 · Poprawki sesji** (decyzje z 1.4) | Jakub Dziewior, Jakub Wodyk | zrobione w kodzie, opisane w commicie | Decyzje 1–7 wdrożone w aplikacji i w `supabase/schema.sql`. Zmiany bazy do wgrania jednym plikiem: `supabase/migrations/z6_sesje.sql`. Decyzje 8–9 to świadome „nie wdrażamy”, decyzja 10 to ustawienia panelu Supabase. |
| **K2 · Scenariusze ponownie** (z 1.2) | Jakub Dziewior, Jakub Wodyk | czeka na migrację Z6 w Supabase | `npm run test:sessions` (`scripts/session-check.mjs`) sprawdza 15 przypadków na prawdziwym serwerze. Sonda API potwierdziła, że migracja nie została jeszcze wgrana (`lookup_email_by_client_number` zwraca HTTP 200, `my_sessions` zwraca HTTP 404). |
| **K3 · Polityka i przygotowanie** (z 1.3) | Jakub Dziewior, Jakub Wodyk | zrobione w kodzie, czeka na panel Supabase | Wartości z 1.3 ustawione w kodzie; lista endpointów i przegląd danych wychodzących uzupełnione w `docs/raport-sesje.md`. W panelu Supabase nadal `mailer_autoconfirm: true` (sprawdzone przez `GET /auth/v1/settings`). |
| **A · Ponowne użycie tokenu** (dla chętnych) | Jakub Wodyk | zrobione, do potwierdzenia testem | Rotacja i wykrywanie ponownego użycia w Supabase; dzięki decyzji 1 odwołana sesja traci także dostęp przez JWT. Testy `A1`–`A3`. |
| **B · Biometria z kluczem** (dla chętnych) | — | nie dotyczy | Aplikacja nie używa biometrii (decyzja z Z4). PIN odszyfrowuje klucz danych sesji (`src/services/pin.ts:146`), więc nie jest wartością `true/false`. Decyzja 8. |
| **C · Wyloguj wszędzie** (dla chętnych) | Jakub Wodyk | zrobione, do potwierdzenia testem | Ustawienia → „Sesje i urządzenia”: lista sesji, „Wyloguj pozostałe urządzenia” (`scope=others`) i „Wyloguj wszędzie” (`scope=global` + wyczyszczenie telefonu). Test `C1`. |
| **D · Stary token po wylogowaniu** (dla chętnych) | Jakub Wodyk | zrobione, do potwierdzenia testem | Przed Z6 stary JWT dawał dostęp do danych do `exp`; po Z6 `session_active()` odcina go natychmiast. Testy `D1`–`D3`. |

---

## 3. Plan do zajęć 7 (Komunikacja sieciowa)

| Zadanie | Kto | Termin | Sposób sprawdzenia |
| :--- | :---: | :---: | :--- |
| **Wgranie migracji Z6 i uruchomienie testów sesji** | Jakub Dziewior, Jakub Wodyk | przed zajęciami 7 (wymaga panelu Supabase) | `supabase/migrations/z6_sesje.sql` w SQL Editorze, potem `npm run test:sessions`; wyniki wpisane do raportu (15/15 PASS albo opisane odstępstwa). |
| **Test MitM z proxy na urządzeniu** | Jakub Wodyk | zajęcia 7 | mitmproxy lub Burp z zainstalowanym certyfikatem użytkownika; połączenie z Supabase zerwane przez przypinanie i Network Security Config; zrzuty z logów proxy bez JWT i danych przelewów. |
| **Przegląd tego, co aplikacja wysyła do sieci** | Jakub Dziewior | zrobione (`docs/raport-sesje.md`) | Pełna tabela dla wszystkich 19 endpointów z listy w `docs/raport-sesje.md`; w kodzie wymuszono sprawdzanie `isPinnedHost` w `assertNetworkSecurityPolicy` (`src/services/certificatePinning.ts`) oraz jawną listę kolumn zamiast `select('*')` w `src/screens/HomeScreen.tsx`. |
| **Ustawienia panelu Supabase z 1.3** | Jakub Dziewior | przed zajęciami 7 (wymaga panelu Supabase) | Włączone potwierdzanie e-maila (`GET /auth/v1/settings` na 25.11 zwraca jeszcze `mailer_autoconfirm: true`, docelowo `false`); wykrywanie ponownego użycia tokenu pozostaje włączone. |
