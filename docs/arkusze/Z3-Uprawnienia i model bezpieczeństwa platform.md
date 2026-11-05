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

## 1. Gdzie to zagrożenie występuje u nas? (Tabela uprawnień)

Zgodnie z metodyką modelowania uprawnień platformowych oraz wytycznymi z prezentacji, w aplikacji **SecureBank** przeanalizowano pełen cykl życia uprawnień: **Deklaracja $\rightarrow$ Prośba $\rightarrow$ Decyzja $\rightarrow$ Użycie $\rightarrow$ Cofnięcie**. 

Zgodnie z zasadą minimalnych uprawnień (*Least Privilege*) aplikacja bankowa prosi o dostęp wyłącznie wtedy, gdy funkcja jest rzeczywiście wywoływana przez użytkownika (*zasada in-time*), a każda odmowa jest stanem normalnym, który nie może blokować działania aplikacji.

### Tabela uprawnień systemowych aplikacji

| Uprawnienie (Android / iOS) | Po co jest potrzebne (Cel biznesowy) | Kiedy aplikacja prosi (Moment prośby) | Co się dzieje przy odmowie (Normalny stan / Fallback) | Obsługa stanów odmowy (`denied` / `permanentlyDenied`) | Wariant ograniczony lub zastąpienie pickerem |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Aparat**<br>• Android: `CAMERA`<br>• iOS: `NSCameraUsageDescription` | Skanowanie kodów QR na fakturach i przelewach (automatyczne zaczytanie numeru rachunku, kwoty i tytułu) oraz weryfikacja tożsamości KYC. | Dopiero w chwili naciśnięcia przycisku „Skanuj kod QR” na ekranie nowego przelewu. Nigdy przy starcie aplikacji. | Aplikacja działa dalej; użytkownik zostaje płynnie przełączony na standardowy formularz ręcznego wprowadzania danych przelewu. Ekran nie jest blokowany. | • `denied`: Jednorazowy baner informacyjny z możliwością ponowienia próby.<br>• `permanentlyDenied`: Baner z przyciskiem do Ustawień systemowych (`Linking.openSettings()`). Brak zapętlonych monitów. | **Systemowy Photo Picker:** Użytkownik może zamiast aparatu wybrać wcześniej zapisane zdjęcie kodu QR z galerii przez systemowy selektor (bez konieczności posiadania uprawnienia do aparatu). |
| **2. Przybliżona lokalizacja**<br>• Android: `ACCESS_COARSE_LOCATION`<br>• iOS: `NSLocationWhenInUseUsageDescription` | Ochrona antyfraudowa (detekcja nieregularnych logowań i operacji z obcych lokalizacji geograficznych wg dyrektywy PSD2) oraz wyszukiwarka placówek i bankomatów. | Wyłącznie po przejściu do zakładki „Znajdź bankomat / wpłatomat” lub w tle autoryzacji niestandardowej transakcji wysokiej kwoty. | Wyszukiwarka bankomatów przełącza się w tryb ręcznego wpisania miasta lub kodu pocztowego. Przy transakcji brak odmowy wykonania przelewu – system prosi o dodatkowy kod 2FA. | • `denied`: Przejście do wyszukiwania tekstowego.<br>• `permanentlyDenied`: Zapamiętanie flagi w pamięci sesji, brak ponownych zapytań systemowych przy kolejnych operacjach. | **Wariant ograniczony:** Aplikacja wnioskuje **wyłącznie o lokalizację przybliżoną** (`COARSE` na Androidzie / *Reduced Accuracy* na iOS). Dokładna lokalizacja (`ACCESS_FINE_LOCATION`) oraz lokalizacja w tle są trwale zablokowane. |
| **3. Powiadomienia**<br>• Android: `POST_NOTIFICATIONS` (13+)<br>• iOS: `UNUserNotificationCenter` | Otrzymywanie powiadomień autoryzacyjnych push (zatwierdzanie operacji), alertów o podejrzanych próbach logowania oraz natychmiastowych informacji o przelewach przychodzących. | Po pierwszym udanym logowaniu i konfiguracji konta, poprzedzone dedykowanym ekranem informacyjnym (*pre-permission dialog*) wyjaśniającym cel bezpieczeństwa. | Użytkownik nie otrzymuje alertów w tle; powiadomienia o transakcjach są widoczne w historii wewnątrz aplikacji, a autoryzacja operacji odbywa się kodem TOTP lub PIN-em. | • `denied`: Informacja w profilu, że powiadomienia push są nieaktywne.<br>• `permanentlyDenied`: Przełącznik w zakładce „Bezpieczeństwo” odsyłający do ustawień systemowych. | **Powiadomienia tymczasowe / In-App:** Wykorzystanie powiadomień tymczasowych na iOS (*Provisional Notifications*) oraz polling stanu transakcji wewnątrz aktywnej sesji aplikacji bez uprawnień systemowych. |
| **4. Biometria**<br>• Android: `USE_BIOMETRIC`, `USE_FINGERPRINT`<br>• iOS: `NSFaceIDUsageDescription` | Szybkie odblokowanie aplikacji i autoryzacja przelewów odciskiem palca / Face ID zamiast wpisywania 6-cyfrowego PIN-u. | Opcjonalnie w zakładce „Ustawienia bezpieczeństwa” w chwili, gdy użytkownik decyduje się aktywować biometrię. | Domyślne, w pełni bezpieczne logowanie 6-cyfrowym PIN-em sprzętowym lub hasłem głównym; aplikacja zachowuje 100% funkcjonalności. | • `denied`: Pozostanie przy autoryzacji kodem PIN.<br>• `restricted` (brak modułu biometrii lub blokada rodzicielska): Automatyczne ukrycie opcji w interfejsie. | **Sprzętowy PIN jako fallback:** Biometria stanowi wyłącznie warstwę wygody UX; bazowym mechanizmem kryptograficznym jest skarbiec PIN powiązany z PBKDF2 i AES-256-GCM. |
| **5. Zdjęcia i pliki**<br>• Android: `READ_MEDIA_IMAGES`<br>• iOS: Dostęp do biblioteki zdjęć | Załączanie potwierdzeń transakcji, dokumentów dochodowych KYC lub pobieranie wyciągów bankowych w formacie PDF. | W momencie kliknięcia „Pobierz wyciąg PDF” lub „Załącz dokument do dyspozycji”. | Brak zapisu/odczytu; możliwość bezpośredniego podglądu wygenerowanego dokumentu w dedykowanym oknie aplikacji. | Brak blokad całego ekranu; odmowa dotyczy tylko bieżącej operacji plikowej. | **Zastąpione w 100% pickerem systemowym:** Wykorzystanie Storage Access Framework (SAF na Androidzie) oraz `UIDocumentPicker` / `expo-sharing` na iOS. Aplikacja **nie deklaruje ani nie potrzebuje** szerokiego uprawnienia `READ_EXTERNAL_STORAGE` do całej pamięci. |
| **6. Kontakty**<br>• Android: `READ_CONTACTS`<br>• iOS: Kontakty | Realizacja szybkich przelewów na numer telefonu (przelewy P2P / BLIK). | W chwili kliknięcia ikony książki adresowej w polu numeru odbiorcy przelewu telefonicznego. | Użytkownik wpisuje numer telefonu odbiorcy ręcznie z klawiatury numerycznej. | • `denied`: Zamknięcie okna wyboru i powrót do pola tekstowego.<br>• `permanentlyDenied`: Brak ponownych zapytań, pole tekstowe pozostaje aktywne. | **Zastąpione Contact Access Pickerem:** Zastosowanie systemowego selektora kontaktów (*Contact Picker* na Androidzie oraz iOS 18+). Aplikacja otrzymuje wyłącznie dane wybranego kontaktu bez dostępu do całej książki telefonicznej. |

