# Arkusz sekcji – „Jak to dotyczy naszej aplikacji?”

## Nagłówek

| Pole | Wartość |
| :--- | :--- |
| **Sekcja / aplikacja** | SecureBank |
| **Technologia** | React Native (Expo / TypeScript) |
| **Zajęcia nr** | 3 |
| **Temat zajęć** | Uprawnienia i model bezpieczeństwa platform |
| **Obszar MASVS** | MASVS-PLATFORM, MASVS-STORAGE, MASVS-AUTH |
| **Osoby obecne** | Jakub Dziewior, Jakub Wodyk |

---

## 0. Status z poprzedniego tygodnia

| Zadanie z poprzednich zajęć | Status | Dowód |
| :--- | :---: | :--- |
| **Konfiguracja Supabase Auth (rejestracja i logowanie) oraz obsługa ról użytkownika (`client`, `admin`) w JWT** (Jakub Dziewior) | zrobione | Moduł autentykacji w `src/screens/LoginScreen.tsx` zintegrowany z GoTrue; obsługa profilu i ról w `src/screens/HomeScreen.tsx`; weryfikacja uprawnień administracyjnych funkcją `public.is_admin()` w PostgreSQL. |
| **Wdrożenie i weryfikacja reguł RLS dla tabeli `profiles` i `accounts` w PostgreSQL** (Jakub Dziewior) | zrobione | Schemat w `supabase/schema.sql` z włączonym RLS dla wszystkich tabel (`profiles_select_own`, `accounts_select_own`, `transactions_select_own`) oraz rozszerzeniem o restrykcyjne polityki wymuszenia weryfikacji dwuetapowej (`profiles_require_mfa`, `accounts_require_mfa`). |
| **Zbudowanie formularza logowania i rejestracji w UI React Native z walidacją wejścia** (Jakub Wodyk) | zrobione | Formularz w `src/screens/LoginScreen.tsx` z animowanym przełącznikiem zakładek, walidacją formatu e-mail (regex), minimalnej długości hasła, in-app banerem błędów i mikro-animacją potrząśnięcia (`shakeAnim`). |
| **Implementacja wstępnej obsługi uprawnień natywnych i bezpiecznego zapisu tokena** (Jakub Wodyk) | zrobione | Implementacja sprzętowego skarbca PIN (`src/services/pin.ts`) z wyprowadzaniem klucza PBKDF2 (20 000 iteracji SHA-256) i szyfrowaniem sesji AES-256-GCM w `expo-secure-store`; wdrożenie 2FA TOTP Google Authenticator (`src/services/mfa.ts`); wyłączenie zbędnego uprawnienia FaceID w `app.json`. |

---

## 1. Gdzie to zagrożenie występuje u nas?

| Zasób / Mechanizm platformy | Po co jest potrzebne | Kiedy aplikacja o nie prosi | Co się dzieje przy odmowie (wariant awaryjny) | Zastąpienie pickerem / ograniczeniem |
| :--- | :--- | :--- | :--- | :--- |
| **Aparat (`CAMERA` / `NSCameraUsageDescription`)** | Skanowanie kodów QR przelewów (automatyczne uzupełnienie numeru rachunku i kwoty). | W chwili kliknięcia przycisku „Skanuj kod QR” w formularzu przelewu (zasada *in-time*, nigdy przy starcie aplikacji). | Aplikacja nie blokuje działania; wyświetla komunikat informacyjny i przełącza użytkownika na standardowy, ręczny formularz wprowadzania danych przelewu. | Brak (aparat wymaga bezpośredniego strumienia wideo do dekodowania QR). |
| **Pliki / Potwierdzenia przelewów (PDF)** | Generowanie i zapisywanie potwierdzeń wykonania transakcji bankowych. | W momencie kliknięcia „Pobierz potwierdzenie PDF” przy szczegółach transakcji. | Brak zapisu pliku; możliwość ponownego pobrania lub podejrzenia potwierdzenia na ekranie. | **Zastąpione pickerem:** Użycie systemowego modułu Storage Access Framework (`expo-sharing` / `UIDocumentPicker`), dzięki czemu aplikacja **nie wymaga** szerokiego uprawnienia `READ/WRITE_EXTERNAL_STORAGE`. |
| **Ochrona przed ominięciem logowania (Exported Activities)** | Zapobieganie bezpośredniemu uruchomieniu ekranów wewnętrznych banku (`HomeScreen`) z pominięciem logowania (np. przez `adb shell am start` lub inną aplikację). | Cały cykl życia aplikacji. | Próba bezpośredniego wywołania intencji kieruje użytkownika do strażnika sesji (`gate` w `App.tsx`) i wymusza autoryzację PIN/hasłem. | Architektura Single-Activity w React Native/Expo: jedyna aktywność to `MainActivity` z `android:exported="true"` (punkt wejścia), a wszystkie ekrany wewnętrzne są komponentami JS chronionymi stanem nawigatora. |
| **Kopia zapasowa systemu (`adb backup` / iCloud Backup)** | Zabezpieczenie danych aplikacji przed wyciekiem w wyniku nieautoryzowanego backupu urządzenia. | Podczas podłączenia urządzenia do komputera lub automatycznej kopii zapasowej w chmurze. | System pomija dane sandboxu aplikacji podczas tworzenia kopii zapasowej. | Wyłączenie kopii zapasowej w konfiguracji (`android:allowBackup="false"` w `app.json`). |

