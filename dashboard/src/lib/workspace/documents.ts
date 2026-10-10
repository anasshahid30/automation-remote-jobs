import { createHash } from "node:crypto";

export const MAX_RESUME_SIZE = 10 * 1024 * 1024;
const mime = {
  pdf: "application/pdf",
  txt: "text/plain",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

// Inspect DOCX directory metadata without extracting or executing document contents.
function isDocx(data: Buffer) {
  if (data.readUInt32LE(0) !== 0x04034b50) return false;
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
    if (data.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (
    end < 0 ||
    data.readUInt16LE(end + 4) !== 0 ||
    data.readUInt16LE(end + 6) !== 0
  )
    return false;
  const count = data.readUInt16LE(end + 10),
    directorySize = data.readUInt32LE(end + 12);
  let position = data.readUInt32LE(end + 16),
    unpacked = 0;
  if (count < 2 || count > 2000 || position + directorySize > end) return false;
  const names = new Set<string>();
  for (let index = 0; index < count; index++) {
    if (
      position + 46 > end ||
      data.readUInt32LE(position) !== 0x02014b50 ||
      data.readUInt16LE(position + 8) & 1
    )
      return false;
    const nameSize = data.readUInt16LE(position + 28),
      extra = data.readUInt16LE(position + 30),
      comment = data.readUInt16LE(position + 32);
    if (position + 46 + nameSize + extra + comment > end) return false;
    const name = data
      .subarray(position + 46, position + 46 + nameSize)
      .toString("utf8");
    if (
      name.includes("..") ||
      name.startsWith("/") ||
      name.includes("\\") ||
      /vbaProject|\.exe$/i.test(name)
    )
      return false;
    names.add(name);
    unpacked += data.readUInt32LE(position + 24);
    if (unpacked > 20 * 1024 * 1024) return false;
    position += 46 + nameSize + extra + comment;
  }
  return names.has("[Content_Types].xml") && names.has("word/document.xml");
}

export function inspectDocument(filename: string, bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_RESUME_SIZE)
    throw new Error("Upload a nonempty file no larger than 10 MiB.");
  const original = Array.from(filename.replaceAll("\\", "/").split("/").pop()!)
    .filter(
      (character) =>
        character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127,
    )
    .join("")
    .slice(0, 255);
  const extension = original.split(".").pop()?.toLowerCase();
  const data = Buffer.from(bytes);
  let valid = false;
  if (extension === "pdf")
    valid =
      data.subarray(0, 5).toString() === "%PDF-" &&
      data
        .subarray(Math.max(0, data.length - 4096))
        .includes(Buffer.from("%%EOF"));
  if (extension === "txt") {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(data);
      valid = !data.includes(0);
    } catch {
      valid = false;
    }
  }
  if (extension === "docx" && data.length >= 22) valid = isDocx(data);
  if (!valid || !extension || !(extension in mime))
    throw new Error(
      "Choose a valid PDF, UTF-8 text file, or DOCX. File contents must match the extension.",
    );
  return {
    original_filename: original,
    mime_type: mime[extension as keyof typeof mime],
    file_size: data.length,
    sha256: createHash("sha256").update(data).digest("hex"),
    extension,
  };
}
