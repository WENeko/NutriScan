import { describe, expect, it } from "vitest";
import { galleryMealTimestamp, parseExifLocalDate, parseImageScale } from "./captureScale";

function jpegDate(tag: number, text: string, nested = true) {
  const bytes = new Uint8Array(160);
  const v = new DataView(bytes.buffer);
  v.setUint16(0, 0xffd8); v.setUint16(2, 0xffe1); v.setUint16(4, 156);
  bytes.set([69, 120, 105, 102, 0, 0], 6);
  const t = 12;
  v.setUint16(t, 0x4949); v.setUint16(t + 2, 42, true); v.setUint32(t + 4, 8, true);
  v.setUint16(t + 8, 1, true);
  if (nested) {
    v.setUint16(t + 10, 0x8769, true); v.setUint16(t + 12, 4, true); v.setUint32(t + 14, 1, true); v.setUint32(t + 18, 26, true);
    v.setUint16(t + 26, 1, true);
  }
  const e = t + (nested ? 28 : 10);
  v.setUint16(e, tag, true); v.setUint16(e + 2, 2, true); v.setUint32(e + 4, 20, true); v.setUint32(e + 8, 60, true);
  bytes.set(new TextEncoder().encode(text + "\0"), t + 60);
  return bytes.buffer;
}
describe("gallery local timestamps", () => {
  it.each([0x9003, 0x9004, 0x0132])("reads EXIF date tag %i", tag => {
    expect(parseImageScale(jpegDate(tag, "2026:02:08 12:35:40", tag !== 0x0132)).capturedAt).toBe("2026-02-08T12:35");
  });
  it("rejects invalid calendar dates", () => {
    expect(parseExifLocalDate("2026:02:30 12:35:40")).toBeNull();
  });
  it("prefers original local time over file modification time", () => {
    const scale = parseImageScale(jpegDate(0x9003, "2026:02:08 12:35:40"));
    expect(galleryMealTimestamp(scale, Date.parse("2026-10-08T14:00:00Z"), new Date("2026-11-08T21:00:00Z"))).toBe("2026-02-08T12:35");
  });
  it("falls back to a valid past file date in local time", () => {
    const past = new Date(2026, 1, 8, 12, 35);
    expect(galleryMealTimestamp(null, past.getTime(), new Date(2026, 10, 8))).toBe("2026-02-08T12:35");
  });
  it("rejects unknown and future fallback dates", () => {
    expect(galleryMealTimestamp(null, 0)).toBeNull();
    expect(galleryMealTimestamp(null, Date.now() + 86400000)).toBeNull();
  });
  it("tolerates truncated JPEG metadata", () => {
    expect(parseImageScale(new Uint8Array([255, 216, 255, 225, 255, 255, 0]).buffer).capturedAt).toBeUndefined();
  });
});