---

## 2. Co już mamy?

* **Jawna i minimalna deklaracja uprawnień w `app.json`:** Zdefiniowano wyłącznie jedno uprawnienie sprzętowe (`android.permissions: ["android.permission.CAMERA"]`) wraz z precyzyjnym opisem celu dla systemu iOS (`ios.infoPlist.NSCameraUsageDescription`).
* **Blokada niepożądanych uprawnień bibliotecznych:** Wprowadzono dyrektywę `android.blockedPermissions: ["android.permission.READ_PHONE_STATE"]`, która wymusza usunięcie zbędnych uprawnień wstrzykiwanych automatycznie przez biblioteki zewnętrzne w procesie łączenia manifestów (`Merged Manifest`).
* **Zablokowanie kopii zapasowej (`allowBackup: false`):** Skonfigurowano `android.allowBackup: false` w `app.json`, co zabezpiecza piaskownicę aplikacji przed wyciągnięciem danych za pomocą `adb backup`.
* **Wyłączenie zbędnego uprawnienia biometrii:** W pluginie `expo-secure-store` jawnie wyłączono uprawnienie FaceID (`faceIDPermission: false`), opierając autoryzację lokalną na sprzętowo szyfrowanym skarbcu PIN (AES-256-GCM).
* **Architektura Single-Activity ze strażnikiem stanu (`Gate`):** Wszystkie widoki aplikacji są renderowane warunkowo w `App.tsx` w oparciu o stan sesji (`gate`: `loading` $\rightarrow$ `login` $\rightarrow$ `mfa` $\rightarrow$ `pinUnlock` $\rightarrow$ `home`). Brak wyeksportowanych aktywności natywnych uniemożliwia ominięcie ekranu uwierzytelniania.
* **Wykrywanie przejścia do tła i auto-blokada:** Aplikacja nasłuchuje zdarzeń `AppState` – jeśli pozostaje w tle dłużej niż 30 sekund, sesja w pamięci RAM zostaje natychmiast wyczyszczona (`lockSession()`), a powrót do aplikacji wymaga ponownego wprowadzenia PIN-u.

---

## 3. Czego brakuje?

| Luka / obszar do wdrożenia | Gdzie | Ryzyko | Dlaczego takie ryzyko |
| :--- | :--- | :---: | :--- |
| **Brak pełnej obsługi stanów odmowy uprawnienia aparatu w UI** | Moduł skanera QR w ekranie przelewów | **Niskie** | Brak obsługi stanu `permanentlyDenied` (trwała odmowa z zaznaczeniem „Nie pytaj ponownie”) może uniemożliwić użytkownikowi łatwe przejście do ustawień systemowych w celu włączenia uprawnienia. |
| **Brak weryfikacji scalonego manifestu po prebuildzie** | Narzędzia budowania Androida | **Średnie** | W przypadku dodania nowej biblioteki NPM istnieje ryzyko, że doda ona do `Merged Manifest` uprawnienia sieciowe lub telemetryczne, których sekcja jawnie nie autoryzowała. |
| **Brak dedykowanego pliku reguł ekstrakcji danych (`dataExtractionRules`)** | Konfiguracja platformy Android (Android 12+) | **Niskie** | Nowsze wersje Androida wymagają jawnego pliku XML precyzującego, które dane z katalogów wewnętrznych piaskownicy podlegają wykluczeniu z transferu urządzenie-urządzenie. |

