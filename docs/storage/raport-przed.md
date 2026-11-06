# D2 · Raport „przed”: co widać na urządzeniu

| Pole | Wartość |
| :--- | :--- |
| **Aplikacja** | SecureBank, `com.securebank.app` |
| **Stan kodu** | Po zadaniach z Z3 (skaner QR z obsługą odmowy uprawnienia, test cofnięcia uprawnienia) |
| **Obszar MASVS** | MASVS-STORAGE-1, MASVS-STORAGE-2 |

Raport opisuje, co dziś leży na dysku, w logach i w kanałach systemowych jawnym tekstem lub bez wystarczającej ochrony. Ustalenia wynikają z analizy kodu aplikacji i bibliotek; kolumna „Jak potwierdzić” podaje polecenie, którym każde ustalenie sprawdzamy na urządzeniu z buildem debug.

**Ryzyko:** Wysokie: sekret lub dane osobowe jawnie · Średnie: dane wrażliwe bez ochrony · Niskie: dane wewnętrzne

## Ustalenia

| Miejsce | Co znaleziono | Ryzyko | Jak potwierdzić |
| :--- | :--- | :---: | :--- |
| **Schowek systemowy** | Sekret TOTP (Base32) kopiowany przy każdym „Otwórz Google Authenticator” oraz „Kopiuj klucz” (`TotpSetupModal.tsx`). Brak oznaczenia jako wrażliwe i brak czyszczenia: sekret zostaje w schowku i historii schowka klawiatury, widoczny dla innych aplikacji i w podglądzie schowka Androida 13+. | **Wysokie** | Konfiguracja 2FA → wklejenie w dowolnej aplikacji; `adb shell cmd clipboard get-primary-clip` (Android 13+) |
| **Przełącznik zadań** | Zrzut ekranu `HomeScreen` z saldem, pełnym numerem rachunku i ostatnimi transakcjami zapisywany przez system przy przejściu w tło. Blokada po 30 s nie pomaga, bo zrzut powstaje w chwili wyjścia z aplikacji. Brak `FLAG_SECURE` i brak zasłony na iOS. | **Średnie** | Przycisk „Ostatnie aplikacje” na ekranie głównym; `adb shell screencap` przy otwartej aplikacji |
| **Keychain iOS po odinstalowaniu** | `securebank.pin_vault` i zaszyfrowana sesja przeżywają usunięcie aplikacji. Po ponownej instalacji aplikacja pokazuje ekran PIN-u z e-mailem poprzedniego użytkownika i po wpisaniu PIN-u przywraca starą sesję. | **Średnie** | Zalogowanie → usunięcie aplikacji → instalacja → oczekiwany ekran logowania, obecnie ekran PIN-u |
| **Cache HTTP** | React Native ma włączony cache odpowiedzi (Android `cache/http-cache`, 10 MB; iOS `NSURLCache`). Odpowiedzi PostgREST z profilem, saldem i transakcjami mogą zostać zapisane, jeśli serwer nie wyśle `Cache-Control: no-store`. Klient Supabase nie wysyła nagłówka zakazującego zapisu. | **Średnie** (do potwierdzenia) | `adb shell run-as com.securebank.app ls -R cache/http-cache` i `grep` po numerze rachunku; iOS: `Library/Caches/com.securebank.app/Cache.db` |
| **Pamięć operacyjna: profil** | Zapytanie `profiles.select('*')` pobiera pełny PESEL, który nie jest nigdzie wyświetlany. Dane nie trafiają na dysk, ale niepotrzebnie przechodzą przez sieć, pamięć i potencjalnie cache HTTP. | **Średnie** | Podgląd odpowiedzi w narzędziu proxy (np. mitmproxy w buildzie debug) |
| **SecureStore: okno przed PIN-em** | Między pierwszym logowaniem a utworzeniem PIN-u sesja (z refresh tokenem) leży w SecureStore tylko pod szyfrowaniem Keystore / Keychain, bez warstwy AES-GCM z PIN-u. Jeżeli użytkownik zamknie aplikację na ekranie ustawiania PIN-u, ten stan zostaje do następnego uruchomienia. | **Niskie** | `adb shell run-as com.securebank.app cat shared_prefs/SecureStore.xml` przed i po ustawieniu PIN-u; wartość po ustawieniu PIN-u po odszyfrowaniu ma prefiks `enc1:` |
| **SecureStore: skarbiec PIN** | `securebank.pin_vault` zawiera e-mail w JSON (zaszyfrowany przez Keystore / Keychain). E-mail zostaje po pełnym wylogowaniu, bo `handleFullLogout()` nie usuwa skarbca. | **Niskie** | Wylogowanie z ekranu PIN-u → ponowne uruchomienie → ekran logowania nie pokazuje e-maila, ale wpis istnieje w `SecureStore.xml` |
| **SecureStore: nazwy kluczy** | Nazwy `securebank.session`, `securebank.session.N`, `securebank.pin_vault`, `securebank.pin_attempts` są jawne w `SecureStore.xml`; wartości są szyfrogramami. | **Niskie** | `cat shared_prefs/SecureStore.xml` |
| **Klawiatura** | Pola „Nazwa odbiorcy” i „Tytuł” w formularzu przelewu korzystają ze zwykłej klawiatury: słownik podpowiedzi może zapamiętać nazwy kontrahentów i tytuły przelewów. PIN wpisywany jest na własnej klawiaturze `PinPad`, hasło przez `secureTextEntry`. | **Niskie** | Wpisanie nietypowego tytułu → sprawdzenie podpowiedzi klawiatury w innej aplikacji |
| **Logcat** | Wpisy `[SecureBank/CameraPermission] source=… status=…` także w release; nie zawierają danych przelewu ani tokenów. `console.warn` z błędami SecureStore tylko w `__DEV__`. Klient Supabase działa bez trybu `debug`, więc nie loguje nagłówków `Authorization`. | **Niskie** | `adb logcat -s ReactNativeJS` podczas logowania, odblokowania PIN-em i przelewu; wyszukanie `eyJ` (początek JWT) i numeru rachunku |
| **Wersja web (demo)** | Sesja z refresh tokenem w `sessionStorage` przeglądarki jawnym tekstem. | **Wysokie** dla wersji web, poza zakresem aplikacji mobilnej | Narzędzia deweloperskie przeglądarki → Application → Session Storage |

