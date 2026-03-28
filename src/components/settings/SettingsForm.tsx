import type { ReactNode } from "react";

// ── Reusable form components for settings tabs ──

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium text-gray-200">{title}</h3>
        {description && (
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        )}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  description?: string;
}) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer group">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 rounded border-surface-3 bg-surface-2 text-accent focus:ring-accent/30 cursor-pointer"
      />
      <div>
        <span className="text-sm text-gray-300 group-hover:text-gray-100 transition-colors">
          {label}
        </span>
        {description && (
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        )}
      </div>
    </label>
  );
}

export function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  description,
  suffix,
  placeholder,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  description?: string;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-gray-400">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={value || ""}
          onChange={(e) => {
            const num = Number(e.target.value);
            if (isNaN(num) || !isFinite(num)) return;
            const clamped = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, num));
            onChange(clamped);
          }}
          placeholder={placeholder || "0 = unlimited"}
          className="bg-surface-2 border border-surface-3 rounded px-3 py-1.5 text-sm text-gray-100 w-full focus:outline-none focus:border-accent transition-colors"
          min={min}
          max={max}
        />
        {suffix && <span className="text-xs text-gray-500 shrink-0">{suffix}</span>}
      </div>
      {description && (
        <p className="text-xs text-gray-500">{description}</p>
      )}
    </label>
  );
}

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  description,
  monospace,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  description?: string;
  monospace?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-gray-400">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`bg-surface-2 border border-surface-3 rounded px-3 py-1.5 text-sm text-gray-100 w-full focus:outline-none focus:border-accent transition-colors ${monospace ? "font-mono text-xs" : ""}`}
      />
      {description && (
        <p className="text-xs text-gray-500">{description}</p>
      )}
    </label>
  );
}

export function SelectInput<T extends string>({
  label,
  value,
  onChange,
  options,
  description,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  description?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-gray-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="bg-surface-2 border border-surface-3 rounded px-3 py-1.5 text-sm text-gray-100 w-full focus:outline-none focus:border-accent transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {description && (
        <p className="text-xs text-gray-500">{description}</p>
      )}
    </label>
  );
}

export function Divider() {
  return <div className="border-t border-surface-3 my-2" />;
}
