param(
    [string]$Package = "com.securebank.app",
    [string]$OutDir = (Join-Path $PSScriptRoot "..\docs\testy\logi")
)

$ErrorActionPreference = "Stop"
$Permission = "android.permission.CAMERA"

function Step([string]$Text) {
    Write-Host ""
    Write-Host "== $Text" -ForegroundColor Cyan
}

function Get-AppPid {
    $value = (adb shell pidof $Package) 2>$null
    if ($value) { return $value.Trim() }
    return $null
}

function Get-CameraGrant {
    $line = adb shell dumpsys package $Package | Select-String -Pattern "$Permission`: granted=" | Select-Object -First 1
    if ($line) { return $line.ToString().Trim() }
    return "brak wpisu"
}

if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
    throw "Nie znaleziono adb. Dodaj Android SDK platform-tools do PATH."
}

$devices = adb devices | Select-String -Pattern "\tdevice$"
if (-not $devices) {
    throw "Brak podłączonego urządzenia lub emulatora (adb devices)."
}

$installed = adb shell pm list packages $Package
if (-not ($installed -match "package:$Package$")) {
    throw "Pakiet $Package nie jest zainstalowany. Zainstaluj development build (npx expo run:android lub EAS), nie Expo Go."
}

New-Item -ItemType Directory -Force $OutDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logFile = Join-Path $OutDir "pm-revoke-camera-$stamp.log"
$reportFile = Join-Path $OutDir "pm-revoke-camera-$stamp.txt"

Step "1. Przygotowanie: nadanie uprawnienia i wyczyszczenie logcat"
adb shell pm grant $Package $Permission
adb logcat -c
$grantBefore = Get-CameraGrant
Write-Host "Stan uprawnienia: $grantBefore"

Step "2. Uruchomienie aplikacji"
adb shell monkey -p $Package -c android.intent.category.LAUNCHER 1 | Out-Null
Write-Host "Zaloguj się PIN-em, otwórz 'Zleć przelew' i naciśnij 'Skanuj kod QR' (podgląd aparatu musi być widoczny)."
Read-Host "Naciśnij Enter, gdy skaner jest otwarty"

$pidBefore = Get-AppPid
Write-Host "PID aplikacji przed cofnięciem: $pidBefore"

Step "3. Cofnięcie uprawnienia w trakcie działania skanera"
adb shell pm revoke $Package $Permission
Start-Sleep -Seconds 3
$pidAfterRevoke = Get-AppPid
$grantAfter = Get-CameraGrant
Write-Host "PID po cofnięciu: $(if ($pidAfterRevoke) { $pidAfterRevoke } else { 'proces zakończony przez system' })"
Write-Host "Stan uprawnienia: $grantAfter"

Step "4. Ponowne uruchomienie i weryfikacja fallbacku"
adb shell monkey -p $Package -c android.intent.category.LAUNCHER 1 | Out-Null
Write-Host "Odblokuj aplikację, otwórz 'Zleć przelew' i naciśnij 'Skanuj kod QR'."
Write-Host "Oczekiwane: systemowe okno zgody. Wybierz 'Nie zezwalaj' -> baner 'Spróbuj ponownie' i aktywny formularz ręczny."
Write-Host "Następnie 'Spróbuj ponownie' i ponownie 'Nie zezwalaj' -> baner 'Otwórz ustawienia' (permanentlyDenied)."
Read-Host "Naciśnij Enter po wykonaniu kroków"
$pidRelaunch = Get-AppPid

Step "5. Zapis logów i ocena"
adb logcat -d -v threadtime | Out-File -Encoding utf8 $logFile

$crashPatterns = @(
    "FATAL EXCEPTION",
    "ANR in $Package",
    "Force finishing activity $Package",
    "Fatal signal"
)
$crashLines = Select-String -Path $logFile -Pattern $crashPatterns -SimpleMatch
$killLines = Select-String -Path $logFile -Pattern "permissions revoked", "permission revoked" -SimpleMatch
$appLines = Select-String -Path $logFile -Pattern "[SecureBank/CameraPermission]" -SimpleMatch

$noCrash = -not $crashLines
$revoked = $grantAfter -match "granted=false"
$relaunched = [bool]$pidRelaunch
$passed = $noCrash -and $revoked -and $relaunched

$report = @(
    "Test: cofnięcie uprawnienia CAMERA (pm revoke) - $stamp",
    "Pakiet: $Package",
    "Urządzenie: $((adb shell getprop ro.product.model).Trim()), Android $((adb shell getprop ro.build.version.release).Trim())",
    "",
    "Uprawnienie przed: $grantBefore",
    "Uprawnienie po:    $grantAfter",
    "PID przed: $pidBefore | PID po revoke: $(if ($pidAfterRevoke) { $pidAfterRevoke } else { '-' }) | PID po ponownym uruchomieniu: $pidRelaunch",
    "",
    "Zakończenie procesu przez system (oczekiwane, nie jest awarią):",
    ($killLines | ForEach-Object { "  " + $_.Line }),
    "",
    "Wpisy aplikacji [SecureBank/CameraPermission]:",
    ($appLines | ForEach-Object { "  " + $_.Line }),
    "",
    "Wpisy awarii (FATAL EXCEPTION / ANR / Fatal signal):",
    $(if ($crashLines) { $crashLines | ForEach-Object { "  " + $_.Line } } else { "  brak" }),
    "",
    "Wynik: $(if ($passed) { 'ZALICZONY' } else { 'NIEZALICZONY' })",
    "Pełny logcat: $logFile"
)
$report | Out-File -Encoding utf8 $reportFile
$report | ForEach-Object { Write-Host $_ }

if (-not $passed) { exit 1 }
