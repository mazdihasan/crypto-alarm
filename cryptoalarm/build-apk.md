# 📦 Building a Release APK — CryptoAlarm

> **Prerequisites**: Android Studio, JDK, and Android SDK installed.

---

## Step 1 — Generate a Release Keystore (One-Time Only)

Run this from inside the `android/` folder. **Save the keystore file and passwords somewhere safe** — you'll need them for every future release.

```powershell
cd E:\my-own-projects\crypto-alarm\cryptoalarm\android\app

keytool -genkeypair -v `
  -keystore release.keystore `
  -alias cryptoalarm `
  -keyalg RSA `
  -keysize 2048 `
  -validity 10000
```

You'll be asked for:
- **Keystore password** (pick a strong one, e.g. `MyAlarm@2026`)
- Your name, org, city, country — these can be anything
- **Key password** (can be same as keystore password)

---

## Step 2 — Add Signing Config to `gradle.properties`

Open `android/gradle.properties` and add these 4 lines at the **bottom** (replace with your actual passwords):

```properties
MYAPP_RELEASE_STORE_FILE=release.keystore
MYAPP_RELEASE_KEY_ALIAS=cryptoalarm
MYAPP_RELEASE_STORE_PASSWORD=MyAlarm@2026
MYAPP_RELEASE_KEY_PASSWORD=MyAlarm@2026
```

---

## Step 3 — Wire the Signing Config into `app/build.gradle`

In `android/app/build.gradle`, find the `signingConfigs` block (around line 100) and add a `release` entry:

```gradle
signingConfigs {
    debug {
        storeFile file('debug.keystore')
        storePassword 'android'
        keyAlias 'androiddebugkey'
        keyPassword 'android'
    }
    release {
        storeFile file(MYAPP_RELEASE_STORE_FILE)
        storePassword MYAPP_RELEASE_STORE_PASSWORD
        keyAlias MYAPP_RELEASE_KEY_ALIAS
        keyPassword MYAPP_RELEASE_KEY_PASSWORD
    }
}
```

Then update the `release` build type (around line 112) to use the release signing config:

```gradle
buildTypes {
    debug {
        signingConfig signingConfigs.debug
    }
    release {
        signingConfig signingConfigs.release   // <-- change this line
        shrinkResources false
        minifyEnabled false
        proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
    }
}
```

---

## Step 4 — Set Production Backend URL

Make sure `src/utils/api.ts` uses the production URL (already done ✅):

```ts
const BASE_URL = 'https://cryptoalarm-server.mazdi.dev/api';
```

---

## Step 5 — Build the Release APK

```powershell
cd E:\my-own-projects\crypto-alarm\cryptoalarm\android
.\gradlew.bat assembleRelease
```

Build time: ~2–4 minutes. You'll see `BUILD SUCCESSFUL` when done.

---

## Step 6 — Find Your APK

```
E:\my-own-projects\crypto-alarm\cryptoalarm\android\app\build\outputs\apk\release\app-release.apk
```

---

## Step 7 — Install on Device via USB

Make sure **USB Debugging** is enabled on your phone, then run:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb devices                          # confirm device is listed
& $adb install -r app\build\outputs\apk\release\app-release.apk
```

The `-r` flag reinstalls over any existing version.

---

## ⚠️ Important Notes

- **Never commit** `release.keystore` or the passwords in `gradle.properties` to git. Add both to `.gitignore`:
  ```
  android/release.keystore
  ```
- If you lose the keystore, you **cannot update** the app on devices that have the old version installed.
- The release APK does NOT connect to Metro bundler — it is fully standalone with the JS bundle baked in.
- If you change any native code (e.g. add a new library), you must rebuild the APK.