---

### Zestawienie uprawnień: Wnioskowane vs Zastąpione pickerem vs Trwale zablokowane

W architekturze bezpieczeństwa **SecureBank** przyjęto ścisły podział uprawnień:

1. **Uprawnienia wnioskowane w czasie działania (Runtime Permissions):**
   * `android.permission.CAMERA` / `NSCameraUsageDescription` (skanowanie QR kodów przelewów in-time).
   * `android.permission.ACCESS_COARSE_LOCATION` / `NSLocationWhenInUseUsageDescription` (moduł antyfraudowy PSD2, wyłącznie przybliżona lokalizacja).
   * `android.permission.POST_NOTIFICATIONS` (autoryzacja operacji push).
   * `android.permission.USE_BIOMETRIC` / `NSFaceIDUsageDescription` (opcjonalna biometria z fallbackiem na PIN).
2. **Zasoby realizowane przez pośrednictwo systemu (Aplikacja NIE potrzebuje uprawnień – Slajd 4):**
   * *Pliki i wyciągi PDF:* Obsługiwane przez Storage Access Framework (`expo-sharing` / `UIDocumentPicker`) – dostęp tylko do wskazanego pliku.
   * *Wybór zdjęć:* Android Photo Picker / iOS PHPicker – użytkownik wskazuje plik, aplikacja nie widzi galerii.
   * *Kontakty do przelewów P2P:* Systemowy picker kontaktu – aplikacja nie odczytuje całej książki adresowej.
