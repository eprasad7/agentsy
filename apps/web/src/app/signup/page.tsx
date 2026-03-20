export default function SignupPage() {
  return (
    <main style={{ maxWidth: 400, margin: '100px auto', padding: 24 }}>
      <h1>Sign Up</h1>
      <form method="post" action="/api/auth/sign-up/email">
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="name">Name</label>
          <input id="name" name="name" type="text" required style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required minLength={8} style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }} />
        </div>
        <button type="submit" style={{ padding: '8px 24px' }}>Create Account</button>
      </form>
      <hr style={{ margin: '24px 0' }} />
      <a href="/api/auth/sign-in/social?provider=google" style={{ display: 'block', marginBottom: 8 }}>Sign up with Google</a>
      <a href="/api/auth/sign-in/social?provider=github" style={{ display: 'block', marginBottom: 8 }}>Sign up with GitHub</a>
      <p style={{ marginTop: 24 }}>
        Already have an account? <a href="/login">Log in</a>
      </p>
    </main>
  );
}
