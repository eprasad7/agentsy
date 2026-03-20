import { Bot } from "lucide-react";

export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-page p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-600">
            <Bot className="h-6 w-6 text-text-inverse" />
          </div>
          <h1 className="text-lg font-bold text-text-primary">Create your account</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Start building reliable AI agents.
          </p>
        </div>

        <form
          method="post"
          action="/api/auth/sign-up/email"
          className="rounded-xl border border-border bg-surface-card p-6 space-y-4"
        >
          <div className="space-y-1">
            <label htmlFor="name" className="block text-sm font-medium text-text-primary">
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              className="w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:ring-1 focus:ring-border-focus"
              style={{ minHeight: 44 }}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="email" className="block text-sm font-medium text-text-primary">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:ring-1 focus:ring-border-focus"
              style={{ minHeight: 44 }}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="password" className="block text-sm font-medium text-text-primary">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              className="w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:ring-1 focus:ring-border-focus"
              style={{ minHeight: 44 }}
            />
            <p className="text-xs text-text-tertiary">Minimum 8 characters.</p>
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-primary-600 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-700"
            style={{ minHeight: 44 }}
          >
            Create account
          </button>
        </form>

        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-border" />
            <span className="text-xs text-text-tertiary">or continue with</span>
            <div className="flex-1 border-t border-border" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <a
              href="/api/auth/sign-in/social?provider=google"
              className="flex items-center justify-center rounded-lg border border-border text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover"
              style={{ minHeight: 44 }}
            >
              Google
            </a>
            <a
              href="/api/auth/sign-in/social?provider=github"
              className="flex items-center justify-center rounded-lg border border-border text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover"
              style={{ minHeight: 44 }}
            >
              GitHub
            </a>
          </div>
        </div>

        <p className="text-center text-sm text-text-secondary">
          Already have an account?{" "}
          <a href="/login" className="font-medium text-primary-600 hover:text-primary-700">
            Log in
          </a>
        </p>
      </div>
    </div>
  );
}
