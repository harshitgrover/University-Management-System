import { useState } from 'react';
import { signIn } from '../api.js';

function LoginForm({ roles, onSuccess, onError }) {
  const [role, setRole] = useState(roles[0]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    onError('');

    try {
      const data = await signIn(role, { email, password });
      if (data.token) {
        onSuccess(role, data.token);
      } else {
        throw new Error(data.message || 'Login failed');
      }
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      <label>
        Role
        <select value={role} onChange={(event) => setRole(event.target.value)}>
          {roles.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </label>
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  );
}

export default LoginForm;
