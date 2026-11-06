# D3 · Decyzje o magazynie

| Pole | Wartość |
| :--- | :--- |
| **Aplikacja** | SecureBank, `com.securebank.app` |
| **Obszar MASVS** | MASVS-STORAGE-1, MASVS-STORAGE-2 |
| **Podstawa** | Inwentaryzacja D1, raport „przed” D2 |

Zasady z prezentacji: **1** minimalizacja, **2** sekrety w magazynie, **3** świadoma dostępność, **4** zamknięte kanały, **5** sprzątanie.

Założenia wspólne dla wszystkich decyzji:

* Jedynym magazynem sekretów jest `expo-secure-store`: na Androidzie szyfruje wartości kluczem AES/GCM z Android Keystore i zapisuje szyfrogram w prywatnych preferencjach, na iOS zapisuje je w Keychain.
* Aplikacja nie używa biometrii. Klucz Keystore nie wymaga uwierzytelnienia użytkownika (`requireAuthentication: false`), a rolę „klucza odblokowywanego przez użytkownika” pełni klucz wyprowadzany z PIN-u (PBKDF2-SHA256, 20 000 iteracji), który odszyfrowuje klucz danych sesji.
* Na iOS wszystkie wpisy mają `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Nie potrzebujemy dostępu w tle (`AfterFirstUnlock`), bo aplikacja po 30 s w tle i tak usuwa klucz z pamięci i zatrzymuje odświeżanie tokenów.
* `expo-secure-store` nie udostępnia `setUnlockedDeviceRequired` ani `setIsStrongBoxBacked`. Brak tej opcji rekompensuje warstwa szyfrowania kluczem z PIN-u: bez PIN-u szyfrogram sesji jest bezużyteczny nawet przy odblokowanym urządzeniu.

---

## Sesja Supabase (access token i refresh token)

**Po co na urządzeniu:** utrzymanie zalogowania między uruchomieniami i odnawianie access tokena (ważny 1 h) refresh tokenem
**Klasyfikacja:** poufne
**Magazyn:** `expo-secure-store`, klucz `securebank.session` (fragmenty po 1800 znaków); wartość szyfrowana AES-256-GCM kluczem danych sesji, zapis z prefiksem `enc1:`
**Dostępność:** iOS `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; Android klucz Keystore bez wymogu uwierzytelnienia + klucz danych dostępny tylko po wpisaniu PIN-u
**Uzasadnienie:** sesja daje pełny dostęp do konta, więc wymaga dwóch niezależnych warstw. Skopiowanie pliku preferencji nic nie daje bez klucza Keystore, a odczyt w imieniu aplikacji na zrootowanym urządzeniu nic nie daje bez PIN-u. Sesja nie trafia do kopii ani na inne urządzenie.
**Zmiana (K1):** do chwili utworzenia skarbca PIN sesja ma być trzymana wyłącznie w RAM (`pendingValues`), a nie w SecureStore bez warstwy `enc1:`. Zamknięcie aplikacji na ekranie ustawiania PIN-u oznacza ponowne logowanie hasłem.
**Zasady:** 2, 3, 5

## Klucz danych sesji

**Po co na urządzeniu:** szyfrowanie i odszyfrowanie sesji w SecureStore
**Klasyfikacja:** szczególnie wrażliwe
**Magazyn:** wyłącznie RAM (`sessionKey` w `src/services/pin.ts`); na dysku tylko `wrappedKey` zaszyfrowany kluczem z PBKDF2(PIN)
**Dostępność:** od poprawnego wpisania PIN-u do blokady (przycisk „Wyloguj”, 30 s w tle, wyczerpanie prób)
**Uzasadnienie:** klucz w postaci jawnej nigdy nie dotyka dysku. Przy blokadzie bufor jest zerowany (`fill(0)`), a nie tylko porzucany.
**Zasady:** 2, 3, 5

## Skarbiec PIN

