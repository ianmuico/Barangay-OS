# Over-the-Air (OTA) Updates for the Mobile App

The mobile app uses **EAS Update** (Expo's update service, free tier is enough)
to push JavaScript/UI changes straight to phones — no reinstall, no Play Store.
Users just reopen the app (or tap **Account → Check for Updates**) and get the
new version.

**What OTA can ship:** any JS/TS change — screens, styling, logic, API calls.
**What OTA cannot ship:** native changes (new native packages, app.json plugin
changes, permission changes, Expo SDK upgrades). Those need a new APK build and
a bumped `version` in `app.json`.

The rule is enforced automatically by `runtimeVersion: { "policy": "appVersion" }`:
an update published from version `1.0.0` will only ever reach phones running the
`1.0.0` build. Phones on an older build simply keep working — they never receive
an incompatible update. This is the same safety idea as the desktop app's
additive-only DB migrations.

---

## One-time setup (~5 minutes, needs a free Expo account)

```bash
npm install -g eas-cli
cd mobile
eas login                 # create an account at expo.dev if you don't have one
eas init                  # links this app to your Expo account (writes projectId)
eas update:configure      # writes the updates URL + channels into app.json
git add -A && git commit  # commit the generated config
```

## Build the installable APK (once per native change)

```bash
cd mobile
eas build --platform android --profile preview
```

This builds in Expo's cloud (free tier) and gives you an APK link. Install that
APK on the barangay phones. The `preview` profile is tied to the **preview**
update channel (see `eas.json`) — every phone with this APK listens to that
channel.

> For a store-ready or production rollout, use `--profile production` (channel
> **production**) and keep test phones on preview.

## Push an update on air (the everyday flow)

Make any JS change, then:

```bash
cd mobile
eas update --branch preview --message "Describe the change"
```

That's it. Phones apply it the next time the app is opened (it downloads in the
background on launch, applies on the following restart), or immediately via
**Account → Check for Updates → Restart now**.

## Test the full loop

1. Do the one-time setup + build the APK, install it on a phone.
2. Open the app — note the version label in **Account → App updates**
   (it will say `v1.0.0 · embedded`).
3. Make a visible change (e.g. change a title in `app/login.tsx`).
4. `eas update --branch preview --message "test OTA"`
5. On the phone: **Account → Check for Updates** → it downloads → **Restart now**.
6. The change is live and the version label now shows `· OTA <id>`.

## Notes

- **Expo Go / `npx expo start` ignores OTA** — updates only apply to built
  APKs. In development the update card shows "dev" and the check explains this.
- **Rollback:** `eas update:republish` lets you re-publish a previous update
  group, or just `eas update` again with the fix. `eas update:list --branch preview`
  shows history.
- **When to build instead of update:** you add/remove a native dependency,
  change `app.json` plugins/permissions, or upgrade the Expo SDK. Bump
  `version` in `app.json`, rebuild, redistribute the APK.
- Resident data is never touched by updates — it lives in the desktop's SQLite
  database; the phone is just a client.
