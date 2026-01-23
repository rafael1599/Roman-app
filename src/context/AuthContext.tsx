import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabaseClient';
import { type User } from '@supabase/supabase-js';

export interface AuthProfile {
  role: 'admin' | 'staff' | string;
  full_name: string | null;
  last_seen_at?: string | null;
}

interface AuthContextType {
  user: User | null;
  role: string | null;
  profile: AuthProfile | null;
  isAdmin: boolean;
  isSystemAdmin: boolean;
  viewAsUser: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  updateProfileName: (newName: string) => Promise<{ success: boolean; error?: string }>;
  toggleAdminView: () => void;
  isDemoMode: boolean;
  toggleDemoMode: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null); // 'admin' | 'staff'
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [viewAsUser, setViewAsUser] = useState<boolean>(() => {
    return localStorage.getItem('view_as_user') === 'true';
  });
  const [isDemoMode, setIsDemoMode] = useState<boolean>(() => {
    return localStorage.getItem('is_demo_mode') === 'true';
  });

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();
        if (error) throw error;

        if (session?.user) {
          if (mounted) setUser(session.user);

          const cachedRole = localStorage.getItem(`role_${session.user.id}`);
          if (cachedRole && mounted) {
            setRole(cachedRole);
            setLoading(false);
            fetchProfileWithTimeout(session.user.id, true);
          } else {
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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        if (mounted) setUser(session.user);

        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          const cachedRole = localStorage.getItem(`role_${session.user.id}`);
          if (cachedRole && mounted) {
            setRole(cachedRole);
            setLoading(false);

            // Auto-reset viewAsUser for admins on sign-in
            if (cachedRole === 'admin') {
              setViewAsUser(false);
              localStorage.setItem('view_as_user', 'false');
            }

            fetchProfileWithTimeout(session.user.id, true);
          } else {
            await fetchProfileWithTimeout(session.user.id, false);
          }
        }
      } else if (event === 'SIGNED_OUT') {
        if (mounted) {
          setUser(null);
          setRole(null);
          setProfile(null);
          setLoading(false);
        }
      }
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  // Force disable demo mode for non-admins
  useEffect(() => {
    if (role && role !== 'admin' && isDemoMode) {
      console.warn('Unauthorized Demo Mode detected. Force disabling.');
      setIsDemoMode(false);
      localStorage.removeItem('is_demo_mode');
    }
  }, [role, isDemoMode]);

  // Update last seen
  useEffect(() => {
    if (user && !isDemoMode) {
      const updateLastSeen = async () => {
        await supabase
          .from('profiles')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', user.id);
      };
      updateLastSeen();
    }
  }, [user?.id, isDemoMode]);

  const fetchProfileWithTimeout = async (userId: string, isBackground = false) => {
    const timeoutMs = 3000;
    const timeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), timeoutMs));

    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('role, full_name, last_seen_at')
        .eq('id', userId)
        .single();
      return { data, error };
    };

    try {
      const result = await Promise.race([fetchProfile(), timeout]);

      if (result === 'timeout') {
        if (!isBackground) setRole('staff');
      } else if (
        typeof result === 'object' &&
        result !== null &&
        'error' in result &&
        result.error
      ) {
        if (!isBackground) setRole('staff');
      } else if (typeof result === 'object' && result !== null && 'data' in result && result.data) {
        const profileData = result.data as AuthProfile;
        setRole(profileData.role);
        setProfile(profileData);
        localStorage.setItem(`role_${userId}`, profileData.role);

        // Auto-reset viewAsUser for admins on sign-in
        if (profileData.role === 'admin') {
          setViewAsUser(false);
          localStorage.setItem('view_as_user', 'false');
        }

        // FORCE DISABLE DEMO MODE FOR NON-ADMINS
        if (profileData.role !== 'admin' && isDemoMode) {
          setIsDemoMode(false);
          localStorage.removeItem('is_demo_mode');
        }
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

  const updateProfileName = async (newName: string) => {
    if (!user) return { success: false, error: 'No user session' };

    if (isDemoMode) {
      // Simulate profile update locally
      setProfile((prev) => (prev ? { ...prev, full_name: newName } : null));
      return { success: true };
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: newName })
        .eq('id', user.id);

      if (error) throw error;

      setProfile((prev) => (prev ? { ...prev, full_name: newName } : null));
      return { success: true };
    } catch (err: any) {
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
    setViewAsUser((prev) => {
      const newValue = !prev;
      localStorage.setItem('view_as_user', String(newValue));
      return newValue;
    });
  };

  const toggleDemoMode = () => {
    if (role !== 'admin') {
      console.error('Only admins can toggle demo mode');
      return;
    }
    setIsDemoMode((prev) => {
      const newValue = !prev;
      localStorage.setItem('is_demo_mode', String(newValue));
      return newValue;
    });
  };

  const value = {
    user,
    role,
    profile,
    isAdmin: role === 'admin' && !viewAsUser,
    isSystemAdmin: role === 'admin',
    viewAsUser,
    isDemoMode,
    loading,
    signOut,
    updateProfileName,
    toggleAdminView,
    toggleDemoMode,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
