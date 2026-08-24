import type { DiscoveredCapabilities } from "./types";

export type CapabilityState = "unknown" | "available" | "unavailable";

export function parseCapabilities(metadata: string | null): DiscoveredCapabilities | null {
    if (!metadata) return null;

    try {
        const parsed = JSON.parse(metadata);
        if (
            typeof parsed?.systemd === "boolean" &&
            typeof parsed?.docker === "boolean" &&
            typeof parsed?.podman === "boolean" &&
            typeof parsed?.passwordlessSudo === "boolean"
        ) {
            return parsed as DiscoveredCapabilities;
        }
        return null;
    } catch {
        return null;
    }
}

export function getCapabilityState(
    capabilities: DiscoveredCapabilities | null,
    key: keyof DiscoveredCapabilities,
): CapabilityState {
    if (!capabilities) return "unknown";
    return capabilities[key] ? "available" : "unavailable";
}