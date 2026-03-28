import type { AuthConfig } from "@/types/crawl";
import { Section, TextInput, Checkbox } from "./SettingsForm";

interface AuthenticationTabProps {
  config: AuthConfig;
  onChange: (config: AuthConfig) => void;
}

export function AuthenticationTab({ config, onChange }: AuthenticationTabProps) {
  const update = <K extends keyof AuthConfig>(key: K, value: AuthConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  const addExtraField = () => {
    onChange({ ...config, extra_fields: [...config.extra_fields, ["", ""]] });
  };

  const updateExtraField = (index: number, pos: 0 | 1, value: string) => {
    const updated = config.extra_fields.map((field, i) => {
      if (i !== index) return field;
      const copy: [string, string] = [...field];
      copy[pos] = value;
      return copy;
    });
    onChange({ ...config, extra_fields: updated });
  };

  const removeExtraField = (index: number) => {
    onChange({
      ...config,
      extra_fields: config.extra_fields.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="space-y-6">
      <Section
        title="Forms-Based Authentication"
        description="Configure login credentials so the crawler can authenticate before crawling protected pages."
      >
        <Checkbox
          label="Enable Authentication"
          checked={config.enabled}
          onChange={(v) => update("enabled", v)}
          description="When enabled, the crawler will submit login credentials before starting the crawl."
        />
      </Section>

      <Section
        title="Login URL"
        description="The URL of the login page where credentials will be submitted."
      >
        <TextInput
          label="Login URL"
          value={config.login_url}
          onChange={(v) => update("login_url", v)}
          placeholder="https://example.com/login"
          monospace
        />
      </Section>

      {config.enabled && (
        <>
          <Section
            title="Credentials"
            description="Specify the form field names and values for authentication."
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <TextInput
                  label="Username Field Name"
                  value={config.username_field}
                  onChange={(v) => update("username_field", v)}
                  placeholder="username"
                  monospace
                />
                <TextInput
                  label="Username"
                  value={config.username}
                  onChange={(v) => update("username", v)}
                  placeholder="user@example.com"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <TextInput
                  label="Password Field Name"
                  value={config.password_field}
                  onChange={(v) => update("password_field", v)}
                  placeholder="password"
                  monospace
                />
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-400">Password</span>
                  <input
                    type="password"
                    value={config.password}
                    onChange={(e) => update("password", e.target.value)}
                    placeholder="••••••••"
                    className="bg-surface-2 border border-surface-3 rounded px-3 py-1.5 text-sm text-gray-100 w-full focus:outline-none focus:border-accent transition-colors"
                  />
                </label>
              </div>
            </div>
          </Section>

          <Section
            title="Extra Fields"
            description="Additional form fields to include in the login request (e.g. CSRF tokens, hidden fields)."
          >
            <div className="space-y-3">
              {config.extra_fields.map((field, i) => (
                <div
                  key={i}
                  className="bg-surface-2 border border-surface-3 rounded-lg p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="grid grid-cols-2 gap-3 flex-1">
                      <TextInput
                        label="Field Name"
                        value={field[0]}
                        onChange={(v) => updateExtraField(i, 0, v)}
                        placeholder="e.g. csrf_token"
                        monospace
                      />
                      <TextInput
                        label="Field Value"
                        value={field[1]}
                        onChange={(v) => updateExtraField(i, 1, v)}
                        placeholder="e.g. abc123"
                        monospace
                      />
                    </div>
                    <button
                      onClick={() => removeExtraField(i)}
                      className="mt-5 text-xs text-red-400 hover:text-red-300 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}

              <button
                onClick={addExtraField}
                className="w-full py-2 border border-dashed border-surface-3 rounded-lg text-sm text-gray-400 hover:text-accent hover:border-accent transition-colors"
              >
                + Add Field
              </button>

              {config.extra_fields.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-2">
                  No extra fields defined. Add fields for CSRF tokens or other
                  hidden form values required by the login page.
                </p>
              )}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
