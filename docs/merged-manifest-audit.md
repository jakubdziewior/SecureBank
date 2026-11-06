# Raport z audytu scalonego manifestu (Merged Manifest)

| Pole | Wartość |
| :--- | :--- |
| **Aplikacja** | SecureBank (React Native, Expo SDK 58, TypeScript) |
| **Identyfikator pakietu** | `com.securebank.app` |
| **Odpowiedzialny** | Jakub Dziewior |
| **Wymagania standardu** | OWASP MASVS-PLATFORM-1, OWASP MASVS-STORAGE-1 |
| **Narzędzie audytu** | Expo Prebuild Config Evaluator (`npx expo config --type prebuild`) |

---

## 1. Cel audytu i metodyka

W nowoczesnych środowiskach mobilnych (takich jak React Native i Expo) ostateczny plik `AndroidManifest.xml` pakietu instalacyjnego APK powstaje w wyniku łączenia manifestów (`Manifest Merger`):
1. Manifestu głównego aplikacji (zdefiniowanego w `app.json`),
2. Manifestów bibliotek zewnętrznych zainstalowanych w `node_modules` (np. modułów kamery, pamięci, powiadomień, analityki).

Zgodnie z wytycznymi z zajęć (slajd 7: *„Biblioteki dopisują swoje – sprawdźcie i usuńcie zbędne”* oraz slajd 10: *„Android: ten sam manifest – dwa razy”*), celem audytu jest:
* Wykazanie, że aplikacja posiada **wyłącznie minimalny, autoryzowany zestaw uprawnień** (*Least Privilege*),
* Wykazanie skutecznego zablokowania niepożądanych uprawnień telemetrycznych (`READ_PHONE_STATE`) oraz zbędnego nagrywania dźwięku (`RECORD_AUDIO`),
* Wykazanie całkowitego wyeliminowania uprawnień do pamięci masowej (`READ/WRITE_EXTERNAL_STORAGE`) dzięki zastąpieniu ich systemowym Storage Access Framework,
* Weryfikacja flagi `allowBackup="false"` oraz reguł ekstrakcji danych.

---

## 2. Wynik weryfikacji uprawnień w scalonym manifeście

### 2.1. Uprawnienia autoryzowane (obecne w manifeście)

| Uprawnienie Android | Uzasadnienie biznesowe i techniczne | Zgodność z Kartą Projektu |
| :--- | :--- | :---: |
| `android.permission.INTERNET` | Wymagane do bezpiecznej komunikacji z backendem Supabase (PostgREST API, GoTrue Auth) przez szyfrowany kanał TLS 1.3 / HTTPS. | **Autoryzowane** |
| `android.permission.CAMERA` | Wymagane do działania skanera kodów QR przelewów (`expo-camera`). Prośba o uprawnienie następuje wyłącznie *in-time* po naciśnięciu przycisku skanowania w formularzu przelewu. | **Autoryzowane** |

---

### 2.2. Uprawnienia zablokowane i usunięte (`tools:node="remove"`)

Poniższe uprawnienia zostały trwale zablokowane w konfiguracji `app.json` za pomocą dyrektywy `blockedPermissions`, co wymusza usunięcie ich ze scalonego manifestu:

| Uprawnienie blokowane | Potencjalne źródło wstrzyknięcia | Powód zablokowania i mitygacja | Status w manifeście |
| :--- | :--- | :--- | :---: |
| `android.permission.READ_PHONE_STATE` | Biblioteki analityczne, crash-trackery lub starsze SDK sprzętowe | Uprawnienie umożliwia odczyt unikalnego numeru IMEI, stanu sieci i identyfikatora telefonu. W aplikacji bankowej stanowi krytyczne zagrożenie prywatności (MASVS-PRIVACY). | **Usunięte (`tools:node="remove"`)** |
| `android.permission.RECORD_AUDIO` | Domyślna zależność modułu kamery (`expo-camera` / CameraX) | Skaner kodów QR wymaga wyłącznie strumienia obrazu wideo. Dostęp do mikrofonu został jawnie wyłączony w pluginie (`microphonePermission: false`, `recordAudioAndroid: false`) oraz w `blockedPermissions`. | **Usunięte (`tools:node="remove"`)** |
| `android.permission.READ_EXTERNAL_STORAGE` | Standardowe pluginy obsługi plików w systemie Android $\le$ 12 | Zastąpione w 100% przez Storage Access Framework (`expo-sharing` / systemowy picker). Aplikacja nie żąda uprawnienia do odczytu całej pamięci współdzielonej urządzenia. | **Usunięte (`tools:node="remove"`)** |
| `android.permission.WRITE_EXTERNAL_STORAGE` | Standardowe pluginy obsługi plików w systemie Android $\le$ 9 | Wyciągi PDF są zapisywane w izolowanym katalogu podręcznym aplikacji (`cacheDirectory`) i przekazywane do systemowego okna udostępniania bez zapisu w nieszyfrowanych katalogach publicznych. | **Usunięte (`tools:node="remove"`)** |
| `android.permission.ACCESS_FINE_LOCATION` | Moduły lokalizacyjne | Aplikacja nie wymaga precyzyjnego śledzenia GPS. Do ochrony antyfraudowej i wyszukiwarki bankomatów wystarcza lokalizacja przybliżona (`COARSE`), a dokładna jest wykluczona. | **Nieobecne** |