3. **Uprawnienia trwale zablokowane (`blockedPermissions` – Slajd 7):**
   * `android.permission.READ_PHONE_STATE` – usunięcie z manifestu identyfikatora urządzenia dodawanego przez biblioteki zewnętrzne (`tools:node="remove"`).
   * `android.permission.ACCESS_FINE_LOCATION` – blokada precyzyjnego śledzenia GPS (wystarcza przybliżona lokalizacja).
   * `android.permission.READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE` – blokada przestarzałych, niebezpiecznych uprawnień do całej pamięci współdzielonej.

---

## 2. Co już mamy?

* **Jawna konfiguracja uprawnień i blokad w `app.json`:**
  * W `android.permissions` zadeklarowano minimalny zestaw uprawnień: aparat (`CAMERA`), zablokowano zbędne uprawnienia telemetryczne (`READ_PHONE_STATE`) dyrektywą `blockedPermissions`.
  * W `ios.infoPlist` dodano wymagany klucz opisu celu `NSCameraUsageDescription`.
* **Wyłączenie tworzenia kopii zapasowych (`allowBackup: false`):**
  * Zgodnie z wytycznymi ze slajdu 10 w `app.json` skonfigurowano `"allowBackup": false`, co zapobiega kradzieży danych skarbca i sesji przez interfejs `adb backup`.
* **Bezpieczny skarbiec sesji z niezależnym PIN-em:**
  * W pluginie `expo-secure-store` wyłączono uprawnienie FaceID (`faceIDPermission: false`). Sesja chroniona jest algorytmem AES-256-GCM z kluczem wyprowadzanym z PIN-u (PBKDF2 z 20 000 iteracji SHA-256) oraz dwuetapową weryfikacją TOTP.
* **Ochrona przed wyeksportowanymi aktywnościami (Single-Activity + Strażnik Sesji):**
  * Zgodnie z analizą wektora ataku ze slajdu 11 (omijanie logowania przez bezpośrednie wywołanie aktywności intencją `adb shell am start`), aplikacja opiera się na architekturze Single-Activity (`MainActivity`).
  * Wszystkie ekrany wewnętrzne podlegają ścisłej kontroli strażnika sesji (`gate` w `App.tsx` w stanach: `loading` $\rightarrow$ `login` $\rightarrow$ `mfa` $\rightarrow$ `pinUnlock` $\rightarrow$ `home`). Bez poprawnej autoryzacji żaden komponent wewnętrzny nie zostanie wyrenderowany w pamięci RAM.
* **Automatyczna blokada w cyklu życia aplikacji:**
  * Nasłuch zdarzeń systemowych `AppState` – przejście aplikacji w tło na dłużej niż 30 sekund powoduje natychmiastowe usunięcie klucza z pamięci RAM (`lockSession()`) i wymusza ponowną autoryzację przy powrocie.

---

## 3. Czego brakuje?

| Luka / obszar do wdrożenia | Gdzie | Ryzyko | Dlaczego takie ryzyko |
| :--- | :--- | :---: | :--- |
| **Brak pełnej obsługi stanów odmowy aparatu w UI przelewu** | Moduł skanera kodów QR | **Niskie** | Użytkownik po zaznaczeniu opcji „Nie pytaj ponownie” (`permanentlyDenied`) musi mieć w interfejsie jasny przycisk otwierający ustawienia aplikacji (`Linking.openSettings()`), bez blokowania możliwości wpisania numeru rachunku ręcznie. |
| **Brak procedury testowej odmowy i cofnięcia uprawnienia** | Środowisko testowe Android / iOS | **Średnie** | Wymagane przetestowanie zachowania aplikacji przy nagłym odebraniu uprawnienia w czasie działania przez system operacyjny (`adb shell pm revoke com.securebank.app android.permission.CAMERA`). |
| **Brak jawnych reguł ekstrakcji danych (`dataExtractionRules`)** | Konfiguracja platformy Android (Android 12+) | **Niskie** | Na nowszych wersjach systemu Android brak pliku XML z regułami ekstrakcji może skutkować domyślnym włączeniem transferu plików aplikacji podczas migracji między urządzeniami. |

