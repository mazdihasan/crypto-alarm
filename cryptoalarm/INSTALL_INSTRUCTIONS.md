# 📱 CryptoAlarm — Installation & Permissions Guide

This guide walks you through installing the **CryptoAlarm** release APK onto your Android device and configuring all required permissions so alarms ring loudly, vibrate, and display over the lock screen.

---

## 📦 APK File Location

The latest release APK is located at:
```
E:\my-own-projects\crypto-alarm\cryptoalarm\android\app\build\outputs\apk\release\app-release.apk
```

---

## 🚀 Step 1 — Installation Methods

### Option A: Install via USB Debugging (Fastest / Recommended)

1. Connect your Android phone to your PC via a USB cable.
2. Ensure **USB Debugging** is turned on in your phone's Developer Options:
   - *Settings > About Phone > Tap "Build Number" 7 times to enable Developer Options.*
   - *Settings > System (or Additional Settings) > Developer Options > Enable "USB Debugging".*
3. Open PowerShell on your computer and run:
   ```powershell
   $adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"

   # 1. Verify your phone is detected
   & $adb devices

   # 2. Install (the -r flag reinstalls over existing versions preserving data)
   & $adb install -r "E:\my-own-projects\crypto-alarm\cryptoalarm\android\app\build\outputs\apk\release\app-release.apk"
   ```
4. If you see `Success`, the app is installed!

