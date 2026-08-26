import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Classes } from "@blueprintjs/core";
import { getStore } from "./store";
import { queryKeys } from "../domain/queryKeys";

export type ThemePreference = "system" | "light" | "dark";

export function useSystemDarkMode(): boolean {
    const [isDark, setIsDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
    useEffect(() => {
        const mql = window.matchMedia("(prefers-color-scheme: dark)");
        const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
        mql.addEventListener("change", handler);
        return () => mql.removeEventListener("change", handler);
    }, []);
    return isDark;
}

export function useThemePreference(): [ThemePreference, (pref: ThemePreference) => void] {
    const queryClient = useQueryClient();

    const { data: preference = "system" } = useQuery({
        queryKey: queryKeys.themePreference(),
        queryFn: async () => {
            const store = await getStore();
            const saved = await store.get<ThemePreference>("themePreference");
            return saved ?? "system";
        },
        staleTime: Infinity, // only ever changes via setPreference below, never by refetch
    });

    const setPreference = (pref: ThemePreference) => {
        queryClient.setQueryData(queryKeys.themePreference(), pref);
        getStore().then((store) => {
            store.set("themePreference", pref);
            store.save();
        });
    };

    return [preference, setPreference];
}

export function useEffectiveDarkMode(): boolean {
    const systemDark = useSystemDarkMode();
    const [preference] = useThemePreference();
    const isDark = preference === "system" ? systemDark : preference === "dark";

    // Dialog/Alert/Toaster render through a Portal straight into document.body,
    // outside the app-shell div where the dark class is normally applied — sync
    // it onto body too so every portaled overlay inherits dark mode as well.
    useEffect(() => {
        document.body.classList.toggle(Classes.DARK, isDark);
    }, [isDark]);

    return isDark;
}

