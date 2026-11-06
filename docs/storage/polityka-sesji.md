# D5 · Polityka sesji: co znika i kiedy

| Pole | Wartość |
| :--- | :--- |
| **Aplikacja** | SecureBank, `com.securebank.app` |
| **Obszar MASVS** | MASVS-STORAGE-1, MASVS-AUTH-2 |
| **Podstawa** | Decyzje D3, logika strażnika sesji `gate` w `App.tsx` |

## Elementy sesji na urządzeniu

| Element | Magazyn |
| :--- | :--- |
| Sesja Supabase (access + refresh token) | `expo-secure-store`: `securebank.session`, `securebank.session.N` (szyfrogram `enc1:`) |
| Skarbiec PIN | `expo-secure-store`: `securebank.pin_vault` |
| Licznik prób PIN | `expo-secure-store`: `securebank.pin_attempts` |
| Klucz danych sesji | RAM (`sessionKey`) |
| Sesja oczekująca na zaszyfrowanie | RAM (`pendingValues`) |
| Dane konta i transakcji | RAM (stan ekranów) |
| Cache HTTP, pliki tymczasowe | `cacheDirectory` aplikacji |

## Polityka

| Zdarzenie | Co usuwamy | Gdzie (magazyn) | Co zostaje | Jak sprawdzimy |
| :--- | :--- | :--- | :--- | :--- |
| **Blokada** (przycisk „Wyloguj” w aplikacji natywnej, 30 s w tle) | Klucz danych sesji (zerowany), sesja oczekująca, dane ekranów; zatrzymanie odświeżania tokenów | RAM | Zaszyfrowana sesja i skarbiec PIN w SecureStore | Przejście w tło na 30 s → powrót → ekran PIN-u; po wpisaniu PIN-u sesja działa bez hasła |
| **Wylogowanie** (pełne: „Wyloguj całkowicie” na ekranie PIN-u) | Unieważnienie refresh tokena na serwerze (`signOut`), sesja w SecureStore, klucz danych, sesja oczekująca. **Docelowo (K3):** także skarbiec PIN, licznik prób, `cacheDirectory`. | Serwer Supabase Auth, SecureStore, RAM, katalog cache | Preferencja motywu (jeżeli zostanie utrwalona) | Wylogowanie → zamknięcie i uruchomienie aplikacji → ekran logowania; `run-as … cat shared_prefs/SecureStore.xml` bez kluczy `securebank.*`; stary refresh token odrzucany przez `/auth/v1/token` |
| **Reinstalacja** | Sesja nie wraca. Android: system usuwa SecureStore i klucz Keystore. iOS: **docelowo (K3)** brak flagi pierwszego uruchomienia w `documentDirectory` powoduje usunięcie `securebank.*` z Keychain przed pierwszym ekranem. | Android: katalog aplikacji, Keystore. iOS: Keychain + plik flagi. | Nic. Refresh token na serwerze wygasa sam, bo żadne urządzenie go już nie zna. | Zalogowanie → usunięcie aplikacji → instalacja → ekran logowania (nie ekran PIN-u z e-mailem poprzedniego użytkownika) |
| **Wygaśnięcie sesji** (access token po 1 h, refresh token unieważniony lub wygasły) | Access token odnawiany automatycznie przy odblokowanej sesji. Gdy odnowienie się nie uda, Supabase emituje `SIGNED_OUT` i usuwa sesję z magazynu; strażnik `gate` przechodzi do logowania. | SecureStore (przez adapter `removeItem`), RAM | Skarbiec PIN (po zalogowaniu hasłem PIN jest potwierdzany u serwera, bez ustawiania nowego) | Unieważnienie sesji w panelu Supabase (Auth → Users → Sign out) → odblokowanie PIN-em → ekran logowania |
| **Kopia zapasowa / nowe urządzenie** | Nic nie jest przenoszone: `allowBackup: false`, `SecureStore.xml` wykluczony z kopii i transferu D2D, klucz Keystore nieeksportowalny, Keychain `ThisDeviceOnly`. | Nie dotyczy | Nic. Na nowym urządzeniu: logowanie hasłem, kod z Google Authenticator (nowe urządzenie), potwierdzenie PIN-u u serwera. | `adb shell bmgr backupnow com.securebank.app` → brak danych SecureStore w kopii; iOS: przywrócenie kopii na innym urządzeniu → ekran logowania |
| **Zmiana hasła na serwerze** | **Docelowo:** po zmianie hasła `signOut({ scope: 'others' })` unieważnia refresh tokeny na pozostałych urządzeniach. Tam przy najbliższym odnowieniu tokena sesja jest usuwana jak przy wygaśnięciu. | Serwer Supabase Auth; na innych urządzeniach SecureStore | Skarbiec PIN na pozostałych urządzeniach (PIN nie zmienił się); bieżąca sesja na urządzeniu, z którego zmieniono hasło | Zmiana hasła na urządzeniu A → odblokowanie PIN-em na urządzeniu B → ekran logowania |
| **Zmiana PIN-u na innym urządzeniu** | Nic lokalnie do chwili odblokowania; wersja PIN-u w skarbcu (`pinVersion`) różni się od serwerowej | SecureStore (skarbiec przepisany po potwierdzeniu) | Sesja | Zmiana PIN-u na urządzeniu A → urządzenie B pokazuje „PIN został zmieniony na innym urządzeniu” i wymaga nowego PIN-u |
| **5 błędnych PIN-ów lub „Nie pamiętam PIN-u”** | Skarbiec PIN, licznik prób, klucz danych, sesja w SecureStore, refresh token na serwerze; przy blokadzie po stronie serwera także `user_pins` | SecureStore, RAM, serwer (`user_pins`, Supabase Auth) | Nic | 5 błędnych PIN-ów → ekran logowania; po zalogowaniu wymuszone ustawienie nowego PIN-u |

## Decyzje dotyczące zakresu wylogowania

| Akcja | Zakres `signOut` | Uzasadnienie |
| :--- | :--- | :--- |
| Pełne wylogowanie z ekranu PIN-u | `local` (docelowo, obecnie domyślny `global`) | Wylogowanie na telefonie nie powinno kończyć sesji na innych urządzeniach użytkownika |
| „Nie pamiętam PIN-u”, 5 błędnych PIN-ów | `global` | Możliwa próba odgadnięcia PIN-u przez osobę trzecią: kończymy wszystkie sesje |
| Zmiana hasła | `others` | Typowy powód zmiany hasła to podejrzenie przejęcia konta |

## Uwagi platformowe

* **iOS:** dane w Keychain przeżywają usunięcie aplikacji. Dlatego flaga pierwszego uruchomienia leży w zwykłym pliku w `documentDirectory`, który system usuwa razem z aplikacją, a nie w Keychain.
* **Android:** odinstalowanie usuwa `shared_prefs/SecureStore.xml` i alias w Keystore, więc reinstalacja zawsze zaczyna od ekranu logowania.
* **Blokada a wylogowanie:** przycisk „Wyloguj” w aplikacji natywnej blokuje aplikację (ekran PIN-u), a nie kończy sesji. Pełne wylogowanie jest dostępne z ekranu PIN-u. Zmiana etykiety przycisku na „Zablokuj” jest w zakresie K3.
