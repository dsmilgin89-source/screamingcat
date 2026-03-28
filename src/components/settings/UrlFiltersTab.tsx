import { useState } from "react";
import type { UrlFilterConfig } from "@/types/crawl";
import { Section, Divider } from "./SettingsForm";

interface UrlFiltersTabProps {
  config: UrlFilterConfig;
  onChange: (v: UrlFilterConfig) => void;
}

function PatternList({
  patterns,
  onChange,
  placeholder,
}: {
  patterns: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");

  const add = () => {
    const val = input.trim();
    if (val && !patterns.includes(val)) {
      onChange([...patterns, val]);
      setInput("");
    }
  };

  const remove = (idx: number) => {
    onChange(patterns.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={placeholder}
          className="flex-1 bg-surface-2 border border-surface-3 rounded px-3 py-1.5 text-sm text-gray-100 font-mono focus:outline-none focus:border-accent transition-colors"
        />
        <button
          onClick={add}
          disabled={!input.trim()}
          className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-sm rounded transition-colors disabled:opacity-40"
        >
          Add
        </button>
      </div>

      {patterns.length > 0 ? (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {patterns.map((p, i) => (
            <div
              key={i}
              className="flex items-center justify-between px-3 py-1.5 bg-surface-2 rounded text-sm group"
            >
              <code className="text-gray-300 text-xs">{p}</code>
              <button
                onClick={() => remove(i)}
                className="text-gray-500 hover:text-error opacity-0 group-hover:opacity-100 transition-all text-xs"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-500 italic py-2">
          No patterns defined
        </p>
      )}
    </div>
  );
}

export function UrlFiltersTab({ config, onChange }: UrlFiltersTabProps) {
  return (
    <div className="space-y-6">
      <Section
        title="Include"
        description="Only crawl URLs matching these regex patterns. Leave empty to crawl everything."
      >
        <PatternList
          patterns={config.include_patterns}
          onChange={(v) => onChange({ ...config, include_patterns: v })}
          placeholder="e.g. /blog/.* or \.html$"
        />
      </Section>

      <Divider />

      <Section
        title="Exclude"
        description="Skip URLs matching these regex patterns."
      >
        <PatternList
          patterns={config.exclude_patterns}
          onChange={(v) => onChange({ ...config, exclude_patterns: v })}
          placeholder="e.g. /admin/.* or \?sessionid= or /tag/"
        />
      </Section>

      <div className="p-3 bg-surface-2 rounded-lg border border-surface-3">
        <p className="text-xs text-gray-400">
          Patterns use{" "}
          <span className="text-gray-300 font-mono">regex</span> syntax.
          Common patterns:
        </p>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <code className="text-gray-400">/blog/.*</code>
          <span className="text-gray-500">Match /blog/ paths</span>
          <code className="text-gray-400">\.pdf$</code>
          <span className="text-gray-500">Match PDF files</span>
          <code className="text-gray-400">\?page=</code>
          <span className="text-gray-500">Match pagination params</span>
          <code className="text-gray-400">/tag/|/author/</code>
          <span className="text-gray-500">Match tags or authors</span>
        </div>
      </div>
    </div>
  );
}
