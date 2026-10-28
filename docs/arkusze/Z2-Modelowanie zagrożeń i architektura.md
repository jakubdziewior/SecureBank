# Arkusz sekcji – „Jak to dotyczy naszej aplikacji?”

## Nagłówek

| Pole | Wartość |
| :--- | :--- |
| **Sekcja / aplikacja** | SecureBank |
| **Technologia** | React Native (TypeScript) |
| **Zajęcia nr** | 2 |
| **Temat zajęć** | Modelowanie zagrożeń i architektura |
| **Obszar MASVS** | MASVS-AUTH, MASVS-STORAGE, MASVS-NETWORK, MASVS-PLATFORM |
| **Osoby obecne** | Jakub Dziewior, Jakub Wodyk |

---

## 0. Status z poprzedniego tygodnia

| Zadanie | Status | Dowód |
| :--- | :---: | :--- |
| Utworzenie repozytorium projektu na GitHubie | zrobione | Repozytorium: https://github.com/jakubdziewior/SecureBank |
| Dodanie wypełnionej i zaktualizowanej Karty Projektu do README.md | zrobione | Plik `README.md` w katalogu głównym repozytorium zawierający pełną kartę projektu dla 2-osobowej sekcji, podział ról, klasyfikację danych i umowę o powierzchni ataku. |
| Uruchomienie bazowego szkieletu aplikacji React Native z połączeniem do Supabase | zrobione | Kod źródłowy w `App.tsx`, `src/services/supabase.ts`, `src/screens/LoginScreen.tsx`; poprawna weryfikacja połączenia klienta Supabase przez HTTPS; plik `package.json` z konfiguracją. |

---

## 1. Gdzie to zagrożenie występuje u nas?

| Miejsce w aplikacji (zgodne z DFD) | Jakie dane lub funkcja są zagrożone | Klasyfikacja danych |
| :--- | :--- | :--- |
| **Magazyn lokalny (Keystore/Keychain) / Moduł sesji** | Tokeny sesji JWT (Access Token i Refresh Token) używane do autoryzacji zapytań do bazy danych. | **Poufne** |
| **Baza danych PostgreSQL / Backend API** | Historia transakcji, salda rachunków oraz dane osobowe klientów (Imię, Nazwisko, PESEL) – ryzyko podatności BOLA/IDOR przy braku RLS. | **Szczególnie wrażliwe** |
| **Kanał sieciowy HTTPS (Internet)** | Wszystkie zapytania API (poświadczenia logowania, zlecenia przelewów, pobieranie historii) – ryzyko podsłuchu w sieci otwartej. | **Poufne / Szczególnie wrażliwe** |
| **Obsługa Deep Linków (`securebank://pay`)** | Parametry zlecenia przelewu (rachunek odbiorcy, kwota) – ryzyko wstrzyknięcia parametrów przez złośliwą aplikację trzecią. | **Szczególnie wrażliwe** |
| **Aplikacja mobilna / Komponent WebView** | Integralność prezentowanych treści regulaminu, ryzyko ataku XSS i próby wycieku tokena sesji przez mostek JS-Native. | **Publiczne** (treść) / **Poufne** (kontekst sesji) |

---

## 2. Co już mamy?

* **Wymuszone szyfrowanie kanału sieciowego (TLS 1.3 / HTTPS):** Cała komunikacja z Supabase GoTrue Auth oraz PostgREST API odbywa się wyłącznie za pośrednictwem szyfrowanych endpointów HTTPS.
* **Brak sekretów uprzywilejowanych w aplikacji:** W aplikacji używany jest wyłącznie klucz publiczny `anon-key` o minimalnych uprawnieniach; klucz administracyjny `service_role` został całkowicie wykluczony z kodu klienta.
* **Przygotowany schemat bazy PostgreSQL z RLS:** Przygotowano skrypt SQL w `supabase/schema.sql` definiujący tabele `profiles`, `accounts`, `transactions` i `audit_logs` z bezwzględnym wymuszeniem `ENABLE ROW LEVEL SECURITY`.
* **Hardware-backed Storage:** Zaimplementowano adapter `SecureStoreAdapter` w `src/services/supabase.ts` wykorzystujący `expo-secure-store` ze sprzętowym kluczem dostępu po pierwszym odblokowaniu urządzenia (`AFTER_FIRST_UNLOCK`).
* **Modułowa struktura projektu:** Wyodrębniono warstwy `services/`, `screens/`, `theme/`, `types/` oraz katalog dokumentacji bezpieczeństwa `docs/threat-model/`.

---

## 3. Czego brakuje?