---

## 4. Jak to rozwiązuje nasza platforma?

| Mechanizm / biblioteka | Do czego go użyjemy | Pułapki i ograniczenia platformy |
| :--- | :--- | :--- |
| **Expo Config & Plugins (`app.json`)** | Centralne zarządzanie uprawnieniami Androida i iOS: generowanie deklaracji uprawnień w plikach `AndroidManifest.xml` oraz `Info.plist` paczki wynikowej `.app` / `.apk`. | **Pułapka:** Zewnętrzne biblioteki NPM w procesie `prebuild` mogą wstrzykiwać nadmiarowe uprawnienia do `Merged Manifest`. Należy stosować dyrektywę `blockedPermissions` oraz regularnie weryfikować scalony manifest. |
| **Asynchroniczne API uprawnień w czasie wykonywania (Runtime Permissions)** | Odpytywanie użytkownika o zgodę w chwili akcji (`requestCameraPermissionsAsync()`, `requestForegroundPermissionsAsync()`). | **Pułapka:** Na iOS brak uzasadnienia w `Info.plist` skutkuje twardym zawieszeniem (crash) aplikacji. Na Androidzie permanentna odmowa wymaga obsłużenia stanu `canAskAgain: false` i przekierowania do ustawień systemowych. |
| **Systemowe interfejsy pośredniczące (Pickery & SAF)** | Dostęp do plików, wyciągów PDF oraz kontaktów za pośrednictwem systemowych okien dialogowych (Storage Access Framework, Photo Picker, Contact Picker). | **Zaleta architektoniczna:** Aplikacja operuje wyłącznie na tymczasowych identyfikatorach URI przekazanych przez system, nie posiadając uprawnień do przeglądania całego dysku ani książki adresowej. |
| **Architektura Single-Activity (React Native)** | Izolacja ekranów biznesowych przed nieuprawnionym uruchomieniem z zewnątrz przez intencje systemowe (`adb shell am start`). | **Obrona:** Brak dodatkowych aktywności oznaczonych jako `android:exported="true"`. Cała logika autoryzacji i routingu odbywa się wewnątrz silnika JavaScript z weryfikacją tokenów JWT po stronie backendu Supabase. |

---

## 5. Plan na kolejny tydzień (Zadania na Zajęcia 4)

Zgodnie z wytycznymi ze slajdu 13 prezentacji, przygotowano plan zadań do realizacji na kolejne zajęcia poświęcone **Bezpiecznemu przechowywaniu danych (MASVS-STORAGE)**:

| Zadanie | Osoba | Jak udowodnimy, że działa | Pozycja w checkliście MASVS |
| :--- | :---: | :--- | :---: |
| **Tabela uprawnień z pełną obsługą odmowy w kodzie i interfejsie** | Jakub Wodyk | Implementacja logiki skanera QR z płynnym fallbackiem na formularz ręczny przy statusie `denied` oraz banerem z przekierowaniem do ustawień przy `permanentlyDenied`. | MASVS-PLATFORM-1 |
| **Test procedury cofnięcia uprawnienia (`pm revoke`)** | Jakub Wodyk | Przeprowadzenie testu poleceniem `adb shell pm revoke com.securebank.app android.permission.CAMERA` na uruchomionej aplikacji, zarejestrowanie logów i wykazanie braku awarii aplikacji. | MASVS-PLATFORM-1 |
| **Weryfikacja scalonego manifestu (`Merged Manifest`)** | Jakub Dziewior | Wygenerowanie i audyt scalonego pliku `AndroidManifest.xml` potwierdzający obecność wyłącznie uprawnień autoryzowanych w karcie projektu oraz skuteczne zablokowanie `READ_PHONE_STATE`. | MASVS-PLATFORM-1 |
| **Kompletna inwentaryzacja danych przechowywanych lokalnie na urządzeniu** | Jakub Dziewior | Opracowanie szczegółowej tabeli magazynu lokalnego (`PinVault`, tokeny sesji szyfrowane AES-256-GCM w `expo-secure-store`, ulotny klucz w RAM, brak nieszyfrowanego `AsyncStorage`) stanowiącej bazę pod Krok 1 w arkuszu Z4. | MASVS-STORAGE-1 |
