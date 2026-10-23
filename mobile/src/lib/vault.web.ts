import type { Entry } from "@medilog/engine";
import type { VaultInfo } from "./vault";

// Browser preview only (`npx expo start --web`), used to check layouts on a
// laptop. SQLCipher has no web build, so this keeps data in plain
// localStorage and reports itself as unencrypted. Never ship this to users.

const PREFIX = "medilog-preview:";
const read = <T,>(k: string): T | null => {
  try {
    const raw = localStorage.getItem(PREFIX + k);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(PREFIX + k, JSON.stringify(v));
  } catch {
    /* storage blocked */
  }
};

export async function openVault(): Promise<VaultInfo> {
  return { encrypted: false, reset: false };
}
export async function loadEntries(): Promise<Entry[]> {
  return (read<Entry[]>("entries") ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export async function putEntry(e: Entry) {
  write("entries", [...(await loadEntries()).filter((x) => x.id !== e.id), e]);
}
export async function deleteEntry(id: string) {
  write("entries", (await loadEntries()).filter((x) => x.id !== id));
}
export async function replaceAllEntries(entries: Entry[]) {
  write("entries", entries);
}
export async function getValue<T>(key: string): Promise<T | null> {
  return read<T>(`kv:${key}`);
}
export async function setValue(key: string, value: unknown) {
  write(`kv:${key}`, value);
}
export async function wipeVault() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  } catch {
    /* storage blocked */
  }
}
