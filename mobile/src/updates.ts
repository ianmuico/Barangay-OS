import * as Updates from 'expo-updates';
import Constants from 'expo-constants';

// Over-the-air updates via EAS Update. In Expo Go / dev the native updates
// module is disabled, so every call is guarded — the UI shows "dev mode".

export interface OtaResult {
  status: 'unavailable' | 'up-to-date' | 'updated' | 'error';
  message: string;
}

export function otaEnabled(): boolean {
  return Updates.isEnabled && !__DEV__;
}

export function currentVersionLabel(): string {
  const appVersion = Constants.expoConfig?.version || '1.0.0';
  // updateId is set once an OTA update has been applied; embedded builds have none
  const ota = Updates.updateId ? ` · OTA ${Updates.updateId.slice(0, 8)}` : ' · embedded';
  return `v${appVersion}${otaEnabled() ? ota : ' · dev'}`;
}

// Check → download → reload. Returns instead of throwing so callers can Alert.
export async function checkForOtaUpdate(): Promise<OtaResult> {
  if (!otaEnabled()) {
    return {
      status: 'unavailable',
      message: 'Updates only work in installed builds, not in Expo Go or development.',
    };
  }
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) {
      return { status: 'up-to-date', message: 'You already have the latest version.' };
    }
    await Updates.fetchUpdateAsync();
    return { status: 'updated', message: 'Update downloaded. The app will restart to apply it.' };
  } catch (e: any) {
    return { status: 'error', message: e?.message || 'Could not check for updates.' };
  }
}

export async function applyOtaUpdate(): Promise<void> {
  await Updates.reloadAsync();
}
