import * as SecureStore from "expo-secure-store";

const KEY = "stoa_token";

// In-memory cache so every request doesn't hit the keychain.
let cached: string | null | undefined;

export async function getToken(): Promise<string | null> {
  if (cached === undefined) cached = await SecureStore.getItemAsync(KEY);
  return cached;
}

export async function setToken(token: string): Promise<void> {
  cached = token;
  await SecureStore.setItemAsync(KEY, token);
}

export async function clearToken(): Promise<void> {
  cached = null;
  await SecureStore.deleteItemAsync(KEY);
}
