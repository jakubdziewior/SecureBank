# Arkusz sekcji – „Jak to dotyczy naszej aplikacji?”

## Nagłówek

| Pole | Wartość |
| :--- | :--- |
| **Sekcja / aplikacja** | SecureBank |
| **Technologia** | React Native (Expo / TypeScript) |
| **Zajęcia nr** | 4 |
| **Temat zajęć** | Bezpieczne przechowywanie danych |
| **Obszar MASVS** | MASVS-STORAGE, MASVS-PLATFORM, MASVS-AUTH |
| **Osoby obecne** | Jakub Dziewior, Jakub Wodyk |

---

## 0. Status z poprzedniego tygodnia

| Zadanie z poprzednich zajęć | Status | Dowód |
| :--- | :---: | :--- |
| **Tabela uprawnień z pełną obsługą odmowy w kodzie i interfejsie** (Jakub Wodyk) | zrobione | Formularz przelewu `src/components/TransferModal.tsx` ze skanerem QR (`expo-camera`) uruchamianym in-time; mapowanie stanów `granted` / `undetermined` / `denied` / `permanentlyDenied` / `unavailable` w `src/services/cameraPermission.ts`; baner „Spróbuj ponownie” przy `denied`, baner „Otwórz ustawienia” (`Linking.openSettings()`) przy `permanentlyDenied`, formularz ręczny zawsze aktywny; ponowne sprawdzenie uprawnienia przy powrocie na pierwszy plan; walidacja treści kodu QR (format ZBP, suma kontrolna NRB) w `src/services/transferQr.ts`. W `app.json` plugin `expo-camera` bez mikrofonu i blokada `RECORD_AUDIO`. |
| **Test procedury cofnięcia uprawnienia (`pm revoke`)** (Jakub Wodyk) | zrobione | Procedura i wynik w `docs/testy/pm-revoke-camera.md`, skrypt `scripts/test-camera-revoke.ps1`. Po cofnięciu uprawnienia system kończy proces (`permissions revoked`), w logach brak `FATAL EXCEPTION`; po ponownym uruchomieniu skaner przechodzi w baner odmowy, a przelew można zlecić ręcznie. |
| **Weryfikacja scalonego manifestu (`Merged Manifest`)** (Jakub Dziewior) | zrobione | Audyt `android/app/src/main/AndroidManifest.xml` po `npx expo prebuild`: obecne tylko uprawnienia z karty projektu (`CAMERA`, `INTERNET`), `READ_PHONE_STATE` i `RECORD_AUDIO` usunięte (`tools:node="remove"`), `allowBackup="false"`, `dataExtractionRules` z pluginu `expo-secure-store`. |
| **Kompletna inwentaryzacja danych przechowywanych lokalnie na urządzeniu** (Jakub Dziewior) | zrobione | Rozwinięta w dokument D1 `docs/storage/inwentaryzacja.md`: dane aplikacji, dane bibliotek (SecureStore, cache HTTP OkHttp / `NSURLCache`, przełącznik zadań) oraz funkcji planowanych. |

---

## 1. Gdzie to zagrożenie występuje u nas?

Pełna dokumentacja zajęć znajduje się w katalogu `docs/storage/`:

| Dokument | Plik |
| :--- | :--- |
| D1 · Inwentaryzacja danych | `docs/storage/inwentaryzacja.md` |
| D2 · Raport „przed” | `docs/storage/raport-przed.md` |
| D3 · Decyzje o magazynie | `docs/storage/decyzje.md` |
| D4 · Mapa kanałów wycieku | `docs/storage/kanaly-wyciekow.md` |
| D5 · Polityka sesji | `docs/storage/polityka-sesji.md` |

### Dane na urządzeniu i kanały, którymi mogą wyciec

