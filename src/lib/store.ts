import { Store } from "@tauri-apps/plugin-store";

let storeInstance: Store | null = null;

export async function getStore(): Promise<Store> {
    if (!storeInstance) {
        storeInstance = await Store.load("settings.json");
    }
    return storeInstance;
}
