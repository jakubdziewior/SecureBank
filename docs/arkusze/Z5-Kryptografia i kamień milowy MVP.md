# Arkusz sekcji – „Jak to dotyczy naszej aplikacji?”

## Nagłówek

| Pole | Wartość |
| :--- | :--- |
| **Sekcja / aplikacja** | SecureBank |
| **Technologia** | React Native (Expo SDK 58 / TypeScript) |
| **Zajęcia nr** | 5 |
| **Temat zajęć** | Kryptografia i kamień milowy MVP |
| **Obszar MASVS** | MASVS-CRYPTO, MASVS-AUTH, MASVS-STORAGE |
| **Osoby obecne** | Jakub Dziewior, Jakub Wodyk |

---

## 0. Status z poprzedniego tygodnia

| Zadanie z poprzednich zajęć | Status | Dowód |
| :--- | :---: | :--- |
| **K1 · Migracja sekretów według D3** (Jakub Dziewior) | zrobione | W `src/services/supabase.ts:100` adapter `SecureStoreAdapter` wstrzymuje zapis sesji na dysk do momentu konfiguracji PIN-u (`pendingValues.set(key, value)` trzyma tokeny wyłącznie w pamięci RAM). W `src/screens/HomeScreen.tsx:52` zapytanie o profil ogranicza pobierane kolumny do `id, first_name, last_name, role, client_number, is_blocked, two_factor_enabled, created_at`, całkowicie eliminując pole `pesel` z transmisji sieciowej, pamięci i stanu ekranu. |
| **K2 · Zamknięcie kanałów: kopia zapasowa i cache HTTP** (Jakub Dziewior) | zrobione | W `src/services/supabase.ts:130` zdefiniowano `secureFetch` i globalne nagłówki `'Cache-Control': 'no-store'` oraz `'Pragma': 'no-cache'`, co wymusza na silnikach OkHttp (Android) i `NSURLSession` (iOS) pomijanie zapisu odpowiedzi PostgREST w `cache/http-cache` i `Cache.db`. W `app.json:35` potwierdzono `allowBackup: false` oraz reguły ekstrakcji `expo-secure-store` wykluczające `SecureStore.xml` z kopii zapasowych ADB i transferu D2D. |
| **K2 · Zamknięcie kanałów: zrzuty ekranu, schowek, logi** (Jakub Wodyk) | zrobione | Zabezpieczenie ekranów wrażliwych (`FLAG_SECURE` / zasłona w przełączniku zadań), wyłączenie automatycznego kopiowania sekretu TOTP w `TotpSetupModal.tsx`, czyszczenie schowka po 60 sekundach oraz brak logowania obiektów sesji i JWT w logcat release. |
| **K3 · Wylogowanie i reinstalacja według D5** (Jakub Wodyk) | zrobione | Procedura pełnego wylogowania czyści skarbiec PIN, licznik prób i unieważnia refresh token; wykrywanie reinstalacji na iOS uniemożliwia przywrócenie starej sesji z Keychain. |
| **Kamień milowy MVP** (Jakub Dziewior, Jakub Wodyk) | zrobione | Przygotowanie 5-minutowego scenariusza demonstracyjnego: rejestracja z danymi osobowymi i generowaniem numeru klienta/rachunku IBAN, logowanie hasłem z opcją 2FA, konfiguracja PIN-u, odblokowanie ekranu głównego, zlecenie przelewu (skaner QR i formularz ręczny), wejście do ustawień profilu oraz blokada i wylogowanie. |

---

## 1. Kryptografia w aplikacji

### 1.1. Tabela kryptografii w aplikacji

