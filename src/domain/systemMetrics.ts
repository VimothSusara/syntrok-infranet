import { invoke } from "@tauri-apps/api/core";

interface ExecResult {
    stdout: string;
    stderr: string;
    exit_status: number;
}

export interface SystemMetrics {
    loadAverage: { load1: number; load5: number; load15: number };
    memory: { totalBytes: number; availableBytes: number };
    disk: { totalBytes: number; usedBytes: number; availableBytes: number };
    uptimeSeconds: number;
    raw: string;
}

const SECTION_MARKERS = ["---LOADAVG---", "---MEMINFO---", "---DISK---", "---UPTIME---"] as const;
type SectionMarker = (typeof SECTION_MARKERS)[number];

// Reads from /proc and a fixed df --output=, not free/df/uptime's human-formatted
// text — locale and column-width variation across distros is what makes the
// human-oriented commands fragile to parse; these sources are stable everywhere.
const METRICS_COMMAND = [
    "echo '---LOADAVG---'",
    "cat /proc/loadavg",
    "echo '---MEMINFO---'",
    "cat /proc/meminfo",
    "echo '---DISK---'",
    "df -B1 --output=size,used,avail / | tail -n1",
    "echo '---UPTIME---'",
    "cat /proc/uptime",
].join("; ");

export function splitSections(raw: string): Partial<Record<SectionMarker, string>> {
    const sections: Partial<Record<SectionMarker, string>> = {};
    let current: SectionMarker | null = null;
    let buffer: string[] = [];

    for (const line of raw.split("\n")) {
        const marker = SECTION_MARKERS.find((m) => line.trim() === m);
        if (marker) {
            if (current) sections[current] = buffer.join("\n");
            current = marker;
            buffer = [];
        } else if (current) {
            buffer.push(line);
        }
    }
    if (current) sections[current] = buffer.join("\n");
    return sections;
}

export function toNumber(value: string | undefined, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseLoadAvg(section: string) {
    const [load1, load5, load15] = section.trim().split(/\s+/);
    return { load1: toNumber(load1), load5: toNumber(load5), load15: toNumber(load15) };
}

export function parseMemInfo(section: string) {
    const values: Record<string, number> = {};
    for (const line of section.trim().split("\n")) {
        const match = line.match(/^(\w+):\s+(\d+)\s*kB/);
        if (match) values[match[1]] = Number(match[2]) * 1024;
    }
    return { totalBytes: values.MemTotal ?? 0, availableBytes: values.MemAvailable ?? 0 };
}

export function parseDisk(section: string) {
    const [size, used, avail] = section.trim().split(/\s+/);
    return { totalBytes: toNumber(size), usedBytes: toNumber(used), availableBytes: toNumber(avail) };
}

export function parseUptime(section: string): number {
    return toNumber(section.trim().split(/\s+/)[0]);
}

export async function getSystemMetrics(
    creds: { host: string; port: number; username: string; credentialKind: string; secret: string },
): Promise<SystemMetrics> {
    const result = await invoke<ExecResult>("ssh_exec", { ...creds, command: METRICS_COMMAND });
    const sections = splitSections(result.stdout);

    return {
        loadAverage: parseLoadAvg(sections["---LOADAVG---"] ?? ""),
        memory: parseMemInfo(sections["---MEMINFO---"] ?? ""),
        disk: parseDisk(sections["---DISK---"] ?? ""),
        uptimeSeconds: parseUptime(sections["---UPTIME---"] ?? ""),
        raw: result.stdout,
    };
}
