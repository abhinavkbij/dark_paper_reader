const BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001';

export type User = {
    id: string;
    email: string;
    createdAt: string;
    verified?: boolean;
};

export type AuthResponse = {
    token: string;
    user: User;
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
        ...options,
    });
    if (!res.ok) {
        let msg = 'Request failed';
        try {
            const data = await res.json();
            msg = data.error || msg;
        } catch {}
        throw new Error(msg);
    }
    return res.json();
}

export async function register(email: string, password: string): Promise<AuthResponse> {
    return request<AuthResponse>('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
    });
}

export async function login(email: string, password: string): Promise<AuthResponse> {
    return request<AuthResponse>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
    });
}

export async function me(token: string): Promise<{ user: User }> {
    return request<{ user: User }>('/api/v1/auth/me', {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
}

export async function resendVerification(token: string): Promise<{ message: string }> {
    return request<{ message: string }>('/api/v1/auth/resend-verification', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
}
