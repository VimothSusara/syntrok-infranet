import { describe, it, expect } from "vitest";
import { splitSections, parseLoadAvg, parseMemInfo, parseDisk, parseUptime, toNumber } from "./systemMetrics";

describe("toNumber", () => {
    it("parses a valid numeric string", () => {
        expect(toNumber("42")).toBe(42);
        expect(toNumber("3.14")).toBeCloseTo(3.14);
    });

    it("falls back to the default on an invalid string", () => {
        expect(toNumber("not-a-number")).toBe(0);
        expect(toNumber("not-a-number", -1)).toBe(-1);
    });

    it("falls back to the default on undefined", () => {
        expect(toNumber(undefined)).toBe(0);
    });
});

describe("parseLoadAvg", () => {
    it("parses a real /proc/loadavg line", () => {
        expect(parseLoadAvg("0.08 0.05 0.01 1/234 5678")).toEqual({
            load1: 0.08,
            load5: 0.05,
            load15: 0.01,
        });
    });

    it("parses a heavily loaded system", () => {
        expect(parseLoadAvg("2.50 1.75 1.20 3/456 9999")).toEqual({
            load1: 2.5,
            load5: 1.75,
            load15: 1.2,
        });
    });

    it("defaults to zeros on empty input", () => {
        expect(parseLoadAvg("")).toEqual({ load1: 0, load5: 0, load15: 0 });
    });
});

describe("parseMemInfo", () => {
    const sample = `MemTotal:        8137792 kB
MemFree:         2076544 kB
MemAvailable:    5670000 kB
Buffers:          145200 kB
Cached:          1823456 kB
SwapCached:            0 kB`;

    it("extracts MemTotal and MemAvailable, converted from kB to bytes", () => {
        expect(parseMemInfo(sample)).toEqual({
            totalBytes: 8137792 * 1024,
            availableBytes: 5670000 * 1024,
        });
    });

    it("defaults availableBytes to 0 when MemAvailable is missing (older kernels lack it)", () => {
        const withoutAvailable = `MemTotal:        8137792 kB
MemFree:         2076544 kB`;
        expect(parseMemInfo(withoutAvailable)).toEqual({
            totalBytes: 8137792 * 1024,
            availableBytes: 0,
        });
    });

    it("returns zeros on empty input", () => {
        expect(parseMemInfo("")).toEqual({ totalBytes: 0, availableBytes: 0 });
    });
});

describe("parseDisk", () => {
    it("parses size/used/avail byte columns from df --output=", () => {
        expect(parseDisk("   42949672960  15032385536  25769803776")).toEqual({
            totalBytes: 42949672960,
            usedBytes: 15032385536,
            availableBytes: 25769803776,
        });
    });

    it("defaults to zeros on empty input", () => {
        expect(parseDisk("")).toEqual({ totalBytes: 0, usedBytes: 0, availableBytes: 0 });
    });
});

describe("parseUptime", () => {
    it("parses the seconds-up field, ignoring the idle field", () => {
        expect(parseUptime("1234567.89 987654.32")).toBeCloseTo(1234567.89);
    });

    it("returns 0 on empty input", () => {
        expect(parseUptime("")).toBe(0);
    });
});

describe("splitSections", () => {
    const combined = `---LOADAVG---
0.08 0.05 0.01 1/234 5678
---MEMINFO---
MemTotal:        8137792 kB
MemAvailable:    5670000 kB
---DISK---
   42949672960  15032385536  25769803776
---UPTIME---
1234567.89 987654.32`;

    it("splits a full combined command output into its four sections", () => {
        const sections = splitSections(combined);
        expect(sections["---LOADAVG---"]).toBe("0.08 0.05 0.01 1/234 5678");
        expect(sections["---MEMINFO---"]).toBe("MemTotal:        8137792 kB\nMemAvailable:    5670000 kB");
        expect(sections["---DISK---"]).toBe("   42949672960  15032385536  25769803776");
        expect(sections["---UPTIME---"]).toBe("1234567.89 987654.32");
    });

    it("gives an empty string for a section whose command produced no output", () => {
        const sparse = `---LOADAVG---
0.08 0.05 0.01 1/234 5678
---MEMINFO---
---DISK---
   42949672960  15032385536  25769803776
---UPTIME---
1234567.89 987654.32`;
        expect(splitSections(sparse)["---MEMINFO---"]).toBe("");
    });

    it("returns an empty object when no markers are present at all", () => {
        expect(splitSections("something went wrong, no markers here")).toEqual({});
    });

    it("matches markers even with surrounding whitespace on the line", () => {
        const withWhitespace = `  ---LOADAVG---  
0.08 0.05 0.01 1/234 5678`;
        expect(splitSections(withWhitespace)["---LOADAVG---"]).toBe("0.08 0.05 0.01 1/234 5678");
    });
});

describe("full pipeline — realistic combined SSH output end to end", () => {
    const combined = `---LOADAVG---
0.08 0.05 0.01 1/234 5678
---MEMINFO---
MemTotal:        8137792 kB
MemFree:         2076544 kB
MemAvailable:    5670000 kB
Buffers:          145200 kB
Cached:          1823456 kB
---DISK---
   42949672960  15032385536  25769803776
---UPTIME---
1234567.89 987654.32`;

    it("parses every section correctly from one combined command's output", () => {
        const sections = splitSections(combined);

        expect(parseLoadAvg(sections["---LOADAVG---"] ?? "")).toEqual({ load1: 0.08, load5: 0.05, load15: 0.01 });
        expect(parseMemInfo(sections["---MEMINFO---"] ?? "")).toEqual({
            totalBytes: 8137792 * 1024,
            availableBytes: 5670000 * 1024,
        });
        expect(parseDisk(sections["---DISK---"] ?? "")).toEqual({
            totalBytes: 42949672960,
            usedBytes: 15032385536,
            availableBytes: 25769803776,
        });
        expect(parseUptime(sections["---UPTIME---"] ?? "")).toBeCloseTo(1234567.89);
    });
});
