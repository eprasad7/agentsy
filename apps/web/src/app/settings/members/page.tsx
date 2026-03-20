"use client";

import { useEffect, useState, useCallback } from "react";
import { apiClient, type Member, ApiClientError } from "@/lib/api";
import { Plus, Trash2, Users, X } from "lucide-react";

function InviteModal({
  onClose,
  onInvited,
}: {
  onClose: () => void;
  onInvited: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setError(null);
    try {
      await apiClient.organization.invite({ email, role });
      onInvited();
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) setError(err.message);
      else setError("Failed to send invite");
    } finally {
      setInviting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-overlay">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface-card p-6 shadow-xl">
        <form onSubmit={handleInvite} className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-md font-semibold text-text-primary">Invite member</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-2 text-text-secondary hover:text-text-primary"
              style={{ minWidth: 44, minHeight: 44 }}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {error && (
            <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div>
          )}

          <div className="space-y-1">
            <label htmlFor="invite-email" className="block text-sm font-medium text-text-primary">
              Email address
            </label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              required
              className="w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:ring-1 focus:ring-border-focus"
              style={{ minHeight: 44 }}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="invite-role" className="block text-sm font-medium text-text-primary">
              Role
            </label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-text-primary focus:border-border-focus focus:ring-1 focus:ring-border-focus"
              style={{ minHeight: 44 }}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover"
              style={{ minHeight: 44 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={inviting || !email.trim()}
              className="rounded-lg bg-primary-600 px-4 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-700 disabled:opacity-60"
              style={{ minHeight: 44 }}
            >
              {inviting ? "Sending..." : "Send invite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  const loadMembers = useCallback(() => {
    setLoading(true);
    apiClient.organization
      .members()
      .then((res) => setMembers(res.data))
      .catch((e: unknown) => {
        if (e instanceof ApiClientError) setError(e.message);
        else setError("Failed to load members");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  async function handleRoleChange(memberId: string, newRole: string) {
    try {
      await apiClient.organization.updateRole(memberId, { role: newRole });
      loadMembers();
    } catch (e: unknown) {
      if (e instanceof ApiClientError) setError(e.message);
    }
  }

  async function handleRemove(memberId: string) {
    try {
      await apiClient.organization.removeMember(memberId);
      loadMembers();
    } catch (e: unknown) {
      if (e instanceof ApiClientError) setError(e.message);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-text-secondary">Loading...</p>
      </div>
    );
  }

  const isPending = (userId: string) => userId.startsWith("pending:");
  const getEmail = (userId: string) =>
    isPending(userId) ? userId.replace("pending:", "") : userId;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">
          Manage team members and their roles.
        </p>
        <button
          onClick={() => setShowInvite(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-700"
          style={{ minHeight: 44 }}
        >
          <Plus className="h-4 w-4" />
          Invite
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700">{error}</div>
      )}

      {members.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-card px-6 py-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
            <Users className="h-6 w-6" />
          </div>
          <p className="text-sm text-text-secondary">No team members yet.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  User
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Joined
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-text-primary">
                    {getEmail(m.user_id)}
                  </td>
                  <td className="px-4 py-3">
                    {isPending(m.user_id) ? (
                      <span className="inline-block rounded-full bg-warning-100 px-2 py-1 text-xs text-warning-700">
                        Pending
                      </span>
                    ) : (
                      <span className="inline-block rounded-full bg-success-100 px-2 py-1 text-xs text-success-700">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={m.role}
                      onChange={(e) => handleRoleChange(m.id, e.target.value)}
                      className="rounded-lg border border-border bg-surface-card px-2 py-1 text-sm text-text-primary focus:border-border-focus focus:ring-1 focus:ring-border-focus"
                      style={{ minHeight: 44 }}
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {new Date(m.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleRemove(m.id)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-error-600 transition-colors hover:bg-error-50"
                      style={{ minHeight: 44 }}
                    >
                      <Trash2 className="h-3 w-3" />
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onInvited={loadMembers}
        />
      )}
    </div>
  );
}
