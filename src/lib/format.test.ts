import { describe, it, expect } from "vitest";
import { formatBytes, formatUptime, usageIntent } from "./format";

describe("formatBytes", () => {
    it("formats sub-kilobyte values as whole bytes", () => {
        expect(formatBytes(512)).toBe("512 B");
    });

    it("formats kilobytes with one decimal place", () => {
        expect(formatBytes(1536)).toBe("1.5 KB");
    });

    it("formats gigabytes correctly", () => {
        expect(formatBytes(42949672960)).toBe("40.0 GB");
    });

    it("returns '0 B' for zero, negative, or non-finite input", () => {
        expect(formatBytes(0)).toBe("0 B");
        expect(formatBytes(-100)).toBe("0 B");
        expect(formatBytes(NaN)).toBe("0 B");
        expect(formatBytes(Infinity)).toBe("0 B");
    });
});

describe("formatUptime", () => {
    it("formats multi-day uptime as days and hours", () => {
        expect(formatUptime(13 * 86400 + 4 * 3600)).toBe("13d 4h");
    });

    it("formats sub-day uptime as hours and minutes", () => {
        expect(formatUptime(4 * 3600 + 2 * 60)).toBe("4h 2m");
    });

    it("formats sub-hour uptime as minutes only", () => {
        expect(formatUptime(15 * 60)).toBe("15m");
    });

    it("returns an em dash for negative or non-finite input", () => {
        expect(formatUptime(-1)).toBe("—");
        expect(formatUptime(NaN)).toBe("—");
    });
});

describe("usageIntent", () => {
    it("returns danger at or above 90%", () => {
        expect(usageIntent(90)).toBe("danger");
        expect(usageIntent(99)).toBe("danger");
    });

    it("returns warning between 70% and 90%", () => {
        expect(usageIntent(70)).toBe("warning");
        expect(usageIntent(89.9)).toBe("warning");
    });

    it("returns success below 70%", () => {
        expect(usageIntent(0)).toBe("success");
        expect(usageIntent(69.9)).toBe("success");
    });
});
