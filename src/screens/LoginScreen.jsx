import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Loader2, KeyRound, Mail, ArrowRight } from 'lucide-react';

export const LoginScreen = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;
            // AuthContext will handle state update via onAuthStateChange
        } catch (err) {
            console.error('Login error:', err);
            setError(err.message === 'Invalid login credentials'
                ? 'Credenciales incorrectas. Intenta de nuevo.'
                : err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
            <div className="w-full max-w-sm space-y-8">
                <div className="text-center space-y-2">
                    <div className="w-16 h-16 bg-gradient-to-tr from-green-500 to-blue-600 rounded-2xl mx-auto flex items-center justify-center shadow-2xl shadow-green-900/50 mb-6">
                        <KeyRound className="text-white w-8 h-8" />
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tighter">
                        Roman App
                    </h1>
                    <p className="text-neutral-500 font-medium">
                        Identifícate para entrar
                    </p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-4">
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <Mail className="text-neutral-600 group-focus-within:text-green-500 transition-colors" size={20} />
                            </div>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-neutral-900 border border-neutral-800 text-white pl-11 pr-4 py-4 rounded-xl focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-all placeholder:text-neutral-600 font-medium"
                                placeholder="Email"
                                required
                            />
                        </div>

                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <KeyRound className="text-neutral-600 group-focus-within:text-green-500 transition-colors" size={20} />
                            </div>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-neutral-900 border border-neutral-800 text-white pl-11 pr-4 py-4 rounded-xl focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-all placeholder:text-neutral-600 font-medium"
                                placeholder="Contraseña"
                                required
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                            <p className="text-red-400 text-sm text-center font-medium">
                                {error}
                            </p>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-white hover:bg-neutral-200 text-black font-bold py-4 rounded-xl transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <Loader2 className="animate-spin" size={20} />
                        ) : (
                            <>
                                Entrar <ArrowRight size={20} />
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};
