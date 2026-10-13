import { inflateRawSync } from "node:zlib";
import { inspectDocument } from "../workspace/documents";
import { extractText, getDocumentProxy } from "unpdf";

function clean(text: string) {
  const value = text
    .replaceAll("\r\n", "\n")
    .replaceAll(String.fromCharCode(0), "")
    .trim();
  if (!value || value.length > 60000)
    throw new Error(
      "Extraction is empty or too large. Paste a reviewed transcript up to 60,000 characters.",
    );
  return value;
}
function xmlText(xml: string) {
  return xml
    .replace(/<w:tab\b[^>]*\/>/g, "\t")
    .replace(/<w:br\b[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(
      /&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi,
      (_, entity: string) => {
        const named: Record<string, string> = {
          amp: "&",
          lt: "<",
          gt: ">",
          quot: '"',
          apos: "'",
        };
        if (named[entity]) return named[entity];
        const point = entity.startsWith("#x")
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
        return point > 0 && point <= 0x10ffff
          ? String.fromCodePoint(point)
          : "";
      },
    );
}
export async function extractResumeText(filename: string, bytes: Uint8Array) {
  const doc = inspectDocument(filename, bytes);
  if (doc.extension === "txt")
    return clean(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (doc.extension === "pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(bytes), {
      disableFontFace: true,
      useSystemFonts: false,
      enableXfa: false,
    });
    try {
      if (pdf.numPages > 50)
        throw new Error("Resume exceeds the 50-page extraction limit.");
      const result = await extractText(pdf, { mergePages: true });
      return clean(result.text);
    } finally {
      await pdf.loadingTask.destroy();
    }
  }
  // Only the validated document.xml member is decompressed; never extract archive paths.
  const data = Buffer.from(bytes);
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--)
    if (data.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  let position = data.readUInt32LE(end + 16);
  const count = data.readUInt16LE(end + 10);
  for (let i = 0; i < count; i++) {
    const nameSize = data.readUInt16LE(position + 28),
      extra = data.readUInt16LE(position + 30),
      comment = data.readUInt16LE(position + 32);
    const name = data
      .subarray(position + 46, position + 46 + nameSize)
      .toString("utf8");
    if (name === "word/document.xml") {
      const size = data.readUInt32LE(position + 20),
        unpacked = data.readUInt32LE(position + 24),
        offset = data.readUInt32LE(position + 42),
        method = data.readUInt16LE(position + 10);
      if (
        unpacked > 1024 * 1024 ||
        offset + 30 > data.length ||
        data.readUInt32LE(offset) !== 0x04034b50
      )
        throw new Error("Document text member is invalid or too large.");
      const start =
        offset +
        30 +
        data.readUInt16LE(offset + 26) +
        data.readUInt16LE(offset + 28);
      if (start + size > data.length) throw new Error("Truncated DOCX member.");
      const compressed = data.subarray(start, start + size);
      const content =
        method === 0
          ? compressed
          : method === 8
            ? inflateRawSync(compressed, { maxOutputLength: 1024 * 1024 })
            : null;
      if (!content || content.length !== unpacked)
        throw new Error("Unsupported or invalid DOCX member.");
      return clean(
        xmlText(new TextDecoder("utf-8", { fatal: true }).decode(content)),
      );
    }
    position += 46 + nameSize + extra + comment;
  }
  throw new Error("Document text is unavailable.");
}
