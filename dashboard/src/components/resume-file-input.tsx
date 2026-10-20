"use client";

export function ResumeFileInput({ maxBytes }: { maxBytes: number }) {
  return (
    <input
      className="input"
      id="file"
      name="file"
      type="file"
      accept=".pdf,.docx,.txt"
      required
      aria-describedby="file-help"
      onChange={(event) => {
        const input = event.currentTarget;
        const file = input.files?.[0];
        input.setCustomValidity(
          file && (!file.size || file.size > maxBytes)
            ? `Choose a nonempty resume no larger than ${maxBytes / 1024 / 1024} MiB.`
            : "",
        );
        if (file) input.reportValidity();
      }}
    />
  );
}