## Miejsca sprawdzone bez ustaleń

| Miejsce | Wynik |
| :--- | :--- |
| `AsyncStorage` / MMKV | Biblioteki nie są zainstalowane; brak jawnego zapisu tokenów w preferencjach |
| Kopia zapasowa Android | `allowBackup: false`; plugin `expo-secure-store` dodaje `dataExtractionRules` wykluczające `SecureStore.xml` z kopii w chmurze i transferu między urządzeniami. Klucz Keystore i tak nie opuszcza urządzenia. |
| Kopia zapasowa iOS | Wpisy Keychain mają `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, więc nie migrują na inne urządzenie |
| Pamięć współdzielona | Aplikacja nie deklaruje `READ/WRITE_EXTERNAL_STORAGE` i nie zapisuje plików poza katalogiem aplikacji |
| Pliki tymczasowe | Skaner QR nie zapisuje zdjęć; brak eksportu PDF w obecnej wersji |
| PKCE `code-verifier` | Nie powstaje (tryb `implicit`) |
| Powiadomienia | Funkcja jeszcze niezaimplementowana |

## Wnioski

1. Jedyny sekret jawnym tekstem poza magazynem to sekret TOTP w schowku. Zamykamy go w K2.
2. Dane klienta nie są zapisywane przez aplikację, ale mogą wyciec przez przełącznik zadań i cache HTTP. Zamykamy je w K2.
3. Na iOS reinstalacja nie usuwa sesji. Obsługujemy to w K3 flagą pierwszego uruchomienia.
4. Pozostałe ustalenia mają ryzyko niskie i zostaną usunięte przy okazji K1 i K3.