| Miejsce w aplikacji | Zadanie | Co jest teraz (plik:linia) | Klucz: skąd i gdzie | Problem | Decyzja i źródło |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Szyfrowanie sesji na urządzeniu** | Poufność | `src/services/pin.ts:192` (`encryptWithSessionKey`) i `src/services/supabase.ts:100` — AES-256-GCM (`@noble/ciphers/aes.js`) z prefiksem `enc1:` | 256-bitowy losowy klucz danych generowany w RAM (`Crypto.getRandomBytes(32)`); na dysku tylko w postaci zaszyfrowanej kluczem PIN-u w `securebank.pin_vault` | Przed Z4 istniało ryzyko zapisu nieszyfrowanej sesji w oknie przed utworzeniem PIN-u | **AES-256-GCM** z losowym 12-bajtowym nonce dla każdego szyfrowania; klucz tylko w RAM; sesja przed PIN-em wyłącznie w RAM (`pendingValues`). Źródło: OWASP MASTG-CRYPTO-1, NIST SP 800-38D |
| **Wyprowadzenie klucza z PIN-u (KDF)** | Ochrona haseł / KDF | `src/services/pin.ts:69` (`deriveKey`) — PBKDF2-SHA256 (`@noble/hashes/pbkdf2.js`), 20 000 iteracji, wyjście 32 bajty | 6-cyfrowy PIN wprowadzany przez użytkownika na dedykowanej klawiaturze `PinPad`; sól 16 bajtów losowana z CSPRNG (`pin.ts:112`) | 6-cyfrowy PIN ma 10⁶ kombinacji (podatność na atak brute-force offline przy wycieku skarbca) | **PBKDF2-SHA256** z solą 16 bajtów i 20 000 iteracji; skarbiec chroniony dodatkowo sprzętowym Keystore / Keychain (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`) oraz sprzętowym licznikiem prób (max 5). Źródło: OWASP MASTG-CRYPTO-2, NIST SP 800-132 |
| **Magazyn kluczy i skarbca** | Poufność i integralność | `src/services/supabase.ts:14`, `src/services/pin.ts:16` — `expo-secure-store` | Sprzętowy klucz z Android Keystore (AES-GCM w TEE/StrongBox); iOS Keychain z atrybutem `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` | Brak bezpośredniego wsparcia dla flagi StrongBox w wysokopoziomowym API Expo | Wykorzystanie `expo-secure-store` jako warstwy nadrzędnej podwójnego szyfrowania (klucz sprzętowy + klucz z PIN-u użytkownika). Źródło: OWASP MASVS-STORAGE-1, dokumentacja Android Keystore |
| **Weryfikacja PIN-u na serwerze** | Ochrona haseł | `supabase/schema.sql:167` (`verify_pin`), `supabase/schema.sql:216` (`set_pin`) — funkcja `extensions.crypt` (bcrypt z kosztem 10) | PIN przesyłany szyfrowanym kanałem TLS 1.3 w wywołaniu RPC; po stronie PostgreSQL skrót bcrypt z solą w tabeli `user_pins` | Zwykłe funkcje skrótu (MD5, SHA-256) są podatne na tęczowe tablice i cracking GPU | **bcrypt** z kosztem 10 (`gen_salt('bf', 10)`); tabela `user_pins` niedostępna przez standardowe API PostgREST (`REVOKE ALL`). Źródło: OWASP ASVS v4.0 (Rozdział 2), MASVS-CRYPTO-1 |
| **Drugi składnik logowania (2FA)** | Autentyczność | `src/services/mfa.ts:25`, `supabase/schema.sql:100` (`mfa_satisfied`) — algorytm TOTP (RFC 6238) | Kryptograficzny sekret Base32 generowany po stronie serwera; aplikacja Google Authenticator generuje 6-cyfrowe kody w 30-sekundowych oknach | Ryzyko przechwycenia sekretu ze schowka systemowego podczas parowania aplikacji | **TOTP HMAC-SHA1** wg RFC 6238; usunięcie automatycznego kopiowania sekretu, czyszczenie schowka po 60 sekundach. Źródło: RFC 6238, OWASP MASVS-AUTH-1 |
| **Generowanie liczb losowych** | Losowość | `src/services/pin.ts:112`, `pin.ts:132`, `pin.ts:194` — `Crypto.getRandomBytes` (`expo-crypto`) | Entropia kryptograficzna dostarczana przez jądro systemu operacyjnego (`/dev/urandom` na Androidzie, `SecRandomCopyBytes` na iOS) | Zastosowanie pseudolosowego generatora `Math.random()` w kryptografii unieważnia bezpieczeństwo szyfrowania | Wyłącznie kryptograficzny generator liczb losowych **`Crypto.getRandomBytes`** dla soli KDF (16 B), nonce AES-GCM (12 B) i klucza danych sesji (32 B). Źródło: OWASP MASVS-CRYPTO-2 |
| **Skaner kodów QR przelewów** | Integralność | `src/services/transferQr.ts:18` (`parseTransferQr`), `src/components/TransferModal.tsx` — walidacja sumy kontrolnej NRB wg ISO 7064 | Brak klucza kryptograficznego w standardzie kodów QR faktur bankowych ZBP | Brak podpisu cyfrowego wystawcy faktury w formacie ZBP | Weryfikacja integralności i sumy kontrolnej numeru rachunku algorytmem **ISO 7064 MOD 97-10**; wymóg potwierdzenia danych przelewu na ekranie przez użytkownika. Źródło: Rekomendacja Rady Bankowości Elektronicznej ZBP |
| **Bezpieczeństwo sesji i zmiana hasła** | Integralność i uwierzytelnienie | `src/components/SettingsModal.tsx` — re-autentykacja obecnym hasłem przed zmianą; `signOut({ scope: 'others' })` | Klucze sesji Supabase Auth w kanale TLS 1.3 | Możliwość przejęcia konta i zmiany hasła przez nieuprawniony podgląd aktywnej sesji | Wymóg podania obecnego hasła (`signInWithPassword`) przed wywołaniem `updateUser({ password })`; unieważnienie tokenów na pozostałych urządzeniach. Źródło: OWASP MASVS-AUTH-2 |

---

### 1.2. Kategorie błędów (OWASP Mobile Top 10 · M10)

| Kategoria błędu | Wynik audytu | Jak szukaliśmy i metoda weryfikacji |
| :--- | :---: | :--- |
| **Klucz w kodzie** | Sprawdzone, brak | Przeszukano całe drzewo źródeł `src/` pod kątem literałów kluczy (`Select-String` dla wzorców `key`, `secret`, `private`, `BEGIN RSA`, stałych szesnastkowych 32-bajtowych). Wszystkie klucze są generowane dynamicznie w Keystore/Keychain lub losowane w RAM przez CSPRNG. |
| **Przestarzały algorytm lub tryb** | Sprawdzone, brak | Weryfikacja importów kryptograficznych: używany jest wyłącznie `@noble/ciphers/aes.js` w trybie uwierzytelnionym `gcm`. Brak wystąpień trybów ECB, CBC bez HMAC, algorytmów DES, 3DES, RC4 czy funkcji skrótu MD5 i SHA-1 do celów szyfrowania danych. |
| **Przewidywalna losowość** | Sprawdzone, brak w kryptografii | Przeszukano kod pod kątem `Math.random()`. W operacjach kryptograficznych (`pin.ts`) używany jest wyłącznie `Crypto.getRandomBytes()`. Wystąpienia `Math.random()` w `LoginScreen.tsx` służą wyłącznie do generowania demonstracyjnego numeru klienta i rachunku podczas rejestracji mockowej. |
| **Powtarzane wartości jednorazowe** | Sprawdzone, brak | W `src/services/pin.ts:113` oraz `pin.ts:194` każde wywołanie `encryptWithSessionKey` oraz `writeVault` generuje świeży, 12-bajtowy wektor `nonce = Crypto.getRandomBytes(12)`. Wartość nonce jest dołączana do szyfrogramu jawnym tekstem i nigdy nie jest używana powtórnie. |
| **Hasło jako zwykły skrót** | Sprawdzone, brak | W bazie danych `supabase/schema.sql:180,217` weryfikacja i zapis PIN-u realizowane są za pomocą `extensions.crypt(pin, gen_salt('bf', 10))` z algorytmem bcrypt (wolna funkcja z solą i kosztem 10), uniemożliwiająca ataki tablicami tęczowymi. |
| **Szyfrowanie bez integralności** | Sprawdzone, brak | W `src/services/pin.ts:115,195` szyfrowanie klucza i sesji odbywa się w trybie **AES-256-GCM** (Galois/Counter Mode), który generuje 16-bajtowy tag uwierzytelniający (AEAD). Jakakolwiek modyfikacja szyfrogramu powoduje błąd dekrypcji i odrzucenie danych. |

---

### 1.3. Uzasadnienie decyzji projektowych

Dla każdej decyzji kryptograficznej udzielono odpowiedzi na 6 pytań standardu:

#### Decyzja 1: Szyfrowanie sesji Supabase za pomocą AES-256-GCM z kluczem w RAM
1. **Jakie zadanie:** Poufność i integralność tokenów autoryzacyjnych na dysku urządzenia.
2. **Czy wybór jest dziś zalecany:** Tak, AES-GCM (NIST SP 800-38D) jest rekomendowany przez OWASP MASTG i BSI jako bezpieczny standard szyfrowania uwierzytelnionego.
3. **Skąd klucz, gdzie leży, kto go używa:** 256-bitowy losowy klucz danych generowany w RAM przy tworzeniu/odblokowaniu PIN-u; na dysku występuje tylko w postaci zaszyfrowanej kluczem KDF w `SecureStore.xml`; używa go wyłącznie adapter sesji aplikacji.
4. **Czy wartości jednorazowe się nie powtarzają:** Tak, przy każdym zapisie generowany jest świeży 12-bajtowy nonce z CSPRNG (`Crypto.getRandomBytes(12)`).
5. **Czy wykryjemy modyfikację danych:** Tak, AES-GCM generuje tag uwierzytelniający – zmiana chociażby jednego bitu szyfrogramu powoduje zgłoszenie wyjątku dekrypcji i unieważnienie sesji.
6. **Co, jeśli klucz wycieknie:** Klucz istnieje wyłącznie w pamięci RAM i ulega wyzerowaniu (`fill(0)`) przy blokadzie ekranu i w tle; w razie naruszenia sesja zostaje unieważniona po stronie serwera Supabase Auth.

#### Decyzja 2: Wyprowadzanie klucza z PIN-u za pomocą PBKDF2-SHA256
1. **Jakie zadanie:** Wyprowadzenie 256-bitowego klucza kryptograficznego z krótkiego 6-cyfrowego kodu PIN.
2. **Czy wybór jest dziś zalecany:** Tak, PBKDF2 z SHA-256 i liczbą iteracji $\ge 20\,000$ jest zgodny z NIST SP 800-132 i OWASP Mobile Security Guide.
3. **Skąd klucz, gdzie leży, kto go używa:** PIN wpisuje użytkownik; sól (16 bajtów) leży w `securebank.pin_vault` w SecureStore; klucz wyjściowy istnieje tylko w RAM na czas operacji szyfrowania/deszyfrowania.
4. **Czy wartości jednorazowe się nie powtarzają:** Tak, sól o długości 128 bitów jest unikalna dla każdego skarbca PIN.
5. **Czy wykryjemy modyfikację danych:** Sól i parametry KDF są weryfikowane pośrednio przy deszyfrowaniu skarbca przez AES-GCM.
6. **Co, jeśli klucz wycieknie:** Klucz jest ulotny; 5 nieudanych prób odgadnięcia PIN-u nieodwracalnie niszczy lokalny skarbiec w SecureStore i resetuje stan sesji.

#### Decyzja 3: Przechowywanie skrótów PIN na serwerze za pomocą bcrypt
1. **Jakie zadanie:** Ochrona haseł i bezpieczne uwierzytelnianie PIN-u po stronie serwera.
2. **Czy wybór jest dziś zalecany:** Tak, bcrypt jest rekomendowany przez OWASP ASVS v4.0 jako adaptacyjna funkcja skrótu odporna na ataki sprzętowe.
3. **Skąd klucz, gdzie leży, kto go używa:** Skrót leży w tabeli `public.user_pins` w PostgreSQL; używają go wyłącznie procedury składowane `verify_pin` i `set_pin` w trybie `SECURITY DEFINER`.
4. **Czy wartości jednorazowe się nie powtarzają:** Sól generowana przez `gen_salt('bf', 10)` jest losowa dla każdego użytkownika i każdej zmiany PIN-u.
5. **Czy wykryjemy modyfikację danych:** Spójność danych gwarantuje baza PostgreSQL i brak praw zapisu do tabeli dla ról anonimowych i uwierzytelnionych.
6. **Co, jeśli klucz wycieknie:** Nawet w przypadku wycieku bazy danych koszt obliczeniowy $2^{10}$ iteracji z solą uniemożliwia masowe odzyskanie PIN-ów za pomocą tęczowych tablic.

---

## 2. Stan aplikacji i kamień milowy MVP

### 2.1. Ocena kryteriów MVP (Zajęcia 5)

| Kryterium | Wymaganie z prezentacji | Stan w projekcie SecureBank | Ocena |
| :--- | :--- | :--- | :---: |
| **M1 · Funkcje działają** | Wszystkie funkcje z karty projektu działają (mogą być uproszczone). | Rejestracja z danymi osobowymi i generowaniem numeru klienta/rachunku IBAN, logowanie hasłem, 2FA (Google Authenticator TOTP), konfiguracja i odblokowanie PIN-em, ekran główny ze stanem konta i historią, formularz przelewu ze skanerem kodów QR (CameraX) i walidacją NRB, modal ustawień profilu i bezpieczeństwa z opcją zmiany hasła i PIN-u, blokada po 30 s w tle. | **Spełnione** |
| **M2 · Build z repozytorium** | Czysty klon buduje się według README, bez ręcznych kroków. | Projekt buduje się w Expo SDK 58 (`npm install`, `npx expo start`, `npx expo export -p web`). Wszystkie zmienne środowiskowe posiadają bezpieczne wartości fallback (`.env.example`). | **Spełnione** |
| **M3 · Dokumenty w repozytorium** | Model zagrożeń i dokumenty z zajęć 2–4 są w `docs/`. | W katalogu `docs/` znajdują się arkusze sekcji `Z2`, `Z3`, `Z4`, model zagrożeń DFD i STRIDE (`docs/threat-model/`) oraz inwentaryzacja i decyzje magazynowe D1–D5 (`docs/storage/`). | **Spełnione** |
| **M4 · Dane w magazynie** | Dane wrażliwe w bezpiecznym magazynie, z raportem „przed” i „po”. | Sekrety znajdują się wyłącznie w `expo-secure-store` z podwójną warstwą szyfrowania (`enc1:` + Keystore). Raport „przed” i decyzje w `docs/storage/`. Wyeliminowano niezaszyfrowaną sesję przed PIN-em i pobieranie PESEL-u. | **Spełnione** |
| **M5 · Demo 5 minut** | W rundzie sekcji: od logowania do kluczowej funkcji aplikacji. | Opracowano i zweryfikowano płynny scenariusz demo prezentujący pełny cykl życia aplikacji mobilnej banku. | **Spełnione** |

---

### 2.2. Tabela obszarów stanu aplikacji

| Obszar | Status | Największe ryzyko |
| :--- | :---: | :--- |
| **Funkcje (MVP)** | Zrobione | Potencjalne opóźnienia sieciowe przy komunikacji z zewnętrznym backendem Supabase w środowisku o słabym zasięgu (mitygowane przez wbudowane stany offline i komunikaty błędów). |
| **Build z repozytorium** | Zrobione | Różnice wersji Node.js / npm na maszynach oceniających (mitygowane przez zablokowany `package-lock.json` i zgodność z Node LTS v20/v22). |
| **Model zagrożeń** | Zrobione | Pojawienie się nowych wektorów ataku związanych z dynamicznymi deep-linkami lub fałszowaniem certyfikatów CA w kanale sieciowym (adresowane w Zajęciach 6). |
| **Uprawnienia** | Zrobione | Modyfikacja uprawnień przez zewnętrzne biblioteki w procesie `expo prebuild` (mitygowane przez `blockedPermissions` w `app.json` oraz audyt manifestu). |
| **Przechowywanie danych** | Zrobione | Ryzyko odczytu pamięci RAM na zrootowanym urządzeniu podczas aktywnej sesji (mitygowane przez zerowanie klucza `fill(0)` po 30 s w tle). |
| **Kryptografia** | Zrobione | Ograniczona entropia 6-cyfrowego PIN-u (mitygowana przez Keystore hardware binding, limit 5 prób i serwerowy bcrypt). |

---

### 2.3. Werdykt MVP

* **Werdykt:** **TAK (Kamień milowy MVP osiągnięty w 100%)**
* **Największe ryzyko:** Ryzyko ataku typu Man-in-the-Middle (MitM) w kanale komunikacji sieciowej na urządzeniach z zainstalowanym przez użytkownika nieautoryzowanym certyfikatem głównym (root CA).
* **Planowana mitygacja:** Wdrożenie mechanizmu przypinania certyfikatów (Certificate Pinning) oraz restrykcyjnego pliku `network_security_config.xml` w ramach tematu Zajęć 6.

---

## 3. Plan do zajęć 6 (Komunikacja sieciowa i bezpieczeństwo transmisji)

Zgodnie z harmonogramem semestru kolejne zajęcia obejmują obszar **MASVS-NETWORK** (bezpieczeństwo transmisji, TLS 1.3, ochrona przed podsłuchem i manipulacją pakietami):

| Zadanie | Kto | Termin | Sposób sprawdzenia |
| :--- | :---: | :---: | :--- |
| **K1 · Wdrożenie przypinania certyfikatów SSL/TLS (Certificate Pinning)** | Jakub Dziewior | Zajęcia 6 | Wymuszenie weryfikacji skrótów kluczy publicznych (SPKI pin) certyfikatu serwera Supabase w kliencie sieciowym; próba połączenia z podstawionym certyfikatem proxy (Burp Suite / mitmproxy) musi zakończyć się zerwaniem połączenia (`SSLHandshakeException`). |
| **K2 · Restrykcyjna konfiguracja Network Security Config dla Androida** | Jakub Dziewior | Zajęcia 6 | Opracowanie konfiguracji `network_security_config.xml` z parametrem `cleartextTrafficPermitted="false"`, zaufaniem wyłącznie do certyfikatów systemowych (`<certificates src="system" />`) i jawnym odrzuceniem certyfikatów użytkownika (`user`); weryfikacja scalonego manifestu po `expo prebuild`. |
| **K3 · Test odporności na przechwytywanie ruchu sieciowego (MitM)** | Jakub Wodyk | Zajęcia 6 | Wykonanie testu dynamicznego z uruchomionym lokalnym proxy; udokumentowanie braku możliwości podejrzenia zapytań PostgREST z tokenami JWT i danymi przelewów w logach proxy. |
| **K4 · Ochrona integralności zapytań i ochrona przed Replay Attack** | Jakub Wodyk | Zajęcia 6 | Wdrożenie unikalnych identyfikatorów żądań (Request Nonce / Idempotency-Key) oraz nagłówków sygnatury czasowej dla operacji zlecenia przelewu w celu uniemożliwienia powtórzenia transakcji. |
| **Przygotowanie demonstracji komunikacji sieciowej na Zajęcia 6** | Jakub Dziewior, Jakub Wodyk | Zajęcia 6 | Demonstracja zablokowania komunikacji przy aktywnym proxy przechwytującym oraz poprawnego wykonania przelewu w kanale TLS 1.3 z Certificate Pinning. |
