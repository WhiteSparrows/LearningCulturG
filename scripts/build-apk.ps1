# Compile l'APK de debug : npm run android:build
$root = Split-Path $PSScriptRoot -Parent
$android = Join-Path $root 'android'

if (-not $env:JAVA_HOME) { $env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr' }
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk" }

# L'analyse HTTPS d'Avast remplace les certificats par les siens, et Java ne connaît pas sa racine.
# On lui donne une copie de ses autorités habituelles, complétée de cette racine déjà approuvée par
# Windows. La copie reste dans android/.gradle (ignoré par Git) : la vérification TLS reste active
# et le JDK d'Android Studio n'est pas modifié.
$avast = Get-ChildItem Cert:\LocalMachine\Root, Cert:\CurrentUser\Root | Where-Object { $_.Subject -match 'Avast' } | Select-Object -First 1
if ($avast) {
  $dir = Join-Path $android '.gradle'
  New-Item -ItemType Directory -Force $dir | Out-Null
  $store = Join-Path $dir 'culturg-truststore.jks'
  $cer = Join-Path $dir 'avast-root.cer'
  Copy-Item (Join-Path $env:JAVA_HOME 'lib\security\cacerts') $store -Force
  [IO.File]::WriteAllBytes($cer, $avast.Export('Cert'))
  & (Join-Path $env:JAVA_HOME 'bin\keytool.exe') -importcert -noprompt -alias avast-root -file $cer -keystore $store -storepass changeit | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Output 'Echec de la preparation des certificats pour Java.'; exit 1 }
  Remove-Item $cer
  $env:JAVA_TOOL_OPTIONS = "-Djavax.net.ssl.trustStore=`"$store`" -Djavax.net.ssl.trustStorePassword=changeit"
}

Set-Location $root
& npx cap sync android
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Set-Location $android
& .\gradlew.bat assembleDebug --console=plain
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Output "APK genere : $android\app\build\outputs\apk\debug\app-debug.apk"
