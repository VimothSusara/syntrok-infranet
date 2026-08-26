import { useEffect } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { getStore } from "./store";
import { showInfo } from "./toaster";

const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function useAutoUpdateCheck() {
    useEffect(() => {
        let cancelled = false;

        async function run() {
            const store = await getStore();
            const lastChecked = await store.get<number>("lastAutoUpdateCheckAt");
            const now = Date.now();

            if (lastChecked && now - lastChecked < AUTO_CHECK_INTERVAL_MS) {
                return;
            }

            await store.set("lastAutoUpdateCheckAt", now);
            await store.save();

            try {
                const update = await check();
                if (!cancelled && update) {
                    showInfo(`Version ${update.version} is available — see Settings to update.`);
                }
            } catch {
                // A failed background check shouldn't interrupt the user with an error
                // toast every launch (e.g. no internet at startup) — the manual
                // "Check for updates" button in Settings still surfaces errors,
                // since that's an explicit action expecting feedback.
            }
        }

        run();
        return () => {
            cancelled = true;
        };
    }, []);
}
