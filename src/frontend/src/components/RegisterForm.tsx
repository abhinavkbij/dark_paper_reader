import React from 'react';
import { useAuth } from '../context/AuthContext';

export const RegisterForm: React.FC<{ onSwitchToLogin: () => void }> = ({ onSwitchToLogin }) => {
    const { register, loading, error } = useAuth();
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        await register(email, password);
    }

    return (
        <form onSubmit={onSubmit} className="auth-form">
            <h2>Register</h2>
            {error && <div style={{ color: 'red' }}>{error}</div>}
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            <button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create account'}</button>
            <button type="button" onClick={onSwitchToLogin}>Have an account? Login</button>
        </form>
    );
};