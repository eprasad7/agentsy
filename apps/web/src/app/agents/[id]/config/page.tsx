"use client";

import { RotateCcw, Save } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { apiClient, type AgentVersion, ApiClientError } from "@/lib/api";

const CAPABILITY_CLASSES = ["fast", "balanced", "reasoning"] as const;
const PROVIDERS = ["anthropic", "openai"] as const;

export default function AgentConfigPage() {
  const params = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<AgentVersion | null>(null);

  // Form state
  const [systemPrompt, setSystemPrompt] = useState("");
  const [modelType, setModelType] = useState<"class" | "direct">("class");
  const [capabilityClass, setCapabilityClass] = useState<string>("balanced");
  const [provider, setProvider] = useState<string>("anthropic");
  const [directModel, setDirectModel] = useState("");
  const [maxIterations, setMaxIterations] = useState("10");
  const [maxTokens, setMaxTokens] = useState("50000");
  const [timeoutMs, setTimeoutMs] = useState("300000");
  const [description, setDescription] = useState("");

  useEffect(() => {
    apiClient.agents
      .versions(params.id, { limit: "1", order: "desc" })
      .then((res) => {
        if (res.data.length > 0) {
          const v = res.data[0]!;
          setCurrentVersion(v);
          setSystemPrompt(v.system_prompt);
          setDescription(v.description ?? "");

          const spec = v.model_spec as Record<string, unknown> | null;
          if (spec?.type === "class") {
            setModelType("class");
            setCapabilityClass(String(spec.class ?? "balanced"));
            setProvider(String(spec.provider ?? "anthropic"));
          } else {
            setModelType("direct");
            setDirectModel(v.model);
          }

          const gc = v.guardrails_config as Record<string, unknown> | null;
          if (gc) {
            if (gc.maxIterations !== undefined) setMaxIterations(String(gc.maxIterations));
            if (gc.maxTokens !== undefined) setMaxTokens(String(gc.maxTokens));
            if (gc.timeoutMs !== undefined) setTimeoutMs(String(gc.timeoutMs));
          }
        }
      })
      .catch((e: unknown) => {
        if (e instanceof ApiClientError) setError(e.message);
        else setError("Failed to load config");
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const model =
        modelType === "class"
          ? { class: capabilityClass, provider }
          : directModel;

      const guardrailsConfig: Record<string, unknown> = {};
      if (maxIterations) guardrailsConfig.maxIterations = parseInt(maxIterations, 10);
      if (maxTokens) guardrailsConfig.maxTokens = parseInt(maxTokens, 10);
      if (timeoutMs) guardrailsConfig.timeoutMs = parseInt(timeoutMs, 10);

      const version = await apiClient.agents.createVersion(params.id, {
        system_prompt: systemPrompt,
        model,
        guardrails_config: guardrailsConfig,
        description: description || undefined,
      });

      setCurrentVersion(version);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) setError(err.message);
      else setError("Failed to save version");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    if (!currentVersion) return;
    setSystemPrompt(currentVersion.system_prompt);
    setDescription(currentVersion.description ?? "");
    const spec = currentVersion.model_spec as Record<string, unknown> | null;
    if (spec?.type === "class") {
      setModelType("class");
      setCapabilityClass(String(spec.class ?? "balanced"));
      setProvider(String(spec.provider ?? "anthropic"));
    } else {
      setModelType("direct");
      setDirectModel(currentVersion.model);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-text-secondary">Loading...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {currentVersion && (
        <div className="rounded-lg bg-info-50 px-4 py-3 text-sm text-info-700">
          Editing from version {currentVersion.version}. Saving will create version{" "}
          {currentVersion.version + 1}.
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        {error && (
          <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div>
        )}

        {success && (
          <div className="rounded-lg bg-success-50 px-4 py-3 text-sm text-success-700">
            Version {currentVersion?.version} saved successfully.
          </div>
        )}

        {/* System prompt */}
        <div className="rounded-xl border border-border bg-surface-card p-6 space-y-3">
          <h2 className="text-md font-semibold text-text-primary">System Prompt</h2>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={12}
            required
            className="w-full rounded-lg border border-border bg-surface-hover p-4 font-mono text-xs text-text-primary leading-relaxed placeholder:text-text-tertiary focus:border-border-focus focus:ring-1 focus:ring-border-focus"
            placeholder="You are a helpful assistant that..."
          />
        </div>

        {/* Model selection */}
        <div className="rounded-xl border border-border bg-surface-card p-6 space-y-4">
          <h2 className="text-md font-semibold text-text-primary">Model</h2>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-text-primary">
              <input
                type="radio"
                name="model-type"
                checked={modelType === "class"}
                onChange={() => setModelType("class")}
                className="text-primary-600 focus:ring-border-focus"
              />
              Capability class
            </label>
            <label className="flex items-center gap-2 text-sm text-text-primary">
              <input
                type="radio"
                name="model-type"
                checked={modelType === "direct"}
                onChange={() => setModelType("direct")}
                className="text-primary-600 focus:ring-border-focus"
              />
              Direct model
            </label>
          </div>

          {modelType === "class" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-text-primary">
                  Capability
                </label>
                <select
                  value={capabilityClass}
                  onChange={(e) => setCapabilityClass(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:ring-1 focus:ring-border-focus"
                  style={{ minHeight: 44 }}
                >
                  {CAPABILITY_CLASSES.map((c) => (
                    <option key={c} value={c}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-text-primary">
                  Provider
                </label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:ring-1 focus:ring-border-focus"
                  style={{ minHeight: 44 }}
                >
                  {PROVIDERS.map((p) => (
                    <option key={p} value={p}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <label className="block text-sm font-medium text-text-primary">
                Model identifier
              </label>
              <input
                type="text"
                value={directModel}
                onChange={(e) => setDirectModel(e.target.value)}
                placeholder="claude-sonnet-4"
                className="w-full rounded-lg border border-border bg-surface-card px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:ring-1 focus:ring-border-focus"
                style={{ minHeight: 44 }}
              />
            </div>
          )}
        </div>

        {/* Guardrails */}
        <div className="rounded-xl border border-border bg-surface-card p-6 space-y-4">
          <h2 className="text-md font-semibold text-text-primary">Guardrails</h2>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-text-primary">
                Max iterations
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={maxIterations}
                onChange={(e) => setMaxIterations(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:ring-1 focus:ring-border-focus"
                style={{ minHeight: 44 }}
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-text-primary">
                Max tokens
              </label>
              <input
                type="number"
                min="1000"
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:ring-1 focus:ring-border-focus"
                style={{ minHeight: 44 }}
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-text-primary">
                Timeout (ms)
              </label>
              <input
                type="number"
                min="5000"
                value={timeoutMs}
                onChange={(e) => setTimeoutMs(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:ring-1 focus:ring-border-focus"
                style={{ minHeight: 44 }}
              />
            </div>
          </div>
        </div>

        {/* Version description */}
        <div className="rounded-xl border border-border bg-surface-card p-6 space-y-3">
          <h2 className="text-md font-semibold text-text-primary">Version Note</h2>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what changed in this version"
            className="w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:ring-1 focus:ring-border-focus"
            style={{ minHeight: 44 }}
          />
        </div>

        <div className="flex justify-end gap-3">
          {currentVersion && (
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover"
              style={{ minHeight: 44 }}
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>
          )}
          <button
            type="submit"
            disabled={saving || !systemPrompt.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-700 disabled:opacity-60"
            style={{ minHeight: 44 }}
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save new version"}
          </button>
        </div>
      </form>
    </div>
  );
}
