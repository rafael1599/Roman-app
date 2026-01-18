import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [role, setRole] = useState(null); // 'admin' | 'staff'
    const [loading, setLoading] = useState(true);
    const [viewAsUser, setViewAsUser] = useState(() => {
        // Persist view preference
        return localStorage.getItem('view_as_user') === 'true';
    });

    useEffect(() => {
        let mounted = true;

        const initAuth = async () => {
            try {
                // 1. Get initial session
                const { data: { session }, error } = await supabase.auth.getSession();

                if (error) throw error;

                if (session?.user) {
                    if (mounted) setUser(session.user);

                    // OPTIMIZATION: Check local storage first for instant load
                    const cachedRole = localStorage.getItem(`role_${session.user.id}`);
                    if (cachedRole && mounted) {
                        setRole(cachedRole);
                        setLoading(false); // Unblock UI immediately

                        // Re-verify in background (silent update)
                        fetchProfileWithTimeout(session.user.id, true);
                    } else {
                        // No cache, must wait
                        await fetchProfileWithTimeout(session.user.id, false);
                    }
                } else {
                    if (mounted) setLoading(false);
                }
            } catch (err) {
                console.error('Auth initialization error:', err);
                if (mounted) setLoading(false);
            }
        };

        initAuth();

        // 3. Listen for changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('Auth event:', event); // Debug

            if (session?.user) {
                if (mounted) setUser(session.user);

                if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
                    // Check cache again for consistent behavior on sign-in events
                    const cachedRole = localStorage.getItem(`role_${session.user.id}`);
                    if (cachedRole && mounted) {
                        setRole(cachedRole);
                        setLoading(false);
                        fetchProfileWithTimeout(session.user.id, true);
                    } else {
                        await fetchProfileWithTimeout(session.user.id, false);
                    }
                }
            } else if (event === 'SIGNED_OUT') {
                if (mounted) {
                    // Clear user-specific cache on logout if desired, 
                    // or keep it. Clearing is safer for shared devices.
                    // But for "my phone" logic, keeping it is fine, though accessing it requires user ID which we lose.
                    // We can just rely on overwriting next time.
                    setUser(null);
                    setRole(null);
                    setLoading(false);
                }
            }
        });

        return () => {
            mounted = false;
            subscription?.unsubscribe();
        };
    }, []);

    const [profile, setProfile] = useState(null);

    const fetchProfileWithTimeout = async (userId, isBackground = false) => {
        // If background, we don't block loading

        const timeoutMs = 3000;
        const timeout = new Promise(resolve => setTimeout(() => resolve('timeout'), timeoutMs));

        const fetch = async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('role, full_name')
                .eq('id', userId)
                .single();
            return { data, error };
        };

        try {
            const result = await Promise.race([fetch(), timeout]);

            if (result === 'timeout') {
                if (!isBackground) {
                    console.warn('Profile fetch timed out, defaulting to Staff');
                    setRole('staff');
                }
            } else if (result.error) {
                if (!isBackground) {
                    console.warn('Profile fetch error:', result.error);
                    setRole('staff');
                }
            } else if (result.data) {
                // Success - update state and cache
                setRole(result.data.role);
                setProfile(result.data);
                localStorage.setItem(`role_${userId}`, result.data.role);
            } else {
                if (!isBackground) setRole('staff');
            }
        } catch (e) {
            console.error('Profile fetch exception:', e);
            if (!isBackground) setRole('staff');
        } finally {
            if (!isBackground) setLoading(false);
        }
    };

    const updateProfileName = async (newName) => {
        if (!user) return;
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ full_name: newName })
                .eq('id', user.id);

            if (error) throw error;

            setProfile(prev => ({ ...prev, full_name: newName }));
            return { success: true };
        } catch (err) {
            console.error('Update profile error:', err);
            return { success: false, error: err.message };
        }
    };

    const signOut = async () => {
        setLoading(true);
        await supabase.auth.signOut();
        setRole(null);
        setProfile(null);
        setUser(null);
        setLoading(false);
    };

    const toggleAdminView = () => {
        setViewAsUser(prev => {
            const newValue = !prev;
            localStorage.setItem('view_as_user', String(newValue));
            return newValue;
        });
    };

    const value = {
        user,
        role,
        profile,
        isAdmin: role === 'admin' && !viewAsUser,
        isSystemAdmin: role === 'admin', // For internal checks if needed
        viewAsUser,
        loading,
        signOut,
        updateProfileName,
        toggleAdminView
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
