import React from 'react';
import { login as apiLogin, register as apiRegister, me as apiMe, User, resendVerification as apiResend,
    AuthResponse } from '../services/auth';

type AuthState = {
    user: User | null;
    token: string | null;
    loading: boolean;
    error: string | null;
};

type AuthContextType = AuthState & {
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string) => Promise<void>;
    logout: () => void;
    refreshMe: () => Promise<void>;
    resendVerification: () => Promise<void>;
};

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, setState] = React.useState<AuthState>({
        user: null,
        token: localStorage.getItem('token'),
        loading: false,
        error: null,
    });

    React.useEffect(() => {
        if (state.token && !state.user) {
            refreshMe();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function handleAuth(res: AuthResponse) {
        localStorage.setItem('token', res.token);
        setState(s => ({ ...s, token: res.token, user: res.user, error: null }));
    }

    async function login(email: string, password: string) {
        try {
            setState(s => ({ ...s, loading: true, error: null }));
            const res = await apiLogin(email, password);
            await handleAuth(res);
        } catch (e: any) {
            setState(s => ({ ...s, error: e.message || 'Login failed' }));
        } finally {
            setState(s => ({ ...s, loading: false }));
        }
    }

    async function register(email: string, password: string) {
        try {
            setState(s => ({ ...s, loading: true, error: null }));
            const res = await apiRegister(email, password);
            await handleAuth(res);
        } catch (e: any) {
            setState(s => ({ ...s, error: e.message || 'Registration failed' }));
        } finally {
            setState(s => ({ ...s, loading: false }));
        }
    }

    function logout() {
        localStorage.removeItem('token');
        setState({ user: null, token: null, loading: false, error: null });
    }

    async function refreshMe() {
        if (!state.token) return;
        try {
            setState(s => ({ ...s, loading: true }));
            const res = await apiMe(state.token);
            setState(s => ({ ...s, user: res.user, error: null }));
        } catch (e: any) {
            // token invalid or expired
            logout();
        } finally {
            setState(s => ({ ...s, loading: false }));
        }
    }

    async function resendVerification() {
        if (!state.token) return;
        try {
            setState(s => ({ ...s, loading: true }));
            await apiResend(state.token);
        } finally {
            setState(s => ({ ...s, loading: false }));
        }
    }


    return (
        <AuthContext.Provider value={{ ...state, login, register, logout, refreshMe, resendVerification
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export function useAuth() {
    const ctx = React.useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}