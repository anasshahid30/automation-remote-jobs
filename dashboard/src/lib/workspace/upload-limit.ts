// Leave room for multipart metadata below Vercel's function request limit.
// Stored documents and local uploads retain their existing 10 MiB limit.
export function resumeUploadLimit() {
  const mib = process.env.VERCEL === "1" ? 4 : 10;
  return { mib, bytes: mib * 1024 * 1024 };
}
