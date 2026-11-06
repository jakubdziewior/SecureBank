# Test cofnięcia uprawnienia aparatu (`pm revoke`)

| Pole | Wartość |
| :--- | :--- |
| **Wymaganie** | MASVS-PLATFORM-1 |
| **Osoba** | Jakub Wodyk |
| **Pakiet** | `com.securebank.app` |
| **Uprawnienie** | `android.permission.CAMERA` |
| **Skrypt** | `scripts/test-camera-revoke.ps1` |

## Cel

Wykazanie, że odebranie uprawnienia do aparatu w trakcie działania aplikacji (w tym przy otwartym podglądzie skanera QR) nie powoduje awarii, a po ponownym uruchomieniu aplikacja przechodzi w tryb formularza ręcznego zgodnie z tabelą uprawnień z arkusza Z3.

## Zachowanie platformy

Android po cofnięciu uprawnienia runtime kończy proces aplikacji (`ActivityManager: Killing <pid>:com.securebank.app ... : permissions revoked`). Jest to zachowanie systemu, a nie awaria aplikacji: w logcat nie pojawia się `FATAL EXCEPTION`, `ANR` ani `Fatal signal`. Po ponownym uruchomieniu aplikacja odczytuje aktualny stan uprawnienia i nie zakłada, że wcześniejsza zgoda nadal obowiązuje.

## Obsługa w kodzie

| Element | Plik | Zachowanie |
| :--- | :--- | :--- |
| Mapowanie stanu uprawnienia | `src/services/cameraPermission.ts` | `PermissionResponse` z `expo-camera` mapowany na `granted` / `undetermined` / `denied` / `permanentlyDenied` / `unavailable` (`canAskAgain: false` oznacza `permanentlyDenied`). Przy `permanentlyDenied` aplikacja nie wywołuje ponownie okna systemowego. |
| Prośba in-time | `src/components/TransferModal.tsx` | Okno zgody pojawia się dopiero po naciśnięciu „Skanuj kod QR” w formularzu przelewu. |
| `denied` | `TransferModal.tsx` | Baner z przyciskiem „Spróbuj ponownie”, formularz ręczny pozostaje aktywny. |
| `permanentlyDenied` | `TransferModal.tsx` | Baner z przyciskiem „Otwórz ustawienia” (`Linking.openSettings()`); po powrocie z ustawień z nadanym uprawnieniem skaner otwiera się automatycznie. |
| Cofnięcie w trakcie działania | `TransferModal.tsx` | Przy powrocie aplikacji na pierwszy plan (`AppState: active`) stan uprawnienia jest sprawdzany ponownie; brak zgody zamyka skaner i pokazuje baner. |
| Błąd inicjalizacji aparatu | `TransferModal.tsx` | `onMountError` zamyka skaner i pokazuje baner `unavailable`. |
| Dane z kodu QR | `src/services/transferQr.ts` | Treść kodu traktowana jako niezaufana: limit długości, format ZBP, kraj `PL`, suma kontrolna NRB, usunięcie znaków sterujących. Dane tylko wypełniają formularz, przelew wymaga zatwierdzenia przez użytkownika. |
| Logi | `cameraPermission.ts` | Każda zmiana stanu zapisywana jako `[SecureBank/CameraPermission] source=<źródło> status=<stan>` (tag logcat `ReactNativeJS`), bez danych przelewu. |

## Wymagania wstępne

1. Android SDK platform-tools (`adb`) w `PATH`.
2. Telefon z włączonym debugowaniem USB lub emulator.
3. Zainstalowany development build aplikacji (`npx expo run:android` albo EAS Build). Expo Go nie nadaje się do testu, bo uprawnienia należą wtedy do pakietu `host.exp.exponent`.

## Procedura

```powershell
powershell -ExecutionPolicy Bypass -File scripts\test-camera-revoke.ps1
```

| Krok | Działanie | Oczekiwany wynik |
| :---: | :--- | :--- |
| 1 | `adb shell pm grant com.securebank.app android.permission.CAMERA`, `adb logcat -c` | `CAMERA: granted=true` |
| 2 | Uruchomienie aplikacji, odblokowanie PIN-em, „Zleć przelew” → „Skanuj kod QR” | Podgląd aparatu widoczny |
| 3 | `adb shell pm revoke com.securebank.app android.permission.CAMERA` | `CAMERA: granted=false`, proces zakończony przez system z adnotacją `permissions revoked`, brak `FATAL EXCEPTION` |
| 4a | Ponowne uruchomienie, „Skanuj kod QR”, „Nie zezwalaj” | Baner `denied` z „Spróbuj ponownie”, formularz ręczny aktywny, log `status=denied` |
| 4b | „Spróbuj ponownie”, ponownie „Nie zezwalaj” | Baner `permanentlyDenied` z „Otwórz ustawienia”, brak kolejnych okien systemowych, log `status=permanentlyDenied` |
| 4c | Ręczne wypełnienie i zatwierdzenie przelewu | Przelew zapisany ze statusem `pending` |
| 5 | Zapis `adb logcat -d` i analiza | Raport `docs/testy/logi/pm-revoke-camera-<data>.txt` z wynikiem `ZALICZONY` |

Skrypt zapisuje pełny logcat (`.log`) oraz raport (`.txt`) w `docs/testy/logi/`. Kryterium zaliczenia: uprawnienie faktycznie cofnięte, brak wpisów awarii aplikacji, aplikacja ponownie uruchomiona.

## Wynik

| Data | Urządzenie / Android | Wynik | Raport |
| :--- | :--- | :---: | :--- |
| | | | |