**Po co na urządzeniu:** lokalne odblokowanie aplikacji PIN-em bez hasła i bez połączenia z serwerem
**Klasyfikacja:** poufne
**Magazyn:** `expo-secure-store`, klucz `securebank.pin_vault`
**Dostępność:** iOS `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; Android Keystore
**Uzasadnienie:** skarbiec zawiera sól, liczbę iteracji, nonce i zaszyfrowany klucz danych. Nie zawiera PIN-u ani jego skrótu. Jest przypisany do `userId` i wersji PIN-u z serwera: zmiana PIN-u na innym urządzeniu wymusza ponowne potwierdzenie PIN-u u serwera.
**Zmiana (K3):** e-mail w skarbcu zastępujemy maską (`j***@domena.pl`), wystarczającą do podpisu na ekranie PIN-u; skarbiec usuwamy przy pełnym wylogowaniu.
**Zasady:** 1, 2, 3, 5

## Licznik nieudanych prób PIN

**Po co na urządzeniu:** blokada po 5 błędnych PIN-ach i usunięcie skarbca
**Klasyfikacja:** wewnętrzne
**Magazyn:** `expo-secure-store`, klucz `securebank.pin_attempts`
**Dostępność:** jak skarbiec
**Uzasadnienie:** licznik w zwykłych preferencjach można wyzerować edycją pliku. W SecureStore jego modyfikacja wymaga dostępu do klucza aplikacji. Niezależny licznik prowadzi serwer (`user_pins.failed_attempts`) przy każdej weryfikacji PIN-u online.
**Zasady:** 2

## PIN

**Po co na urządzeniu:** nie musi być zapisany
**Klasyfikacja:** szczególnie wrażliwe
**Magazyn:** brak zapisu; na serwerze skrót bcrypt (`gen_salt('bf', 10)`) w tabeli `user_pins` bez dostępu przez API (`REVOKE ALL`)
**Dostępność:** tylko w chwili wpisywania
**Uzasadnienie:** PIN służy wyłącznie do wyprowadzenia klucza i weryfikacji przez funkcję RPC. Wpisywany jest na własnej klawiaturze `PinPad`, więc nie trafia do słownika klawiatury systemowej.
**Zasady:** 1, 4

## Hasło do konta

**Po co na urządzeniu:** nie musi być zapisane
**Klasyfikacja:** szczególnie wrażliwe
**Magazyn:** brak zapisu; stan komponentu tylko do chwili wysłania
**Dostępność:** tylko w chwili logowania
**Uzasadnienie:** po zalogowaniu wystarcza sesja, a codzienne odblokowanie odbywa się PIN-em. Pole hasła ma `secureTextEntry`.
**Zasady:** 1, 4

## Sekret TOTP

**Po co na urządzeniu:** nie musi być zapisany; potrzebuje go tylko Google Authenticator
**Klasyfikacja:** szczególnie wrażliwe
**Magazyn:** brak zapisu; RAM tylko na czas konfiguracji
**Dostępność:** tylko na ekranie konfiguracji 2FA
**Uzasadnienie:** sekret pozwala generować kody drugiego składnika bez telefonu użytkownika. Przekazujemy go przez `otpauth-migration://` bezpośrednio do Google Authenticator.
**Zmiana (K2):** „Otwórz Google Authenticator” przestaje kopiować sekret do schowka. „Kopiuj klucz” zostaje jako awaryjna ścieżka ręczna, a schowek jest czyszczony po 60 s i przy zamknięciu okna konfiguracji.
**Zasady:** 1, 4

## Profil, saldo, numer rachunku, historia transakcji

**Po co na urządzeniu:** nie muszą być zapisane; pobierane z API przy każdym wejściu na ekran główny
**Klasyfikacja:** szczególnie wrażliwe (profil), poufne (saldo, rachunek, transakcje)
**Magazyn:** brak zapisu; stan React, usuwany po odmontowaniu ekranu
**Dostępność:** tylko przy odblokowanej sesji (ekran główny renderuje się wyłącznie w stanie `home`)
**Uzasadnienie:** dane zmieniają się po stronie serwera i podlegają RLS. Lokalna kopia nie daje użytkownikowi korzyści, a dodaje powierzchnię ataku.
**Zmiana (K1, K2):** zapytanie o profil zwraca tylko `first_name`, `last_name`, `role` (bez PESEL); klient Supabase wysyła `Cache-Control: no-store`, żeby odpowiedzi nie trafiały do cache HTTP.
**Zasady:** 1, 4

