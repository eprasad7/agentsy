"use client";

import { Save } from "lucide-react";
import { useEffect, useState } from "react";

import { apiClient, type Organization, ApiClientError } from "@/lib/api";

export default function SettingsGeneralPage() {
  const [org, setOrg] = useState<Organization | null>(null);
  const [name, setName] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.organization
      .get()
      .then((o) => {
        setOrg(o);
        setName(o.name);
        setBillingEmail(o.billing_email ?? "");
      })
      .catch((e: unknown) => {
        if (e instanceof ApiClientError) setError(e.message);
        else setError("Failed to load organization");
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const updated = await apiClient.organization.update({
        name: name || undefined,
        billing_email: billingEmail || undefined,
      });
      setOrg(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) setError(err.message);
      else setError("Failed to save changes");
    } finally {
      setSaving(false);
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
    <div className="max-w-xl space-y-6">
      <form onSubmit={handleSave} className="space-y-5">
        <div className="rounded-xl border border-border bg-surface-card p-6 space-y-4">
          <h2 className="text-md font-semibold text-text-primary">Organization</h2>

          {error && (
            <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-lg bg-success-50 px-4 py-3 text-sm text-success-700">
              Changes saved successfully.
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="org-slug" className="block text-sm font-medium text-text-secondary">
              Slug
            </label>
            <input
              id="org-slug"
              type="text"
              value={org?.slug ?? ""}
              disabled
              className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-tertiary"
              style={{ minHeight: 44 }}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="org-name" className="block text-sm font-medium text-text-primary">
              Organization name
            </label>
            <input
              id="org-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:ring-1 focus:ring-border-focus"
              style={{ minHeight: 44 }}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="billing-email" className="block text-sm font-medium text-text-primary">
              Billing email
            </label>
            <input
              id="billing-email"
              type="email"
              value={billingEmail}
              onChange={(e) => setBillingEmail(e.target.value)}
              placeholder="billing@company.com"
              className="w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:ring-1 focus:ring-border-focus"
              style={{ minHeight: 44 }}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-700 disabled:opacity-60"
            style={{ minHeight: 44 }}
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>

      {org && (
        <div className="rounded-xl border border-border bg-surface-card p-6 space-y-2">
          <h2 className="text-md font-semibold text-text-primary">Plan</h2>
          <p className="text-sm text-text-secondary">
            Current plan: <span className="font-medium text-text-primary capitalize">{org.plan}</span>
          </p>
        </div>
      )}
    </div>
  );
}