| Miejsce w aplikacji | Jakie dane są zagrożone | Klasyfikacja danych |
| :--- | :--- | :--- |
| **Magazyn `expo-secure-store` (Android Keystore / iOS Keychain)** | Sesja Supabase (access i refresh token) szyfrowana dodatkowo AES-256-GCM kluczem z PIN-u; skarbiec PIN (sól, nonce, zaszyfrowany klucz danych, e-mail); licznik prób PIN. | **Poufne** |
| **Pamięć RAM** | Klucz danych sesji (zerowany przy blokadzie), profil z PESEL-em, saldo, numer rachunku, historia transakcji, formularz przelewu, sekret TOTP w trakcie konfiguracji 2FA. | **Szczególnie wrażliwe** |
| **Schowek systemowy** | Sekret TOTP kopiowany przy konfiguracji Google Authenticator, bez wygaśnięcia. | **Szczególnie wrażliwe** |
| **Przełącznik zadań / zrzuty ekranu** | Saldo, pełny numer rachunku i ostatnie transakcje na zrzucie ekranu głównego; formularz przelewu i sekret TOTP przy zrzucie lub nagraniu ekranu. | **Poufne** |
| **Cache HTTP (OkHttp `cache/http-cache`, iOS `Cache.db`)** | Odpowiedzi PostgREST z profilem, saldem i transakcjami, jeżeli serwer nie zabroni zapisu. | **Poufne** |
| **Keychain iOS po odinstalowaniu aplikacji** | Skarbiec PIN i zaszyfrowana sesja, które przywracają poprzednią sesję po reinstalacji. | **Poufne** |
| **Klawiatura systemowa** | Nazwy odbiorców i tytuły przelewów w słowniku podpowiedzi. | **Poufne** |
| **Logi (`logcat`, konsola)** | Obecnie tylko stany uprawnienia aparatu; ryzyko dopisania logów z obiektami sesji lub błędami API. | **Wewnętrzne** |
| **Planowane: pliki PDF, powiadomienia push, WebView** | Wyciągi i potwierdzenia przelewów w plikach tymczasowych; kwoty na ekranie blokady; cache i ciasteczka WebView. | **Szczególnie wrażliwe / Poufne** |

---

## 2. Co już mamy?

* **Sekrety wyłącznie w sprzętowym magazynie:** sesja, skarbiec PIN i licznik prób zapisywane są tylko przez `expo-secure-store` (Android: AES/GCM kluczem z Android Keystore, iOS: Keychain). W projekcie nie ma `AsyncStorage` ani MMKV.
* **Druga warstwa szyfrowania sesji kluczem z PIN-u:** sesja w SecureStore jest szyfrowana AES-256-GCM losowym kluczem danych, który z kolei jest zaszyfrowany kluczem wyprowadzonym z PIN-u (PBKDF2-SHA256, 20 000 iteracji). Odczyt magazynu w imieniu aplikacji na zrootowanym urządzeniu nie wystarcza do odtworzenia tokena bez PIN-u.
* **Świadoma dostępność:** wszystkie wpisy z `keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY`; wyłączone `faceIDPermission`, bez biometrii i bez `requireAuthentication`.
* **Klucz tylko w RAM:** klucz danych sesji jest zerowany (`fill(0)`) przy blokadzie, po 30 s w tle i przy wylogowaniu; odświeżanie tokenów zatrzymuje się razem z blokadą.
* **Minimalizacja:** PIN i hasło nigdy nie są zapisywane (PIN na serwerze tylko jako skrót bcrypt bez dostępu przez API); dane konta, transakcji i przelewu są wyłącznie w stanie ekranów; skaner QR nie zapisuje zdjęć; klient Supabase w trybie `implicit` nie zapisuje `code-verifier`.
* **Kopie zapasowe zamknięte:** `allowBackup: false`, a plugin `expo-secure-store` dodaje `dataExtractionRules` wykluczające `SecureStore.xml` z kopii w chmurze i z transferu między urządzeniami (Android 12+). To zamyka lukę „brak `dataExtractionRules`” z arkusza Z3.
* **Ochrona wpisywania:** PIN na własnej klawiaturze `PinPad`, hasło z `secureTextEntry`, kod TOTP z `textContentType="oneTimeCode"`.
* **Sprzątanie przy błędach PIN-u:** 5 błędnych PIN-ów lub „Nie pamiętam PIN-u” usuwa skarbiec, sesję i refresh token; zmiana PIN-u na innym urządzeniu wymusza potwierdzenie nowego PIN-u u serwera.

---

## 3. Czego brakuje?