| Luka / zagrożenie | Gdzie | Ryzyko | Dlaczego takie ryzyko |
| :--- | :--- | :---: | :--- |
| **Ryzyko składowania tokenów w nieszyfrowanym pamiętniku podręcznym** | Magazyn lokalny aplikacji | **Wysokie** | Użycie domyślnego `AsyncStorage` zapisałoby tokeny jawnym tekstem. Na zrootowanym telefonie lub przez backup malware może natychmiast wykraść token sesji i przejąć konto. |
| **Brak weryfikacji polityk RLS na żywej instancji bazy** | Baza danych PostgreSQL | **Wysokie** | PostgREST udostępnia bezpośrednie API SQL-over-HTTP. Bez restrykcyjnych polityk RLS każdy zalogowany użytkownik mógłby pobrać całą tabelę `transactions` obcych klientów (BOLA/IDOR). |
| **Brak walidacji i autoryzacji biometrycznej przy Deep Linku** | Moduł Deep Link (`Linking`) | **Średnie** | Zagrożenie wymaga obecności złośliwej aplikacji na urządzeniu; jeśli link zainicjowałby przelew automatycznie, doszłoby do kradzieży środków w tle bez wiedzy użytkownika. |
| **Brak izolacji i sanityzacji komponentu WebView** | Komponent WebView | **Średnie** | Wczytanie zewnętrznej strony z włączonym JavaScriptem i dostępem do pamięci stwarza ryzyko XSS i prób naruszenia piaskownicy aplikacji. |

---

## 4. Jak to rozwiązuje nasza platforma?

| Mechanizm / biblioteka | Do czego go użyjemy | Pułapki i ograniczenia |
| :--- | :--- | :--- |
| **expo-secure-store / react-native-keychain** | Bezpieczne przechowywanie tokenów sesji JWT przy użyciu sprzętowego Android Keystore i iOS Keychain Services. | **Pułapka:** Domyślne wykorzystanie nieszyfrowanego `AsyncStorage`. Dodatkowo w Android Keystore trzeba uważać na utratę kluczy po zmianie blokady ekranu (lock screen), jeśli nie skonfiguruje się odpowiednich flag. |
| **PostgreSQL Row Level Security (RLS) w Supabase** | Wymuszenie kontroli dostępu na poziomie pojedynczych wierszy w bazie danych: `CREATE POLICY "accounts_select_own" ON accounts FOR SELECT USING (auth.uid() = user_id);`. | **Pułapka:** Zapomnienie o włączeniu RLS poleceniem `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` – w PostgreSQL tabela domyślnie pozwala na pełny dostęp rolom publicznym, jeśli RLS nie jest włączony. |
| **expo-local-authentication / Biometria** | Wymuszenie autoryzacji biometrycznej (odcisk palca / Face ID) przed wysłaniem zlecenia przelewu oraz przy odblokowaniu aplikacji. | **Pułapka:** Traktowanie wyniku biometrii jako prostej flagi logicznej `true/false`, którą można łatwo podmienić skryptem Frida w pamięci. Rozwiązaniem jest powiązanie biometrii z odblokowaniem klucza w sprzętowej enklawie. |
| **Konfiguracja WebView** | Bezpieczne wyświetlanie regulaminu banku: `allowFileAccess={false}`, `javaScriptEnabled={false}`, whitelist dozwolonych domen HTTPS. | **Pułapka:** Włączenie `allowUniversalAccessFromFileURLs` lub wstrzykiwanie wrażliwych obiektów z tokenami sesji do globalnego kontekstu `window`. |

---

## 5. Plan na kolejny tydzień

| Zadanie | Osoba | Jak udowodnimy, że działa | Pozycja w checkliście MASVS |
| :--- | :---: | :--- | :---: |
| Konfiguracja uwierzytelniania Supabase Auth (rejestracja i logowanie) oraz obsługa ról użytkownika (`client`, `admin`) w JWT | Jakub Dziewior | Działające logowanie w aplikacji, konsola Supabase pokazująca wygenerowany token JWT z poprawnym `role`, testowe zapytanie odrzucające żądanie bez tokena. | MASVS-AUTH-1, MASVS-AUTH-2 |
| Wdrożenie i weryfikacja reguł RLS dla tabeli `profiles` i `accounts` w PostgreSQL | Jakub Dziewior | Test zapytania SQL z tokenem Klienta A próbujący odczytać dane Klienta B – serwer musi zwrócić pusty wynik lub błąd 403 Forbidden. | MASVS-AUTH-2 |
| Zbudowanie formularza logowania i rejestracji w UI React Native z walidacją wejścia | Jakub Wodyk | Zrzut ekranu działającego interfejsu logowania, walidacja formatu e-mail i siły hasła, blokada wysyłania niepoprawnych danych. | MASVS-PLATFORM-1 |
| Implementacja wstępnej obsługi uprawnień natywnych (biometria) i bezpiecznego zapisu tokena | Jakub Wodyk | Kod weryfikujący dostępność biometrii na urządzeniu oraz zapis i odczyt tokena sesji w `expo-secure-store` (brak wpisów w `AsyncStorage`). | MASVS-STORAGE-1 |
