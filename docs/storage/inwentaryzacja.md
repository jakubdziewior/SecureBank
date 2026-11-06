# D1 · Inwentaryzacja danych na urządzeniu

| Pole | Wartość |
| :--- | :--- |
| **Aplikacja** | SecureBank (React Native, Expo SDK 58, TypeScript) |
| **Pakiet** | `com.securebank.app` |
| **Odpowiedzialny** | Jakub Dziewior |
| **Obszar MASVS** | MASVS-STORAGE-1, MASVS-STORAGE-2 |
| **Źródło** | Analiza kodu (`src/`, `App.tsx`, `app.json`) oraz kodu bibliotek w `node_modules` |

Inwentaryzacja obejmuje dane zapisywane przez nasz kod, dane zapisywane pod spodem przez biblioteki oraz dane funkcji zaplanowanych w tabeli uprawnień z arkusza Z3. Najważniejsza kolumna to „Musi być na urządzeniu?”: odpowiedź „nie” oznacza brak zapisu, a nie szyfrowanie.

**Klasyfikacja:** Publiczne · Wewnętrzne · Poufne · Szczególnie wrażliwe

---

## 1. Dane zapisywane przez aplikację

| Dane | Gdzie są teraz | Klasyfikacja | Musi być na urządzeniu? | Docelowe miejsce i opcja |
| :--- | :--- | :--- | :--- | :--- |
| **Sesja Supabase** (access token JWT, refresh token, obiekt `user` z e-mailem i `id`) | `expo-secure-store`, klucz `securebank.session` dzielony na fragmenty `securebank.session.N` po 1800 znaków (`src/services/supabase.ts`). Wartość dodatkowo szyfrowana AES-256-GCM kluczem danych sesji (prefiks `enc1:`). | Poufne | Tak: utrzymanie zalogowania między uruchomieniami i odnawianie access tokena | Bez zmian: SecureStore z `WHEN_UNLOCKED_THIS_DEVICE_ONLY` + warstwa AES-GCM kluczem odblokowywanym PIN-em |
| **Sesja przed ustawieniem PIN-u** (pierwsze logowanie, zanim powstanie skarbiec) | `expo-secure-store` bez warstwy `enc1:` (tylko szyfrowanie Keystore / Keychain); po utworzeniu PIN-u `resealStoredSession()` szyfruje ją ponownie | Poufne | Tak, ale tylko na czas konfiguracji PIN-u | Pamięć RAM do chwili utworzenia skarbca (zadanie K1) |
| **Skarbiec PIN** (`userId`, `email`, `pinVersion`, `salt`, `iterations`, `nonce`, `wrappedKey`) | `expo-secure-store`, klucz `securebank.pin_vault` (`src/services/pin.ts`) | Poufne (e-mail to dana osobowa; `wrappedKey` to zaszyfrowany klucz sesji) | Tak: lokalne odblokowanie PIN-em bez wpisywania hasła | Bez zmian; e-mail zastąpić maską lub usuwać przy pełnym wylogowaniu (K3) |
| **Licznik nieudanych prób PIN** | `expo-secure-store`, klucz `securebank.pin_attempts` | Wewnętrzne | Tak: lokalna blokada po 5 próbach i usunięcie skarbca | Bez zmian |
| **Klucz danych sesji** (32 bajty AES) | Wyłącznie pamięć RAM (`sessionKey` w `pin.ts`); na dysku tylko jako `wrappedKey` zaszyfrowany kluczem z PBKDF2(PIN) | Szczególnie wrażliwe | Nie w postaci jawnej | RAM, zerowany (`fill(0)`) przy blokadzie, po 30 s w tle i przy wylogowaniu |
| **PIN** (6 cyfr) | Nigdzie nie jest zapisywany; na serwerze tylko skrót bcrypt (`user_pins.pin_hash`) | Szczególnie wrażliwe | Nie | Brak zapisu; wpisywany na własnej klawiaturze `PinPad` |
| **Hasło do konta** | Tylko stan komponentu `LoginScreen` w trakcie logowania | Szczególnie wrażliwe | Nie | Brak zapisu; pole `secureTextEntry` |
| **Sekret TOTP** (Base32) | RAM w czasie konfiguracji (`TotpSetupModal`); **kopiowany do schowka systemowego** przy „Otwórz Google Authenticator” i „Kopiuj klucz” | Szczególnie wrażliwe | Nie: potrzebny tylko Google Authenticatorowi | Bez schowka (przekazanie przez `otpauth-migration://`); kopiowanie tylko na żądanie z czyszczeniem schowka (K2) |
| **Profil klienta** (imię, nazwisko, PESEL, numer klienta / login, rola) | Stan React (`HomeScreen`), pobierany z API przy każdym wejściu zapytaniem o profil użytkownika | Szczególnie wrażliwe | Nie: pobierany z API; minimalizacja danych na urządzeniu | Brak trwałego zapisu na dysku; zapytanie tylko o `first_name`, `last_name`, `client_number`, `role` (K1); wyłączenie cache HTTP (K2) |
| **Saldo, numer rachunku (NRB/IBAN), limit dzienny** | Stan React (`HomeScreen`), powiązany z unikalnym kontem klienta | Poufne | Nie: pobierane z API | Brak zapisu; zasłona w przełączniku zadań (K2) |
| **Historia transakcji** | Stan React (`HomeScreen`), 5 ostatnich pozycji | Poufne | Nie: pobierana z API | Brak zapisu, cache wyłączony |
| **Formularz przelewu i dane z kodu QR** | Stan React (`TransferModal`), znika po zamknięciu formularza | Poufne | Nie | Brak zapisu; wyłączone podpowiedzi klawiatury (K2) |
| **Preferencja motywu** (jasny / ciemny) | Stan React (`ThemeContext`), niezapisywana | Publiczne | Nie (opcjonalnie) | Jeżeli zostanie utrwalona: zwykłe preferencje, bez szyfrowania |
| **Logi diagnostyczne** | `console.info` `[SecureBank/CameraPermission] source=… status=…` (także w release); `console.warn` błędów SecureStore tylko w `__DEV__` | Wewnętrzne | Nie | Logi bez danych; w release tylko stany uprawnień (K2) |

