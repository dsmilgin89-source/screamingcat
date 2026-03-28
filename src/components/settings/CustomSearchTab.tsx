import type { CustomSearchConfig, CustomSearchRule, CustomSearchMode } from "@/types/crawl";
import { Section, SelectInput, TextInput } from "./SettingsForm";

interface CustomSearchTabProps {
  config: CustomSearchConfig;
  onChange: (config: CustomSearchConfig) => void;
}

const emptyRule: CustomSearchRule = {
  name: "",
  pattern: "",
  mode: "contains",
  search_in: "html",
  case_sensitive: false,
};

export function CustomSearchTab({ config, onChange }: CustomSearchTabProps) {
  const addRule = () => {
    onChange({ rules: [...config.rules, { ...emptyRule, name: `Search ${config.rules.length + 1}` }] });
  };

  const updateRule = (index: number, updates: Partial<CustomSearchRule>) => {
    const rules = config.rules.map((r, i) =>
      i === index ? { ...r, ...updates } : r
    );
    onChange({ rules });
  };

  const removeRule = (index: number) => {
    onChange({ rules: config.rules.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-6">
      <Section
        title="Custom Search"
        description="Search for text patterns or regular expressions in crawled pages. Results appear in the Custom Search tab."
      >
        <div className="space-y-4">
          {config.rules.map((rule, i) => (
            <div
              key={i}
              className="bg-surface-2 border border-surface-3 rounded-lg p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-400">
                  Rule {i + 1}
                </span>
                <button
                  onClick={() => removeRule(i)}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  Remove
                </button>
              </div>

              <TextInput
                label="Name"
                value={rule.name}
                onChange={(v) => updateRule(i, { name: v })}
                placeholder="e.g. Google Analytics"
              />

              <TextInput
                label="Pattern"
                value={rule.pattern}
                onChange={(v) => updateRule(i, { pattern: v })}
                placeholder={
                  rule.mode === "regex"
                    ? "e.g. gtag\\(.*\\)"
                    : "e.g. google-analytics.com"
                }
                monospace
              />

              <div className="grid grid-cols-3 gap-3">
                <SelectInput<CustomSearchMode>
                  label="Mode"
                  value={rule.mode}
                  onChange={(v) => updateRule(i, { mode: v })}
                  options={[
                    { value: "contains", label: "Contains" },
                    { value: "regex", label: "Regex" },
                  ]}
                />

                <SelectInput<"html" | "text">
                  label="Search In"
                  value={rule.search_in}
                  onChange={(v) => updateRule(i, { search_in: v })}
                  options={[
                    { value: "html", label: "HTML Source" },
                    { value: "text", label: "Visible Text" },
                  ]}
                />

                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-400">Case</span>
                  <button
                    onClick={() => updateRule(i, { case_sensitive: !rule.case_sensitive })}
                    className={`h-[38px] rounded-lg border text-xs font-medium transition-colors ${
                      rule.case_sensitive
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-surface-3 bg-surface-1 text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    {rule.case_sensitive ? "Sensitive" : "Insensitive"}
                  </button>
                </div>
              </div>
            </div>
          ))}

          <button
            onClick={addRule}
            className="w-full py-2 border border-dashed border-surface-3 rounded-lg text-sm text-gray-400 hover:text-accent hover:border-accent transition-colors"
          >
            + Add Search Rule
          </button>

          {config.rules.length === 0 && (
            <p className="text-xs text-gray-500 text-center py-2">
              No custom search rules defined. Add a rule to search for specific
              patterns in crawled pages.
            </p>
          )}
        </div>
      </Section>
    </div>
  );
}
