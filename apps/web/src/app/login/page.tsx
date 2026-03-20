export default function LoginPage() {
  return (
    <main style={{ maxWidth: 400, margin: '100px auto', padding: 24 }}>
      <h1>Log In</h1>
      <form method="post" action="/api/auth/sign-in/email">
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }} />
        </div>
        <button type="submit" style={{ padding: '8px 24px' }}>Log In</button>
      </form>
      <hr style={{ margin: '24px 0' }} />
      <a href="/api/auth/sign-in/social?provider=google" style={{ display: 'block', marginBottom: 8 }}>Sign in with Google</a>
      <a href="/api/auth/sign-in/social?provider=github" style={{ display: 'block', marginBottom: 8 }}>Sign in with GitHub</a>
      <p style={{ marginTop: 24 }}>
        No account? <a href="/signup">Sign up</a>
      </p>
    </main>
  );
}
