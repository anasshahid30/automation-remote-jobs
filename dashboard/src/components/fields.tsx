export function Field({
  name,
  label,
  help,
  children,
}: {
  name: string;
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-2 block text-sm font-semibold">
        {label}
      </label>
      {children}
      {help && (
        <p
          id={`${name}-help`}
          className="mt-2 text-sm leading-6 text-slate-600"
        >
          {help}
        </p>
      )}
    </div>
  );
}
export function TextField({
  name,
  label,
  help,
  value,
  type = "text",
  required = false,
  maxLength = 200,
}: {
  name: string;
  label: string;
  help?: string;
  value?: string | number | null;
  type?: string;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <Field name={name} label={label} help={help}>
      <input
        className="input"
        id={name}
        name={name}
        type={type}
        defaultValue={value ?? ""}
        required={required}
        maxLength={maxLength}
        aria-describedby={help ? `${name}-help` : undefined}
      />
    </Field>
  );
}
export function TextArea({
  name,
  id,
  label,
  value,
  help,
  required,
  maxLength = 10000,
}: {
  name: string;
  id?: string;
  label: string;
  value?: string | null;
  help?: string;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <Field name={id ?? name} label={label} help={help}>
      <textarea
        className="input min-h-28"
        id={id ?? name}
        name={name}
        defaultValue={value ?? ""}
        rows={5}
        required={required}
        maxLength={maxLength}
        aria-describedby={help ? `${id ?? name}-help` : undefined}
      />
    </Field>
  );
}
export function SelectField({
  name,
  id,
  label,
  value,
  options,
}: {
  name: string;
  id?: string;
  label: string;
  value?: string | null;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <Field name={id ?? name} label={label}>
      <select
        className="input"
        id={id ?? name}
        name={name}
        defaultValue={value ?? ""}
      >
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </Field>
  );
}
