import type {
  CustomExtractionConfig,
  CustomExtractionRule,
  CustomExtractionMode,
  CustomExtractionTarget,
} from "@/types/crawl";
import { Section, SelectInput, TextInput } from "./SettingsForm";

interface CustomExtractionTabProps {
  config: CustomExtractionConfig;
  onChange: (config: CustomExtractionConfig) => void;
}

const emptyRule: CustomExtractionRule = {
  name: "",
  selector: "",
  mode: "css_selector",
  target: "text",
  attribute: "",
};

export function CustomExtractionTab({
  config,
  onChange,
}: CustomExtractionTabProps) {
  const addRule = () => {
    onChange({
      rules: [
        ...config.rules,
        { ...emptyRule, name: `Extract ${config.rules.length + 1}` },
      ],
    });
  };

  const updateRule = (index: number, updates: Partial<CustomExtractionRule>) => {
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
        title="Custom Extraction"
        description="Extract data from crawled pages using CSS selectors or regex. Results appear in the Custom Extraction tab."
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
                placeholder="e.g. Product Price"
              />

              <TextInput
                label="Selector / Pattern"
                value={rule.selector}
                onChange={(v) => updateRule(i, { selector: v })}
                placeholder={
                  rule.mode === "css_selector"
                    ? "e.g. h1.product-title"
                    : rule.mode === "regex"
                      ? 'e.g. "price":\\s*"([^"]+)"'
                      : "e.g. //div[@class='price']"
                }
                monospace
              />

              <div className="grid grid-cols-2 gap-3">
                <SelectInput<CustomExtractionMode>
                  label="Mode"
                  value={rule.mode}
                  onChange={(v) => updateRule(i, { mode: v })}
                  options={[
                    { value: "css_selector", label: "CSS Selector" },
                    { value: "regex", label: "Regex" },
                    { value: "xpath", label: "XPath (limited)" },
                  ]}
                />

                <SelectInput<CustomExtractionTarget>
                  label="Extract"
                  value={rule.target}
                  onChange={(v) => updateRule(i, { target: v })}
                  options={[
                    { value: "text", label: "Text Content" },
                    { value: "inner_html", label: "Inner HTML" },
                    { value: "attribute", label: "Attribute Value" },
                  ]}
                />
              </div>

              {rule.target === "attribute" && (
                <TextInput
                  label="Attribute Name"
                  value={rule.attribute}
                  onChange={(v) => updateRule(i, { attribute: v })}
                  placeholder="e.g. href, src, data-value"
                  monospace
                />
              )}
            </div>
          ))}

          <button
            onClick={addRule}
            className="w-full py-2 border border-dashed border-surface-3 rounded-lg text-sm text-gray-400 hover:text-accent hover:border-accent transition-colors"
          >
            + Add Extraction Rule
          </button>

          {config.rules.length === 0 && (
            <p className="text-xs text-gray-500 text-center py-2">
              No custom extraction rules defined. Add a rule to extract specific
              data from crawled pages using CSS selectors or regex.
            </p>
          )}
        </div>
      </Section>
    </div>
  );
}