| Luka / obszar do wdrożenia | Gdzie | Ryzyko | Dlaczego takie ryzyko |
| :--- | :--- | :---: | :--- |
| **Sekret TOTP w schowku bez wygaśnięcia** | `src/components/TotpSetupModal.tsx` | **Wysokie** | Sekret drugiego składnika jawnym tekstem jest dostępny dla innych aplikacji i historii schowka klawiatury. Kto go odczyta, generuje kody 2FA bez telefonu użytkownika. |
| **Brak ochrony przed zrzutem ekranu i podglądem w przełączniku zadań** | `HomeScreen`, `TransferModal`, `TotpSetupModal` | **Średnie** | System zapisuje zrzut ekranu z saldem i numerem rachunku przy każdym wyjściu z aplikacji; blokada po 30 s nie usuwa tego zrzutu. |
| **Sesja przywracana po reinstalacji na iOS** | `App.tsx`, Keychain iOS | **Średnie** | Keychain przeżywa usunięcie aplikacji; po ponownej instalacji aplikacja pokazuje e-mail poprzedniego użytkownika i przywraca sesję po PIN-ie. Narusza zasadę „po reinstalacji sesja nie wraca”. |
| **Możliwy zapis odpowiedzi API w cache HTTP** | `src/services/supabase.ts`, React Native OkHttp / `NSURLCache` | **Średnie** | Cache React Native jest włączony domyślnie; odpowiedzi z saldem i transakcjami mogą zostać na dysku jawnym tekstem po wylogowaniu. |
| **Pobieranie pełnego PESEL-u bez potrzeby** | `HomeScreen.fetchUserData` (`select('*')`) | **Średnie** | Dana szczególnie wrażliwa przechodzi przez sieć, pamięć i potencjalnie cache, choć aplikacja jej nie wyświetla. |
| **Niepełne sprzątanie przy pełnym wylogowaniu** | `App.tsx` (`handleFullLogout`) | **Niskie** | Skarbiec PIN z e-mailem zostaje na urządzeniu; `signOut` z domyślnym zakresem `global` kończy też sesje na innych urządzeniach. |
| **Sesja bez warstwy PIN-u przed jego ustawieniem** | `src/services/supabase.ts` (`setItem`) | **Niskie** | Przerwanie konfiguracji PIN-u zostawia sesję zabezpieczoną tylko przez Keystore / Keychain. |
| **Brak polityki logowania w release i ochrony klawiatury w formularzu przelewu** | Cały kod, `TransferModal` | **Niskie** | Obecne logi są bezpieczne, ale bez reguły łatwo dopisać log z obiektem sesji; słownik klawiatury zapamiętuje dane kontrahentów. |

---

## 4. Jak to rozwiązuje nasza platforma?

