# TWA Release Signing

This Android shell can only open as a verified fullscreen TWA when these two things match:

1. The installed app is signed with the expected release certificate.
2. `/.well-known/assetlinks.json` contains that certificate fingerprint for `com.habitschool.app`.

## 1. Provide release signing locally

Copy the sample file and fill in the real keystore values:

```powershell
cd C:\SJ\antigravity\habitschool\android
Copy-Item release-signing.properties.example release-signing.properties
```

Supported keys:

```properties
storeFile=signing/habitschool-release.keystore
storePassword=REPLACE_ME
keyAlias=habitschool
keyPassword=REPLACE_ME
```

You can also provide the same values with environment variables:

- `HABITSCHOOL_ANDROID_STORE_FILE`
- `HABITSCHOOL_ANDROID_STORE_PASSWORD`
- `HABITSCHOOL_ANDROID_KEY_ALIAS`
- `HABITSCHOOL_ANDROID_KEY_PASSWORD`

`android/release-signing.properties` and `android/signing/` are gitignored.

## 2. Check the configured release signing

```powershell
cd C:\SJ\antigravity\habitschool\android
.\gradlew.bat printReleaseSigningStatus
```

Or run the consolidated readiness check from the repo root:

```powershell
cd C:\SJ\antigravity\habitschool
powershell -ExecutionPolicy Bypass -File .\android\scripts\Check-TwaReleaseReadiness.ps1
```

## 3. Compare the expected fingerprint with assetlinks

```powershell
cd C:\SJ\antigravity\habitschool
.\android\scripts\Sync-AssetLinks.ps1 -Mode check
```

If you also want to include the debug keystore for temporary internal testing:

```powershell
.\android\scripts\Sync-AssetLinks.ps1 -Mode check -IncludeDebugFingerprint
```

## 4. Write the updated assetlinks file

```powershell
cd C:\SJ\antigravity\habitschool
.\android\scripts\Sync-AssetLinks.ps1 -Mode write
```

That updates [assetlinks.json](/C:/SJ/antigravity/habitschool/.well-known/assetlinks.json).

## 5. Deploy hosting after assetlinks changes

```powershell
firebase deploy --only "hosting"
```

## 6. Build the signed Play release artifacts

```powershell
cd C:\SJ\antigravity\habitschool\android
.\gradlew.bat :app:bundleRelease :app:assembleRelease
```

Primary Play upload artifact:

- `android\app\build\outputs\bundle\release\app-release.aab`

Optional device-install artifact for manual verification:

- `android\app\build\outputs\apk\release\app-release.apk`

If release signing is missing, the build now fails fast with a clear message instead of silently producing the wrong artifact.