> [!TIP]
> If ADB shows an install failure due to signature mismatch (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`), uninstall the previous version first:
> ```powershell
> & $adb uninstall dev.mazdi.cryptoalarm
> & $adb install "E:\my-own-projects\crypto-alarm\cryptoalarm\android\app\build\outputs\apk\release\app-release.apk"
> ```

---

### Option B: Sideload / Direct File Transfer

1. Copy `app-release.apk` to your phone:
   - Via USB cable file transfer (copy to phone's **Downloads** folder), OR
   - Upload to **Google Drive** / send via **Telegram** / **WhatsApp** to yourself and download it on your phone.
2. Open the **Files** or **File Manager** app on your phone and locate `app-release.apk`.
3. Tap on the APK file to install.
4. When prompted by Android:
   - Tap **Settings** and toggle ON **"Allow from this source"** (Install Unknown Apps).
   - Return and tap **Install**.

---

## 🔑 Step 2 — Mandatory First Launch

After installation, **open the CryptoAlarm app once**:
1. When prompted with **"Allow CryptoAlarm to send you notifications?"**, tap **Allow**.
2. Keep the app open for ~3 seconds while connected to the internet.
3. **Why this is essential**:
   - The app registers your device's unique FCM Push Token with the server.
   - It pre-registers the Android system Notification Channel (`Crypto Alarm`) with the bundled alarm sound and bypass Do Not Disturb rules.

---

## ⚙️ Step 3 — Lock Screen & Background Permissions

Modern Android versions and OEM systems (especially Xiaomi, Samsung, OPPO, Vivo) aggressively kill background apps and block background windows from waking the lock screen. Follow the instructions for your device brand below:

---

### 🔴 Xiaomi / Redmi / POCO (MIUI & HyperOS) — *CRITICAL*

Xiaomi devices block full-screen intents and popups by default unless explicitly granted.

1. **Enable Lock Screen & Pop-up Permissions**:
   - Open **Settings > Apps > Manage Apps > CryptoAlarm**.
   - Tap **Other permissions**:
     - ✅ **Show on Lock screen** ➔ Set to **"Always allow"** *(Mandatory for full-screen wake)*
     - ✅ **Display pop-up windows while running in the background** ➔ Set to **"Always allow"**
     - ✅ **Display pop-up window** ➔ Set to **"Always allow"**
     - ✅ **Permanent notification** ➔ Set to **"Always allow"**
2. **Enable Autostart**:
   - In the same App Info screen, toggle **Autostart** to **ON**.
3. **Disable Battery Restrictions**:
   - Scroll down to **Battery saver**.
   - Change from "MIUI Battery Saver" to **"No restrictions"** *(Prevents Xiaomi from killing the app in deep sleep)*.
4. **Lock Screen Notification Content**:
   - Go to **Settings > Notifications & Control Center > Lock screen**.
   - Ensure the toggle for **CryptoAlarm** is **ON**, and format is set to **"Show notification and content"**.

---

### 🔵 Samsung Galaxy (One UI)

1. **Disable Battery Optimization**:
   - Open **Settings > Apps > CryptoAlarm > Battery**.
   - Select **Unrestricted** (do not use "Optimized").
2. **Prevent Sleeping in Background**:
   - Go to **Settings > Battery and device care > Battery > Background usage limits**.
   - Tap **Never sleeping apps** > tap `+` > select **CryptoAlarm** > tap **Add**.
3. **Appear on Top**:
   - Go to **Settings > Apps > Special access** (top 3 dots) **> Appear on top**.
   - Find **CryptoAlarm** and toggle **ON**.
4. **Alarms & Reminders**:
   - Go to **Settings > Apps > Special access > Alarms & reminders**.
   - Ensure **CryptoAlarm** is toggled **ON**.

---

### ⚪ Google Pixel / Motorola / Stock Android (Android 11–15)

1. **Battery Optimization**:
   - Long press the **CryptoAlarm** app icon > tap **App Info (ℹ️)**.
   - Tap **App battery usage** (or Battery) > select **Unrestricted**.
2. **Display Over Other Apps**:
   - In App Info, tap **Display over other apps** > toggle **ON**.
3. **Full-Screen Intent (Android 14 & 15)**:
   - Go to **Settings > Apps > Special app access > Manage full screen intents**.
   - Ensure **CryptoAlarm** is toggled **ON**.
4. **Notification Channel Urgency**:
   - In App Info > **Notifications** > tap **Notification categories**.
   - Tap on **Crypto Alarm** (the text itself, not the toggle):
     - Ensure importance is set to **High** / **Urgent** (*Make sound and pop up on screen*).
     - Set Lock screen to **"Show all notification content"**.
     - Enable **Override Do Not Disturb**.

---

### 🟢 OPPO / Realme (ColorOS / Realme UI) & Vivo / iQOO (Funtouch OS)

1. **Auto-launch / Background Startup**:
   - **Settings > Apps > Auto-launch** (or App Management > Auto startup) > enable **CryptoAlarm**.
2. **Floating Windows**:
   - **Settings > Privacy > Special App Access > Display Over Other Apps** > enable **CryptoAlarm**.
3. **Battery**:
   - App Info > Battery > Allow background activity & Allow auto-start.
   - Disable background battery freezing.

---

## 🧪 Step 4 — How to Test the Lock Screen Alarm

1. Make sure your phone's **Alarm Volume** is turned up (press volume key > tap the 3 dots/slider for the clock alarm icon).
2. Open **CryptoAlarm** once and set a target price close to the market price (or trigger a test broadcast from your backend).
3. **Turn off your screen completely and leave the phone locked**.
4. When the target price is triggered:
   - 🚨 **Screen**: Screen will immediately light up and display the red pulsing alarm screen on top of the lock screen.
   - 🔊 **Sound**: Custom alarm sound (`alarm.mp3`) will ring continuously at alarm volume (even if phone is in silent/vibrate mode).
   - 📳 **Vibration**: Continuous pulsing vibration pattern.
5. Tap the big black **"STOP ALARM"** button:
   - The sound immediately silences.
   - Vibration stops.
   - The notification is dismissed cleanly.

---

## 🛠️ Troubleshooting Quick Reference

| Symptom | Cause | Solution |
| :--- | :--- | :--- |
| **Phone vibrates but makes no sound** | Alarm volume is muted in Android system volume panel. | Press Volume Up > tap 3 dots `...` > raise the **Alarm slider** (clock icon) to maximum. |
| **Notification chimes once but does not show full-screen UI** | "Show on Lock screen" or "Display over other apps" is blocked. | Follow **Step 3** above for your phone brand (enable *Show on Lock screen* & *Display over other apps*). |
| **Alarm works while app is open, but not after phone is locked for hours** | OEM battery saver put the app to sleep. | Set Battery Saver to **Unrestricted** / **No restrictions** and enable **Autostart** in Settings. |
| **Notification says "Crypto Alarm Triggered" with no sound** | Old notification channel was cached. | The app now uses `crypto_alarm_channel_v3`. Open the app once to register the new channel. |