| Mechanizm / biblioteka | Do czego go użyjemy | Pułapki i ograniczenia platformy |
| :--- | :--- | :--- |
| **`expo-secure-store`** | Jedyny magazyn sekretów: sesja, skarbiec PIN, licznik prób. Android: szyfrogram AES/GCM kluczem z Android Keystore w prywatnych preferencjach; iOS: Keychain z `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. | **Pułapka:** biblioteka jest opakowaniem. Na Androidzie `keychainAccessible` nie działa, a `setUnlockedDeviceRequired` i `setIsStrongBoxBacked` nie są dostępne; rekompensujemy to warstwą szyfrowania kluczem z PIN-u. Limit rozmiaru wartości wymaga dzielenia sesji na fragmenty. Na iOS wpisy przeżywają odinstalowanie aplikacji. |
| **`@noble/ciphers` (AES-256-GCM) + `@noble/hashes` (PBKDF2)** | Szyfrowanie sesji kluczem danych i opakowanie klucza danych kluczem wyprowadzonym z PIN-u. | **Ograniczenie:** 6-cyfrowy PIN ma tylko 10⁶ kombinacji; po wydobyciu skarbca z urządzenia atak offline jest możliwy. Chroni nas to, że skarbiec jest dodatkowo zaszyfrowany kluczem Keystore / Keychain, którego nie da się wyeksportować. |
| **`expo-screen-capture`** | `FLAG_SECURE` na Androidzie i blokada zrzutów na wrażliwych ekranach; zasłona przy `AppState` `inactive` / `background`. | **Pułapka:** na iOS zrzut przełącznika zadań powstaje przy przejściu w `inactive`, więc zasłonę trzeba pokazać synchronicznie przy tym zdarzeniu, a nie dopiero w `background`. |
| **`expo-clipboard`** | Awaryjne kopiowanie sekretu TOTP z automatycznym czyszczeniem. | **Ograniczenie:** brak opcji oznaczenia wpisu jako wrażliwy (`EXTRA_IS_SENSITIVE`, Android 13+) i brak `expirationDate` (iOS); czyszczenie po czasie realizujemy sami. |
| **Konfiguracja backupu Android (`allowBackup`, `dataExtractionRules`)** | Wykluczenie danych aplikacji z kopii w chmurze i z transferu między urządzeniami. | **Pułapka:** na Androidzie 12+ `allowBackup="false"` nie wyłącza transferu urządzenie-urządzenie; decydują o nim `dataExtractionRules`. Inna biblioteka z własnymi regułami może nadpisać reguły pluginu `expo-secure-store` (plugin wyświetla wtedy ostrzeżenie przy `prebuild`). |
| **Klient sieciowy React Native (OkHttp / `NSURLSession`)** | Wymuszenie braku zapisu odpowiedzi API nagłówkiem `Cache-Control: no-store` w `createClient`. | **Pułapka:** cache HTTP jest włączony domyślnie (Android 10 MB w `cache/http-cache`) i nie jest widoczny w kodzie aplikacji. |

---

## 5. Plan na kolejny tydzień (Zadania na Zajęcia 5: Kryptografia + MVP)

Zadania K1–K3 realizujemy na podstawie dokumentów D3–D5. Na Zajęciach 5 każda sekcja pokazuje działającą aplikację (5 minut demo).

| Zadanie | Osoba | Jak udowodnimy, że działa | Pozycja w checkliście MASVS |
| :--- | :---: | :--- | :---: |
| **K1 · Migracja sekretów według D3** | Jakub Dziewior | Sesja przed ustawieniem PIN-u trzymana tylko w RAM; zapytanie o profil bez PESEL-u (`first_name`, `last_name`, `role`). Dowód: `adb shell run-as com.securebank.app cat shared_prefs/SecureStore.xml` w trakcie konfiguracji PIN-u (brak klucza `securebank.session`) oraz podgląd odpowiedzi API bez pola `pesel`. | MASVS-STORAGE-1 |
| **K2 · Zamknięcie kanałów według D4: zrzuty ekranu, schowek, logi** | Jakub Wodyk | `expo-screen-capture` i zasłona w przełączniku zadań (zrzut przełącznika z zasłoną); sekret TOTP bez automatycznego kopiowania i z czyszczeniem schowka po 60 s (`adb shell cmd clipboard get-primary-clip`); logcat buildu release bez `eyJ`, e-maila i numeru rachunku. | MASVS-STORAGE-2, MASVS-PLATFORM-3 |
| **K2 · Zamknięcie kanałów według D4: kopia zapasowa i cache HTTP** | Jakub Dziewior | `Cache-Control: no-store` w kliencie Supabase i pusty `cache/http-cache` po przejściu przez ekran główny; `adb shell bmgr backupnow com.securebank.app` bez danych SecureStore. | MASVS-STORAGE-2 |
| **K3 · Wylogowanie i reinstalacja według D5** | Jakub Wodyk | Pełne wylogowanie usuwa skarbiec PIN, licznik i `cacheDirectory`, zakres `signOut` zgodny z D5; flaga pierwszego uruchomienia czyści Keychain na iOS. Dowód: nagranie scenariusza zalogowanie → usunięcie aplikacji → instalacja → ekran logowania. | MASVS-STORAGE-1, MASVS-AUTH-2 |
| **Przygotowanie demo MVP na Zajęcia 5** | Jakub Dziewior, Jakub Wodyk | 5-minutowy scenariusz: logowanie hasłem z 2FA, ustawienie PIN-u, blokada po 30 s w tle i odblokowanie PIN-em, przelew ze skanera QR i ręczny, wylogowanie i ekran logowania po ponownym uruchomieniu. | MASVS-AUTH-1, MASVS-STORAGE-1 |
