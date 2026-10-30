# SecureBank - Mobilna Aplikacja Bankowa

> Projekt realizowany w ramach przedmiotu **Bezpieczeństwo Aplikacji i Systemów Mobilnych (BAiSM)**  
> Politechnika Śląska · Wydział Automatyki, Elektroniki i Informatyki · Rok akademicki 2026/2027  
> Prowadzący: mgr inż. Mateusz Kawulok

---

## Karta Projektu (Zaktualizowana – Sekcja 2-osobowa)

### Informacje o sekcji
| Pole | Wartość |
| :--- | :--- |
| **Nazwa sekcji / aplikacji** | **SecureBank** |
| **Technologia** | **React Native (Expo / TypeScript)** |
| **Skład sekcji (2 osoby)** | **Jakub Dziewior**, **Jakub Wodyk** |
| **Link do repozytorium** | [https://github.com/jakubdziewior/SecureBank](https://github.com/jakubdziewior/SecureBank) |
| **Backend** | **Supabase (PostgreSQL + RLS + GoTrue Auth)** |

---

### 1. Koncepcja aplikacji
**SecureBank** to nowoczesna mobilna aplikacja bankowa umożliwiająca bezpieczne zarządzanie finansami osobistymi, realizację szybkich przelewów krajowych oraz ciągłą weryfikację historii transakcji. Rozwiązanie skierowane jest do klientów detalicznych i rozwiązuje problem braku prostego, a zarazem silnie zabezpieczonego (zgodnego ze standardem OWASP MASVS) portfela cyfrowego do codziennych rozliczeń.

* **Grupa docelowa:** Klienci indywidualni potrzebujący bezpiecznego dostępu do rachunku bankowego z poziomu smartfona (Android/iOS).
* **Temat startowy:** Mini-bank / portfel P2P.

---

### 2. Role użytkowników
W architekturze zdefiniowano dwie ścisłe role. Kolumna „Czego NIE może” stanowi bezpośrednią podstawę do testów reguł autoryzacji (Row Level Security w PostgreSQL oraz walidacji w aplikacji):

| Rola | Co może | Czego NIE może |
| :--- | :--- | :--- |
| **Klient** | <ul><li>Wykonywać przelewy krajowe (po autoryzacji biometrycznej/PIN).</li><li>Przeglądać wyłącznie własną historię transakcji i saldo.</li><li>Generować i pobierać potwierdzenia przelewów (PDF).</li><li>Modyfikować własne limity dzienne operacji.</li></ul> | <ul><li>Mieć dostępu do profili, kont i sald innych użytkowników (ochrona BOLA/IDOR).</li><li>Cofać zrealizowanych przelewów z pominięciem procedury reklamacyjnej.</li><li>Modyfikować logów systemowych (audit log) ani statusów blokad.</li><li>Nadawać sobie uprawnień administracyjnych.</li></ul> |
| **Administrator (pracownik banku)** | <ul><li>Blokować i odblokowywać konta podejrzane o oszustwo (flaga fraudowa).</li><li>Resetować uwierzytelnianie dwuskładnikowe (2FA/biometria) na formalny wniosek klienta.</li><li>Przeglądać oflagowane transakcje i raporty analityczne.</li></ul> | <ul><li>Zlecać przelewów w imieniu klienta.</li><li>Odczytywać haseł klientów (hasła hashowane przez bcrypt/Argon2 po stronie Supabase Auth).</li><li>Wyłączać globalnych zabezpieczeń i reguł RLS bez audytu.</li><li>Podglądać prywatnych kluczy kryptograficznych klientów.</li></ul> |

---

### 3. Dane i ich klasyfikacja
Wszystkie dane przetwarzane przez aplikację podlegają rygorystycznej polityce klasyfikacji informacji:

| Dane | Skąd pochodzą | Gdzie są przechowywane | Klasyfikacja | Minimalna ochrona / Uzasadnienie |
| :--- | :--- | :--- | :--- | :--- |
| **Dane osobowe (Imię, nazwisko, PESEL, adres)** | Rejestracja / KYC | Backend (Baza danych PostgreSQL) | **Szczególnie wrażliwe** | Zgodność z RODO i tajemnicą bankową. Brak przechowywania lokalnego na urządzeniu; dostęp wyłącznie dla właściciela przez RLS. |
| **Tokeny sesji (JWT Access & Refresh Token)** | Supabase Auth (po logowaniu) | Urządzenie (magazyn bezpieczny) + Backend | **Poufne** | Kradzież tokena umożliwia przejęcie tożsamości użytkownika. Wymagany bezpieczny magazyn sprzętowy (`react-native-keychain` / `SecureStore` - Android Keystore / iOS Keychain), wykluczenie `AsyncStorage`. |
| **Historia transakcji i saldo konta** | Baza danych (operacje finansowe) | Backend (PostgreSQL) + krótkotrwały cache w pamięci RAM | **Szczególnie wrażliwe** | Stanowią tajemnicę bankową; określają stan majątkowy klienta. Zakaz trwałego cache'owania w nieszyfrowanych plikach lokalnych. |
| **Regulamin banku, kursy walut i tabele opłat** | Administracja / NBP API | Backend / Serwery zewnętrzne | **Publiczne** | Dane ogólnodostępne, niewymagające uwierzytelnienia. Wymagana jedynie weryfikacja integralności (HTTPS/TLS) przed wyświetleniem w WebView. |

---

### 4. Mapowanie na umowę o powierzchni ataku

| Wymagana funkcja | Jak realizujemy ją w SecureBank | Obszar MASVS | Planowane zajęcia |
| :--- | :--- | :--- | :---: |
| **Logowanie z tokenami i co najmniej dwie role** | Integracja Supabase GoTrue Auth generującego tokeny JWT (Access + Refresh Token) z claims definiującymi rolę (`client` vs `admin`). | MASVS-AUTH | Z2 / Z3 |
| **Własny backend z regułami dostępu (RLS)** | Baza PostgreSQL w Supabase z bezwzględnie włączonym RLS (`ENABLE ROW LEVEL SECURITY`) dla tabel `profiles`, `accounts`, `transactions`, `audit_logs`. | MASVS-AUTH / MASVS-NETWORK | Z2 / Z3 |
| **Lokalne dane wrażliwe (tokeny, cache)** | Przechowywanie tokenów uwierzytelniających z użyciem `react-native-keychain` / `expo-secure-store` w oparciu o sprzętowy Keystore (Android) i Keychain Services (iOS). | MASVS-STORAGE / MASVS-CRYPTO | Z4 |
| **Trzy uprawnienia systemowe** | 1. **Biometria** (Face ID / Fingerprint) do autoryzacji operacji.<br>2. **Aparat** (skanowanie kodów QR przelewów).<br>3. **Pliki/Pamięć** (zapis wyciągów PDF z potwierdzeniem). | MASVS-PLATFORM | Z3 / Z9 |
| **Deep link / Universal link** | Obsługa custom URL scheme `securebank://pay?recipient=...&amount=...` ze ścisłą walidacją sanitarną parametrów wejściowych i wymogiem autoryzacji biometrycznej przed wykonaniem. | MASVS-PLATFORM | Z9 |
| **WebView / treści zewnętrzne** | Wyświetlanie aktualności finansowych i regulaminów banku za pomocą komponentu WebView z wyłączonym niepotrzebnym dostępem do pamięci i zablokowanym `file://`. | MASVS-PLATFORM | Z9 |
| **Biometria jako opcja odblokowania** | Autoryzacja biometryczna (`react-native-biometrics` / `expo-local-authentication`) z kluczem kryptograficznym chronionym biometrią w Secure Enclave / TEE. | MASVS-AUTH / MASVS-CRYPTO | Z4 / Z6 |

---

### 5. Architektura systemu
Główne komponenty systemu i kanały komunikacji:
* **Aplikacja mobilna (React Native):** Warstwa prezentacji, bezpieczny magazyn lokalny, obsługa biometrii, kamera, WebView, obsługa deep linków.
* **Backend BaaS (Supabase):** Silnik uwierzytelniania GoTrue, API REST (PostgREST), Edge Functions do walidacji przelewów.
* **Baza Danych (PostgreSQL):** Relacyjna baza z regułami RLS, procedurami składowanymi i niezmiennymi logami audytowymi (`audit_logs`).
* **Usługi zewnętrzne:** NBP Web API (kursy walut do przelewów zagranicznych) pobierane przez szyfrowany kanał HTTPS.

---

### 6. Podział ról w zespole (Sekcja 2-osobowa)

| Osoba | Główna odpowiedzialność techniczna | Odpowiedzialność za bezpieczeństwo (Standard MASVS) |
| :--- | :--- | :--- |
| **Jakub Dziewior** | **Backend, Bezpieczeństwo Sieciowe i Uwierzytelnianie:**<br>• Konfiguracja i integracja instancji Supabase (Auth, Database, Storage).<br>• Projekt schematu bazy danych PostgreSQL i implementacja restrykcyjnych polityk RLS.<br>• Implementacja przepływu tokenów JWT, odświeżania sesji oraz ról użytkowników (`client`/`admin`).<br>• Projekt i weryfikacja zapytań API oraz logów audytowych. | **MASVS-AUTH** (Uwierzytelnianie i autoryzacja)<br>**MASVS-NETWORK** (Bezpieczna komunikacja sieciowa, TLS)<br>**MASVS-CRYPTO** (Zabezpieczenia kryptograficzne po stronie serwera/bazy) |
| **Jakub Wodyk** | **Frontend, Interakcje Natywne i Bezpieczeństwo Urządzenia:**<br>• Projekt i implementacja UI/UX w React Native (TypeScript).<br>• Bezpieczna integracja magazynu lokalnego (`react-native-keychain` / `SecureStore`).<br>• Obsługa uprawnień systemowych (Biometria, Aparat/QR, Zapis plików PDF).<br>• Bezpieczna implementacja Deep Linków (`securebank://pay`) oraz izolowanego komponentu WebView. | **MASVS-PLATFORM** (Interakcje z platformą mobilną, IPC, uprawnienia)<br>**MASVS-STORAGE** (Bezpieczne przechowywanie danych na urządzeniu) |

---

### 7. Plan dojścia do MVP (Zajęcia 5)
* **Zajęcia 2 (Dzisiaj):** Inicjalizacja szkieletu aplikacji React Native (budującego się i uruchamialnego), konfiguracja Supabase, pierwszy ekran logowania, stworzenie Threat Modelu (DFD + Tabela STRIDE) oraz wypełnienie Arkusza Sekcji.
* **Zajęcia 3 (Model bezpieczeństwa platform):** Obsługa uprawnień systemowych, logowanie i rejestracja z rolami, obsługa JWT i wstępne polityki RLS w PostgreSQL.
* **Zajęcia 4 (Bezpieczne przechowywanie danych):** Wdrożenie bezpiecznego magazynu (Hardware Keystore/Keychain), eliminacja nieszyfrowanego cache, autoryzacja biometryczna do odblokowania sesji.
* **Zajęcia 5 (MVP):** Kompletna, działająca aplikacja z realizacją przelewów, historią transakcji, rolami Klient/Admin, walidacją deep linków i pełnym raportem weryfikacji.

---

### 8. Największe ryzyko według sekcji
1. **Błędna lub zbyt pobłażliwa konfiguracja polityk RLS w bazie PostgreSQL (Supabase):** Bezpośredni dostęp z aplikacji mobilnej do API PostgREST bez właściwych reguł RLS może umożliwić atak typu BOLA/IDOR i nieuprawniony odczyt lub modyfikację transakcji obcych klientów.
2. **Niewłaściwa walidacja parametrów Deep Linku (`securebank://pay`):** Ryzyko wymuszenia nieautoryzowanego przelewu przez złośliwą aplikację zainstalowaną na tym samym urządzeniu bez dodatkowej weryfikacji tożsamości użytkownika.
3. **Niezabezpieczone przechowywanie tokenów JWT na urządzeniu:** Zapisanie tokenów sesji w domyślnym `AsyncStorage` (zwykły plik XML/JSON na dysku), co przy zrootowanym urządzeniu lub błędach uprawnień prowadzi do natychmiastowego przejęcia konta.

---

## Uruchomienie projektu

```bash
# 1. Instalacja zależności
npm install

# 2. Skonfigurowanie zmiennych środowiskowych
# Skopiuj .env.example do .env i uzupełnij dane swojego projektu Supabase:
# EXPO_PUBLIC_SUPABASE_URL=https://twoj-projekt.supabase.co
# EXPO_PUBLIC_SUPABASE_ANON_KEY=twoj-anon-key

# 3. Uruchomienie aplikacji w trybie deweloperskim
npx expo start
```
