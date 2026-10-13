import { describe, it, expect } from "vitest";
import { deflateRawSync } from "node:zlib";
import { extractResumeText } from "./extraction";

function docx(xml: string) {
  const members = [
    { name: "[Content_Types].xml", data: "<Types/>" },
    { name: "word/document.xml", data: xml },
  ];
  const pieces: Buffer[] = [],
    directories: Buffer[] = [];
  let offset = 0;
  for (const member of members) {
    const name = Buffer.from(member.name),
      raw = Buffer.from(member.data),
      content = deflateRawSync(raw);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(content.length, 18);
    header.writeUInt32LE(raw.length, 22);
    header.writeUInt16LE(name.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(8, 10);
    directory.writeUInt32LE(content.length, 20);
    directory.writeUInt32LE(raw.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42);
    pieces.push(header, name, content);
    directories.push(directory, name);
    offset += header.length + name.length + content.length;
  }
  const end = Buffer.alloc(22),
    dir = Buffer.concat(directories);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(2, 8);
  end.writeUInt16LE(2, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...pieces, dir, end]);
}
function pdf() {
  const stream = "BT /F1 12 Tf 72 720 Td (Built Python APIs in 2023.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let text = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(text));
    text += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const start = Buffer.byteLength(text);
  text += `xref\n0 6\n0000000000 65535 f \n${offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(text);
}
describe("bounded private text extraction", () => {
  it("extracts valid UTF-8 without changing facts", async () =>
    expect(
      await extractResumeText(
        "resume.txt",
        Buffer.from("Built Python APIs in 2023.\r\nBSc 2022."),
      ),
    ).toBe("Built Python APIs in 2023.\nBSc 2022."));
  it("extracts only DOCX text and decodes entities", async () =>
    expect(
      await extractResumeText(
        "resume.docx",
        docx(
          "<w:document><w:body><w:p><w:r><w:t>Python &amp; SQL &#x2713;</w:t></w:r></w:p></w:body></w:document>",
        ),
      ),
    ).toBe("Python & SQL ✓"));
  it("extracts PDF text with the pinned parser", async () =>
    expect(await extractResumeText("resume.pdf", pdf())).toContain(
      "Built Python APIs in 2023.",
    ));
  it("rejects falsely labelled files", async () =>
    expect(
      extractResumeText("resume.pdf", Buffer.from("fake pdf")),
    ).rejects.toThrow());
  it("rejects empty and oversized transcripts", async () => {
    await expect(
      extractResumeText("resume.txt", Buffer.from(" \n ")),
    ).rejects.toThrow("empty");
    await expect(
      extractResumeText("resume.txt", Buffer.from("a".repeat(60001))),
    ).rejects.toThrow("too large");
  });
  it("bounds actual DOCX decompression", async () =>
    expect(
      extractResumeText("resume.docx", docx("x".repeat(1024 * 1024 + 1))),
    ).rejects.toThrow("too large"));
});