---

## 2. Dane zapisywane przez biblioteki

| Dane | Biblioteka | Gdzie są teraz | Klasyfikacja | Musi być na urządzeniu? | Docelowe miejsce i opcja |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Szyfrogramy SecureStore** | `expo-secure-store` | Android: `shared_prefs/SecureStore.xml` (AES/GCM kluczem z Android Keystore, nazwy kluczy jawne). iOS: Keychain (`kSecClassGenericPassword`). | Poufne | Tak (opakowanie wszystkich sekretów) | Bez zmian; plugin wyklucza plik z Auto Backup i transferu D2D |
| **Klucz AES Keystore** | `expo-secure-store` | Android Keystore (TEE / StrongBox, jeśli dostępny), alias zależny od `keychainService` | Szczególnie wrażliwe | Tak | Nieeksportowalny; `setUserAuthenticationRequired(false)`, bo nie używamy biometrii |
| **PKCE `code-verifier`** | `@supabase/auth-js` | Nie powstaje: klient działa w domyślnym trybie `flowType: 'implicit'` | Poufne | Nie | Brak zapisu |
| **Cache odpowiedzi HTTP** | React Native (OkHttp / `NSURLSession`) | Android: `cache/http-cache` (10 MB, `OkHttpClientProvider`). iOS: `Library/Caches/<bundle>/Cache.db` (`NSURLCache`). Zapis zależy od nagłówków `Cache-Control` odpowiedzi PostgREST. | Poufne (saldo, transakcje, profil) | Nie | Nagłówek `Cache-Control: no-store` w kliencie Supabase (K2); weryfikacja zawartości katalogów |
| **Ciasteczka HTTP** | React Native (`ForwardingCookieHandler`) | Magazyn ciasteczek WebView; Supabase Auth nie ustawia ciasteczek przy logowaniu hasłem | Wewnętrzne | Nie | Brak zapisu (weryfikacja w raporcie „przed”) |
| **Klatki podglądu aparatu** | `expo-camera` | Nie są zapisywane: skaner używa `onBarcodeScanned`, bez `takePictureAsync` | Poufne | Nie | Brak zapisu |
| **Zrzut ekranu w przełączniku zadań** | System (Android Recents / iOS App Switcher) | Zapisywany przez system przy przejściu w tło: widać saldo, numer rachunku i transakcje | Poufne | Nie | `FLAG_SECURE` / zasłona przy przejściu w tło (K2) |
| **Wersja web: sesja** | `SecureStoreAdapter` (gałąź `web`) | `sessionStorage` przeglądarki jawnym tekstem | Poufne | Tak (tylko demo web) | Wersja web wyłącznie do prezentacji, nie jest produktem docelowym |

---

## 3. Funkcje zaplanowane (tabela uprawnień z Z3)

| Dane | Gdzie powstaną | Klasyfikacja | Musi być na urządzeniu? | Docelowe miejsce i opcja |
| :--- | :--- | :--- | :--- | :--- |
| **Wyciąg PDF / potwierdzenie przelewu** | Plik tymczasowy przed przekazaniem do `expo-sharing` / SAF | Szczególnie wrażliwe | Nie: generowany na żądanie | `cacheDirectory`, usuwany zaraz po zamknięciu okna udostępniania; nigdy w pamięci współdzielonej |
| **Token push (Expo / FCM / APNs)** | Rejestracja powiadomień | Wewnętrzne | Nie: przechowywany na serwerze | Wysyłany do backendu, bez lokalnego zapisu |
| **Treść powiadomień** | Centrum powiadomień systemu | Poufne | Nie | Treść ogólna („Nowa operacja na koncie”), bez kwot i numerów rachunków |
| **Przybliżona lokalizacja** (bankomaty, antyfraud) | Odczyt `ACCESS_COARSE_LOCATION` | Poufne | Nie | Tylko RAM, wysyłana jednorazowo; brak historii lokalizacji |
| **Kontakt odbiorcy P2P** | Systemowy Contact Picker | Poufne | Nie | Tylko RAM (numer telefonu wstawiany do formularza) |
| **Regulamin w WebView** | `react-native-webview` | Publiczne | Nie | `incognito`, `cacheEnabled={false}`, bez ciasteczek sesji |
| **Flaga pierwszego uruchomienia** | Zwykły plik w `documentDirectory` (usuwany przy odinstalowaniu) | Publiczne | Tak: wykrycie reinstalacji na iOS | Plik bez danych osobowych, wykluczony z kopii zapasowej (K3) |

---

## 4. Podsumowanie

| Kategoria | Liczba pozycji | Na dysku |
| :--- | :---: | :--- |
| **Sekrety (sesja, skarbiec PIN, licznik)** | 3 | Tylko `expo-secure-store` (Keystore / Keychain), sesja dodatkowo AES-GCM kluczem z PIN-u |
| **Dane klienta i operacji** | 5 | Brak zapisu przez aplikację; ryzyko pośrednie: cache HTTP i przełącznik zadań |
| **Dane uwierzytelniające wpisywane przez użytkownika (PIN, hasło, sekret TOTP)** | 3 | Brak zapisu; wyciek przez schowek dla sekretu TOTP |
| **Dane bibliotek i systemu** | 8 | Opisane wyżej; do zamknięcia: cache HTTP, zrzut w przełączniku zadań |
