# Medilog mobile (Expo)

The user-testing version of Medilog, for real people logging real symptoms on their own phones. It uses the same engine as the web investor demo (`../packages/engine`), so extraction, follow-up questions, red-flag rules and appointment reports behave identically.

**Stack:** Expo SDK 58, React Native 0.88, Expo Router, TypeScript.

## What's in it

- **Onboarding.** Explains what Medilog is and isn't, the privacy model, and the emergency number. Records consent for the beta and optionally takes a name and date of birth (used only on the doctor's one-pager). Testers can choose to start with the sample patient instead.
- **Log.** Tap the mic and speak, or type. The note is structured on the phone and the app asks one follow-up with tap-to-answer pills. Red-flag phrases open a full-screen emergency screen with a one-tap call to 000, 911, or a crisis line.
- **Timeline.** A 30-day severity chart with period markers. Tap any tag to correct it. Individual entries can be deleted.
- **Appointment.** A 60-second opener (with read-aloud practice) and the doctor's one-pager, shared as an A4 PDF through the system share sheet (email, AirDrop, print, Files). After a visit, a short card asks two pilot questions ("Did you feel heard?" and "Did your doctor use the summary?") and marks the date for "Since last visit".
- **Settings.** A daily reminder (a local notification), on-device-only voice, the emergency number, name and date of birth, data export as JSON, "Replace with sample patient", and "Delete all my data".

## Privacy model

| | How |
| --- | --- |
| Storage | SQLite encrypted with SQLCipher (`expo-sqlite`, `useSQLCipher: true`). A random 256-bit key is kept in the iOS Keychain or Android Keystore (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`). Android auto-backup is off. |
| Voice | `expo-speech-recognition` with `requiresOnDeviceRecognition` whenever the phone supports it. Otherwise it falls back to the platform's speech service, and the Log screen says so. With **Voice never leaves this phone** turned on, it falls back to typing instead. |
| Network | **None by default.** Notes are structured by the on-device engine. Cloud AI is only possible if the build sets `EXPO_PUBLIC_MEDILOG_RELAY_URL` *and* the user opts in. Even then, only de-identified text is sent. |
| Reminders | Local scheduled notifications. There is no push server and no device token. |

Journals are tied to the phone: the key is not backed up, so a journal restored onto a new phone can't be opened. The app detects this case and starts a fresh journal instead of failing.

## Run it

Use Node 20+ and run from this folder:

```bash
npm install
npx expo start          # then press w for a browser preview
```

The **browser preview** is for checking layouts only. It has no SQLCipher, so it stores data unencrypted in localStorage (`src/lib/vault.web.ts`) and shows that in Settings.

**Expo Go can't run this app.** SQLCipher and on-device speech are native modules that Expo Go doesn't include, so testing on a phone needs a **development build**:

```bash
npx eas-cli@latest login
npx eas-cli@latest build --profile development --platform ios     # or android
npx expo start --dev-client
```

Or build locally with `npx expo run:ios` / `npx expo run:android` if you have Xcode or Android Studio. The `ios/` and `android/` folders are generated on demand and never edited by hand.

## Getting it onto testers' phones

| Platform | Route |
| --- | --- |
| Android | `npx eas-cli@latest build --profile preview --platform android` produces an APK and an install link. Alternatively, upload a production build to a Google Play **internal testing** track (up to 100 testers, no review). |
| iOS | `npx eas-cli@latest build --profile production --platform ios`, then `npx eas-cli@latest submit -p ios`. Internal **TestFlight** testers (up to 100 people on your App Store Connect team) need no review. External testers (up to 10,000, via a public link) need Apple's Beta App Review first. |

Before the first iOS build you'll need an Apple Developer account. You'll also be asked the App Store export-compliance (encryption) question. The app uses standard encryption (SQLCipher/AES) to protect data on the device, so answer that question yourself (or with advice) rather than relying on a default. It is intentionally not pre-filled in `app.json`.

## Before real patients use it

- [ ] Replace `com.medilog.app` in `app.json` with your own bundle ID and package name.
- [ ] Publish a privacy policy (required by both stores, and expected under the Australian Privacy Act for health information) and link it from onboarding.
- [ ] Get clinical review of the red-flag rules (`packages/engine/src/redflags.ts`) and the onboarding safety wording.
- [ ] Decide how pilot feedback is collected. Today it stays on the phone and is only included in the user's own JSON export.
- [ ] Test on real devices: on-device speech availability varies by phone and language. Android may need the offline English model downloaded.

## Checks

```bash
npm run typecheck
npm run lint
```

These pass, and the app bundles for Android, iOS and web with `npx expo export`. The native builds have not yet been run on a physical device or simulator.
