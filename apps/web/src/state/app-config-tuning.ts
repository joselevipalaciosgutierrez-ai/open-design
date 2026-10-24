import type { AppConfigTuningKey, AppConfigTuningResponse } from '@open-design/contracts';

/** What the tuning preferences are set to and what applies now; null when the daemon cannot be read. */
export async function fetchAppConfigTuning(): Promise<AppConfigTuningResponse | null> {
  try {
    const res = await fetch('/api/app-config/tuning');
    if (!res.ok) return null;
    return (await res.json()) as AppConfigTuningResponse;
  } catch {
    return null;
  }
}

/** `PUT /api/app-config` merges per key, so sending only this one leaves the rest as they were. */
export async function saveAppConfigTuningValue(key: AppConfigTuningKey, value: number): Promise<boolean> {
  try {
    const res = await fetch('/api/app-config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Removes the stored value so the daemon's default applies again. */
export async function restoreAppConfigTuningDefault(key: AppConfigTuningKey): Promise<boolean> {
  try {
    const res = await fetch(`/api/app-config/${encodeURIComponent(key)}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}
