# D4 · Mapa kanałów wycieku

| Pole | Wartość |
| :--- | :--- |
| **Aplikacja** | SecureBank, `com.securebank.app` |
| **Obszar MASVS** | MASVS-STORAGE-2, MASVS-PLATFORM-3 |
| **Podstawa** | Raport „przed” D2 |

## Mapa

| Kanał | Dotyczy nas? | Co tam trafia teraz | Jak zamkniemy | Jak sprawdzimy |
| :--- | :---: | :--- | :--- | :--- |
| **Logi** | Tak | Stany uprawnienia aparatu `[SecureBank/CameraPermission]` (bez danych); błędy SecureStore tylko w `__DEV__`. Brak tokenów, bo klient Supabase działa bez `debug`. | Jedna funkcja logująca z listą dozwolonych pól (stany, kody błędów); w release wyłączenie pozostałych `console.*` przez `babel-plugin-transform-remove-console` z wyjątkiem `console.info` stanów uprawnień. Zakaz logowania obiektów `session`, `user`, `error` z odpowiedzi API. | `adb logcat -s ReactNativeJS` w buildzie release podczas logowania, odblokowania PIN-em, konfiguracji 2FA i przelewu; wyszukanie `eyJ`, `refresh_token`, adresu e-mail i numeru rachunku |
| **Kopia zapasowa** | Tak | Nic wrażliwego: `allowBackup: false`, `SecureStore.xml` wykluczony przez `dataExtractionRules` z pluginu `expo-secure-store`, wpisy Keychain `ThisDeviceOnly` | Utrzymanie obecnej konfiguracji; kontrola, czy żadna nowa biblioteka nie nadpisze `android:dataExtractionRules` (ostrzeżenie pluginu przy `prebuild`). Pliki PDF wyłącznie w `cacheDirectory`, który nie trafia do kopii. | `adb shell bmgr backupnow com.securebank.app` i `adb backup` (oczekiwany pusty wynik); scalony `AndroidManifest.xml`; iOS: przywrócenie zaszyfrowanej kopii na drugim urządzeniu → ekran logowania |
| **Zrzuty ekranu / przełącznik** | Tak | Zrzut ekranu głównego z saldem, numerem rachunku i transakcjami w przełączniku zadań; możliwość zrobienia zrzutu ekranu i nagrania ekranu formularza przelewu oraz konfiguracji 2FA | `expo-screen-capture` (`preventScreenCaptureAsync`, na Androidzie `FLAG_SECURE`) na ekranach: główny, przelew, konfiguracja 2FA, PIN. Zasłona z logo nakładana przy `AppState` `inactive` / `background` (iOS robi zrzut przełącznika w tym momencie). | Przycisk „Ostatnie aplikacje” → czarny lub zasłonięty podgląd; próba zrzutu ekranu → komunikat systemu o blokadzie; `adb shell screencap` → czarny obraz |
| **Schowek** | Tak | Sekret TOTP przy „Otwórz Google Authenticator” i „Kopiuj klucz”, bez wygaśnięcia | Usunięcie kopiowania z „Otwórz Google Authenticator”. „Kopiuj klucz” czyści schowek po 60 s i przy zamknięciu okna konfiguracji (jeśli zawartość nadal jest sekretem). Na Androidzie 13+ oznaczenie wpisu jako wrażliwego (`ClipDescription.EXTRA_IS_SENSITIVE`) przez moduł natywny lub zastąpienie `expo-clipboard`. Numer rachunku nie jest kopiowany. | Konfiguracja 2FA bez kopiowania → schowek pusty; po „Kopiuj klucz” i 60 s → `adb shell cmd clipboard get-primary-clip` zwraca pusty schowek; podgląd schowka Androida 13+ pokazuje ukrytą treść |
| **Klawiatura** | Tak | Nazwa odbiorcy i tytuł przelewu mogą trafić do słownika klawiatury; hasło chronione `secureTextEntry`; PIN na własnej klawiaturze `PinPad` | Pola formularza przelewu: `autoCorrect={false}`, `autoComplete="off"`, `spellCheck={false}`, `importantForAutofill="no"`. Kod TOTP: `textContentType="oneTimeCode"` (już jest). PIN zostaje na `PinPad`. | Wpisanie nietypowego tytułu przelewu → brak podpowiedzi w innej aplikacji; przegląd propsów `TextInput` w kodzie |
| **Cache HTTP i WebView** | Tak | Możliwy zapis odpowiedzi PostgREST (profil, saldo, transakcje) w `cache/http-cache` (Android, OkHttp 10 MB) i `Cache.db` (iOS); WebView regulaminu jeszcze nie istnieje | Globalny nagłówek `Cache-Control: no-store` w `createClient` (OkHttp nie zapisuje odpowiedzi, gdy żądanie ma `no-store`). Przy wylogowaniu czyszczenie `cacheDirectory`. Planowany WebView: `incognito`, `cacheEnabled={false}`, `sharedCookiesEnabled={false}`, tylko treść publiczna. | `adb shell run-as com.securebank.app ls -R cache/http-cache` po przejściu przez ekran główny (oczekiwany brak plików z odpowiedziami API); iOS: rozmiar i zawartość `Cache.db` |
| **Pliki tymczasowe** | Tak (planowane) | Obecnie brak: skaner QR nie zapisuje zdjęć. Planowane wyciągi PDF i potwierdzenia przelewów. | PDF generowany do `cacheDirectory` z losową nazwą, usuwany po zamknięciu okna udostępniania i przy wylogowaniu; nigdy `Download/` ani galeria. Dokumenty zapisuje użytkownik przez SAF / `UIDocumentPicker`. | `adb shell run-as com.securebank.app ls -R cache files` po udostępnieniu wyciągu i po wylogowaniu |
| **Powiadomienia** | Tak (planowane) | Obecnie brak: powiadomienia push nie są zaimplementowane | Treść ogólna bez danych: „Nowa operacja na koncie”, „Próba logowania z nowego urządzenia”. Szczegóły tylko w aplikacji po odblokowaniu PIN-em. Kanał Androida z `lockscreenVisibility = PRIVATE`. Token push przechowywany tylko na serwerze. | Wysłanie testowego powiadomienia przy zablokowanym telefonie → brak kwoty i numeru rachunku na ekranie blokady; `adb shell dumpsys notification --noredact` |

## Priorytety zamknięcia

| Priorytet | Kanał | Zadanie |
| :---: | :--- | :--- |
| 1 | Schowek | K2 |
| 2 | Zrzuty ekranu / przełącznik | K2 |
| 3 | Logi | K2 |
| 4 | Cache HTTP | K2 |
| 5 | Kopia zapasowa | K2 (weryfikacja, konfiguracja już jest) |
| 6 | Klawiatura | K2 |
| 7 | Pliki tymczasowe, powiadomienia | Razem z implementacją wyciągów PDF i powiadomień push |