---

## 3. Audyt konfiguracji znacznika `<application>`

Zgodnie z wymaganiami MASVS-STORAGE-1 i wytycznymi ze slajdów 10 i 11 sprawdzono właściwości kontenera aplikacji:

| Właściwość | Wartość w manifeście | Weryfikacja bezpieczeństwa |
| :--- | :---: | :--- |
| `android:allowBackup` | `false` | **Pozytywna:** Zablokowano możliwość tworzenia kopii zapasowej aplikacji za pomocą interfejsu ADB (`adb backup`) oraz systemowej kopii w chmurze Google Drive. |
| `android:dataExtractionRules` | `@xml/secure_store_data_extraction_rules` | **Pozytywna:** Reguły wygenerowane przez plugin `expo-secure-store` jawnie wykluczają plik prywatnych preferencji `SecureStore.xml` z transferu urządzenie-urządzenie na systemie Android 12+. |
| Architektura aktywności | Single-Activity (`MainActivity`) | **Pozytywna:** Jedyną wyeksportowaną aktywnością (`android:exported="true"`) jest `MainActivity` z filtrem intencji startowych `MAIN/LAUNCHER`. Żaden wewnętrzny ekran banku nie jest osobną aktywnością, co uniemożliwia ominięcie logowania przez intencję systemową (`adb shell am start`). |

---

## 4. Wygenerowana postać scalonego manifestu (Fragment kluczowy)

Poniżej przedstawiono postać manifestu wygenerowaną przez silnik scalania na podstawie konfiguracji `app.json`:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools"
    package="com.securebank.app">

    <!-- Minimalny autoryzowany zestaw uprawnień -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.CAMERA" />

    <!-- Skuteczne blokady uprawnień dopisywanych przez biblioteki zewnętrzne (tools:node="remove") -->
    <uses-permission android:name="android.permission.READ_PHONE_STATE" tools:node="remove" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" tools:node="remove" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" tools:node="remove" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" tools:node="remove" />

    <application
        android:name=".MainApplication"
        android:label="@string/app_name"
        android:icon="@mipmap/ic_launcher"
        android:allowBackup="false"
        android:dataExtractionRules="@xml/secure_store_data_extraction_rules"
        android:theme="@style/AppTheme">

        <!-- Jedyny punkt wejścia do aplikacji - architektura Single-Activity -->
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTask"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

    </application>
</manifest>
```

---

## 5. Podsumowanie audytu

1. **Zasada najmniejszych uprawnień:** Aplikacja wnioskuje w systemie Android wyłącznie o jedno uprawnienie sprzętowe (`CAMERA`) oraz standardowy dostęp sieciowy (`INTERNET`).
2. **Eliminacja podsłuchu i telemetrii:** Niebezpieczne uprawnienia `READ_PHONE_STATE` i `RECORD_AUDIO` zostały zablokowane i usunięte ze scalonego manifestu.
3. **Poufność pamięci podręcznej:** Wyeliminowano uprawnienia do zewnętrznej pamięci masowej, a kopia zapasowa piaskownicy `allowBackup` jest trwale wyłączona.
4. Wynik audytu potwierdza pełną zgodność z wymaganiem **MASVS-PLATFORM-1** oraz **MASVS-STORAGE-1**.