## Formularz przelewu i dane z kodu QR

**Po co na urządzeniu:** nie muszą być zapisane
**Klasyfikacja:** poufne
**Magazyn:** brak zapisu; stan `TransferModal`, czyszczony przy każdym otwarciu
**Dostępność:** tylko w trakcie wypełniania formularza
**Uzasadnienie:** zlecenie trafia od razu do API. Niedokończony przelew nie jest szkicem do odtworzenia.
**Zmiana (K2):** pola tekstowe bez autouzupełniania i podpowiedzi (`autoComplete="off"`, `autoCorrect={false}`, `importantForAutofill="no"`).
**Zasady:** 1, 4

## Wyciągi PDF i potwierdzenia (planowane)

**Po co na urządzeniu:** tylko na czas przekazania do systemowego okna udostępniania
**Klasyfikacja:** szczególnie wrażliwe
**Magazyn:** `FileSystem.cacheDirectory` aplikacji; nigdy pamięć współdzielona
**Dostępność:** do zamknięcia okna `expo-sharing` / SAF
**Uzasadnienie:** użytkownik sam wybiera miejsce docelowe przez picker systemowy. Kopia w katalogu aplikacji jest usuwana zaraz po udostępnieniu i przy wylogowaniu.
**Zasady:** 1, 4, 5

## Token push i treść powiadomień (planowane)

**Po co na urządzeniu:** token tylko w chwili rejestracji
**Klasyfikacja:** wewnętrzne (token), poufne (treść)
**Magazyn:** token na serwerze, bez lokalnego zapisu; treść powiadomień ogólna
**Dostępność:** nie dotyczy
**Uzasadnienie:** powiadomienie jest widoczne na ekranie blokady, więc nie zawiera kwot, sald ani numerów rachunków. Szczegóły widać dopiero po odblokowaniu aplikacji PIN-em.
**Zasady:** 1, 4

## Lokalizacja i kontakt odbiorcy (planowane)

**Po co na urządzeniu:** nie muszą być zapisane
**Klasyfikacja:** poufne
**Magazyn:** brak zapisu; RAM
**Dostępność:** jednorazowo, w chwili użycia funkcji
**Uzasadnienie:** lokalizacja przybliżona jest wysyłana do backendu jednorazowo; kontakt z pickera wypełnia tylko pole numeru telefonu.
**Zasady:** 1

## Flaga pierwszego uruchomienia (planowane)

**Po co na urządzeniu:** wykrycie reinstalacji na iOS, gdzie Keychain przeżywa usunięcie aplikacji
**Klasyfikacja:** publiczne
**Magazyn:** zwykły plik w `FileSystem.documentDirectory`; nie w Keychain, bo musi zniknąć razem z aplikacją
**Dostępność:** zawsze
**Uzasadnienie:** brak pliku przy starcie oznacza świeżą instalację: aplikacja usuwa skarbiec PIN i zaszyfrowaną sesję z Keychain przed pierwszym renderem, a potem tworzy plik. Na Androidzie odinstalowanie usuwa SecureStore, więc mechanizm jest neutralny.
**Zasady:** 5

## Preferencja motywu

**Po co na urządzeniu:** opcjonalnie, wygoda użytkownika
**Klasyfikacja:** publiczne
**Magazyn:** obecnie nie jest zapisywana; jeżeli będzie, to w zwykłych preferencjach bez szyfrowania
**Dostępność:** zawsze
**Uzasadnienie:** nie zawiera żadnej informacji o użytkowniku ani koncie. Może przetrwać wylogowanie.
**Zasady:** 1
