# Raport bezpieczeństwa – SecureBank

| Pole | Wartość |
| :--- | :--- |
| **Sekcja / aplikacja** | SecureBank |
| **Technologia** | React Native (Expo SDK 58 / TypeScript) |
| **Zajęcia nr** | 5 |
| **Temat** | Kryptografia i kamień milowy MVP |
| **Standardy** | OWASP MASVS-CRYPTO, OWASP MASVS-AUTH, OWASP MASVS-STORAGE |
| **Autorzy** | Jakub Dziewior, Jakub Wodyk |

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

## 2. Stan aplikacji i plan

### 2.1. Tabela stanu aplikacji

| Obszar | Status | Największe ryzyko |
| :--- | :---: | :--- |
| **Funkcje (MVP)** | Zrobione | Zależność od łączności z chmurą Supabase (obsłużona trybem demo/offline i lokalnymi fallbackami). |
| **Build z repozytorium** | Zrobione | Różnice wersji środowiska wykonawczego Node.js (zabezpieczone przez zablokowany `package-lock.json`). |
| **Model zagrożeń** | Zrobione | Podsłuch i modyfikacja pakietów sieciowych przez wstrzyknięcie zaufanego certyfikatu CA (adresowane w Z6). |
| **Uprawnienia** | Zrobione | Próby automatycznego dodania zbędnych uprawnień przez zewnętrzne biblioteki (zablokowane w `app.json`). |
| **Przechowywanie danych** | Zrobione | Odczyt pamięci RAM na zrootowanym urządzeniu w trakcie aktywnej sesji (mitygowane zerowaniem klucza po 30 s). |
| **Kryptografia** | Zrobione | Niska entropia 6-cyfrowego PIN-u (zabezpieczona magazynem Keystore, limitem 5 prób i bcryptem). |

### 2.2. Werdykt MVP

* **Werdykt:** **TAK (Kamień milowy MVP osiągnięty w 100%)**
* **Największe ryzyko:** Ryzyko ataku typu Man-in-the-Middle (MitM) w kanale komunikacji sieciowej na urządzeniach z zainstalowanym przez użytkownika nieautoryzowanym certyfikatem głównym (root CA).

---

### 2.3. Plan do zajęć 6 (Komunikacja sieciowa i bezpieczeństwo transmisji)

| Zadanie | Kto | Termin | Sposób sprawdzenia |
| :--- | :---: | :---: | :--- |
| **K1 · Wdrożenie przypinania certyfikatów SSL/TLS (Certificate Pinning)** | Jakub Dziewior | Zajęcia 6 | Wymuszenie weryfikacji skrótów kluczy publicznych (SPKI pin) certyfikatu serwera Supabase w kliencie sieciowym; próba połączenia z podstawionym certyfikatem proxy (Burp Suite / mitmproxy) musi zakończyć się zerwaniem połączenia (`SSLHandshakeException`). |
| **K2 · Restrykcyjna konfiguracja Network Security Config dla Androida** | Jakub Dziewior | Zajęcia 6 | Opracowanie konfiguracji `network_security_config.xml` z parametrem `cleartextTrafficPermitted="false"`, zaufaniem wyłącznie do certyfikatów systemowych (`<certificates src="system" />`) i jawnym odrzuceniem certyfikatów użytkownika (`user`); weryfikacja scalonego manifestu po `expo prebuild`. |
| **K3 · Test odporności na przechwytywanie ruchu sieciowego (MitM)** | Jakub Wodyk | Zajęcia 6 | Wykonanie testu dynamicznego z uruchomionym lokalnym proxy; udokumentowanie braku możliwości podejrzenia zapytań PostgREST z tokenami JWT i danymi przelewów w logach proxy. |
| **K4 · Ochrona integralności zapytań i ochrona przed Replay Attack** | Jakub Wodyk | Zajęcia 6 | Wdrożenie unikalnych identyfikatorów żądań (Request Nonce / Idempotency-Key) oraz nagłówków sygnatury czasowej dla operacji zlecenia przelewu w celu uniemożliwienia powtórzenia transakcji. |
| **Przygotowanie demonstracji komunikacji sieciowej na Zajęcia 6** | Jakub Dziewior, Jakub Wodyk | Zajęcia 6 | Demonstracja zablokowania komunikacji przy aktywnym proxy przechwytującym oraz poprawnego wykonania przelewu w kanale TLS 1.3 z Certificate Pinning. |