---

## 4. Jak to rozwiązuje nasza platforma?

| Mechanizm / biblioteka | Do czego go użyjemy | Pułapki i ograniczenia |
| :--- | :--- | :--- |
| **Expo Configuration (`app.json`)** | Centralne zarządzanie uprawnieniami Androida i iOS: generowanie wpisów `<uses-permission>` w `AndroidManifest.xml` oraz kluczy `Info.plist` w paczce `.app`. | **Pułapka:** Zewnętrzne biblioteki NPM mogą wstrzykiwać własne uprawnienia do manifestu. Należy stosować jawną tablicę `android.permissions` oraz `blockedPermissions`, aby wymusić usunięcie niechcianych węzłów (`tools:node="remove"`). |
| **Runtime Permissions API (`expo-camera` / `expo-modules`)** | Asynchroniczne odpytywanie użytkownika o zgodę na dostęp do aparatu w chwili wywołania akcji: `requestCameraPermissionsAsync()`. | **Pułapka:** Na iOS brak wpisu `NSCameraUsageDescription` w `infoPlist` prowadzi do natychmiastowego zamknięcia (crash) procesu aplikacji. Na Androidzie wielokrotna odmowa zmienia stan na `permanentlyDenied`, co wymaga przekierowania do `Linking.openSettings()`. |
| **Systemowe interfejsy pośredniczące (`expo-sharing`, SAF)** | Zapis i eksport wyciągów bankowych PDF bez konieczności wnioskowania o niebezpieczne uprawnienia `READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE`. | **Pułapka:** Próba zapisu plików bezpośrednio do pamięci współdzielonej (np. `/sdcard/Download`) zamiast do katalogu podręcznego aplikacji (`FileSystem.cacheDirectory`) i przekazania do systemowego okna udostępniania. |
| **Architektura Single-Activity (React Native)** | Ochrona logiki biznesowej i widoków bankowych przed bezpośrednim wywołaniem intencji z zewnątrz (`Intent Spoofing`). | **Pułapka:** Zaufanie, że ukrycie komponentu w nawigatorze wystarczy – jeśli backend nie weryfikuje tokena JWT i stanu sesji przy każdym żądaniu, atakujący może odpytać API bezpośrednio poza interfejsem graficznym. |

---

## 5. Plan na kolejny tydzień

| Zadanie | Osoba | Jak udowodnimy, że działa | Pozycja w checkliście MASVS |
| :--- | :---: | :--- | :---: |
| **Implementacja komponentu skanera QR z obsługą cyklu życia uprawnienia aparatu** | Jakub Wodyk | Kod weryfikujący stany uprawnienia (`granted`, `denied`, `permanentlyDenied`); test odmowy z przejściem na formularz ręczny; brak pętli próśb. | MASVS-PLATFORM-1 |
| **Przeprowadzenie testu cofnięcia uprawnienia w locie (`pm revoke`)** | Jakub Wodyk | Zrzut ekranu lub log z testu: odebranie uprawnienia komendą `adb shell pm revoke com.securebank.app android.permission.CAMERA` podczas działania aplikacji i weryfikacja stabilności UI. | MASVS-PLATFORM-1 |
| **Weryfikacja scalonego manifestu (`Merged Manifest`) aplikacji** | Jakub Dziewior | Raport ze sprawdzenia scalonego pliku manifestu wygenerowanego poleceniem `npx expo prebuild` potwierdzający obecność wyłącznie uprawnienia `CAMERA` i brak zbędnych uprawnień od bibliotek. | MASVS-PLATFORM-1 |
| **Inwentaryzacja danych przechowywanych lokalnie (Wstęp do Z4)** | Jakub Dziewior | Przygotowanie tabeli do Krok 1 kolejnego arkusza: lista wszystkich kluczy i plików składowanych na urządzeniu (Keystore, SecureStore, cache) wraz z klasyfikacją danych i metodą ich czyszczenia przy wylogowaniu. | MASVS-STORAGE-1 |
