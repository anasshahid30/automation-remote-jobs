import { crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { inspectDocument, MAX_RESUME_SIZE } from "./documents";

// Stored ZIP entries with real CRCs; no document extraction or external binaries required.
function archive(
  names = ["[Content_Types].xml", "word/document.xml"],
  declaredSize?: number,
) {
  const parts: Buffer[] = [],
    directory: Buffer[] = [];
  let offset = 0;
  for (const name of names) {
    const filename = Buffer.from(name),
      contents = Buffer.from("<fixture/>");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc32(contents), 14);
    local.writeUInt32LE(contents.length, 18);
    local.writeUInt32LE(contents.length, 22);
    local.writeUInt16LE(filename.length, 26);
    parts.push(local, filename, contents);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt32LE(crc32(contents), 16);
    entry.writeUInt32LE(contents.length, 20);
    entry.writeUInt32LE(declaredSize ?? contents.length, 24);
    entry.writeUInt16LE(filename.length, 28);
    entry.writeUInt32LE(offset, 42);
    directory.push(entry, filename);
    offset += local.length + filename.length + contents.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(Buffer.concat(directory).length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...directory, end]);
}
describe("private document validation", () => {
  it("hashes bytes and sanitizes the client filename", () => {
    const file = inspectDocument(
      "C:\\documents\\fixture\u0000.txt",
      Buffer.from("abc"),
    );
    expect(file.original_filename).toBe("fixture.txt");
    expect(file.mime_type).toBe("text/plain");
    expect(file.sha256).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
  it("requires PDF header and trailer rather than trusting the filename", () => {
    expect(
      inspectDocument("fixture.pdf", Buffer.from("%PDF-1.4\nfixture\n%%EOF"))
        .mime_type,
    ).toBe("application/pdf");
    expect(() =>
      inspectDocument("fixture.pdf", Buffer.from("arbitrary text")),
    ).toThrow();
  });
  it("rejects empty, oversized, invalid UTF-8 and binary text files", () => {
    for (const content of [
      Buffer.alloc(0),
      Buffer.alloc(MAX_RESUME_SIZE + 1),
      Buffer.from([0xff]),
      Buffer.from([65, 0]),
    ])
      expect(() => inspectDocument("fixture.txt", content)).toThrow();
    expect(() => inspectDocument("fixture.exe", Buffer.from("abc"))).toThrow();
  });
  it("accepts an OOXML container and rejects a plain ZIP", () => {
    expect(inspectDocument("fixture.docx", archive()).mime_type).toContain(
      "wordprocessingml",
    );
    expect(() =>
      inspectDocument("fixture.docx", archive(["one.txt", "two.txt"])),
    ).toThrow();
  });
  it("rejects document traversal, macros, expansion bombs and truncation", () => {
    for (const name of [
      "../secret",
      "/secret",
      "word/vbaProject.bin",
      "word/payload.exe",
    ])
      expect(() =>
        inspectDocument(
          "fixture.docx",
          archive(["[Content_Types].xml", "word/document.xml", name]),
        ),
      ).toThrow();
    expect(() =>
      inspectDocument("fixture.docx", archive(undefined, 20 * 1024 * 1024)),
    ).toThrow();
    expect(() =>
      inspectDocument("fixture.docx", archive().subarray(0, 40)),
    ).toThrow();
  });
});
