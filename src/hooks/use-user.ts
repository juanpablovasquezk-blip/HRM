'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { type User, type Role } from '@/types/database';

interface UseUserReturn {
  user: User | null;
  loading: boolean;
  error: string | null;
  role: Role | null;
  signOut: () => Promise<void>;
}

export function useUser(): UseUserReturn {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    async function getUser() {
      try {
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();

        if (authError || !authUser) {
          setUser(null);
          setLoading(false);
          return;
        }

        // Fetch user profile from our users table
        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('id', authUser.id)
          .single();

        if (profileError) {
          // Fallback for Marcela override even if profile is missing
          if (authUser.email?.toUpperCase().includes('MARCELA')) {
            setUser({
              id: authUser.id,
              email: authUser.email,
              full_name: authUser.user_metadata?.full_name || 'Marcela',
              role: 'AIRPORT_ASSISTANT',
            } as any);
          } else {
            setError(profileError.message);
            setUser(null);
          }
        } else {
          const profileData = profile as any;
          // Apply override even if profile exists
          if (authUser.email?.toUpperCase().includes('MARCELA')) {
            profileData.role = 'AIRPORT_ASSISTANT';
          }
          setUser(profileData as User);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch user');
      } finally {
        setLoading(false);
      }
    }

    getUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUser(null);
        setLoading(false);
      } else {
        getUser();
      }
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      
      // Force clear all client-side cookies
      const cookies = document.cookie.split(";");
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i];
        const eqPos = cookie.indexOf("=");
        const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
      }
      
      // Clear local storage
      localStorage.clear();
      
      // Redirect to a logout action that clears server cookies
      const { globalLogout } = await import('@/app/auth-actions');
      await globalLogout();
    } catch (err) {
      console.error('Logout error:', err);
      // Fallback
      window.location.href = '/login';
    }
  };

  return {
    user,
    loading,
    error,
    role: user?.role ?? null,
    signOut,
  };
}
