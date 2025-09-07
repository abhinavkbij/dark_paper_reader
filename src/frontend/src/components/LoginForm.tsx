import React from 'react';
import { useAuth } from '../context/AuthContext';

export const LoginForm: React.FC<{ onSwitchToRegister: () => void }> = ({ onSwitchToRegister }) => {
    const { login, loading, error } = useAuth();
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        await login(email, password);
    }

    return (
        <form onSubmit={onSubmit} className="auth-form">
            <h2>Login</h2>
            {error && <div style={{ color: 'red' }}>{error}</div>}
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            <button type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Login'}</button>
            <button type="button" onClick={onSwitchToRegister}>Need an account? Register</button>
        </form>
    );
};