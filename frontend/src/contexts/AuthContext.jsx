import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config';
import { getUserProfile } from '../services/userService';
import * as authService from '../services/authService';

const AuthContext = createContext(null);

/** True when onboarding finished (flag) or legacy complete profile without the flag. */
export function isProfileOnboarded(profile) {
  if (!profile) return false;
  if (profile.onboardingCompleted) return true;
  return Boolean(
    profile.displayName &&
      profile.age &&
      profile.occupation &&
      profile.investmentPropensity &&
      profile.targetAssetAmount != null &&
      profile.targetYears &&
      profile.goalDescription,
  );
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // Keep routes loading until profile is fetched; otherwise login briefly sees
      // profile=null and dumps completed users onto /onboarding.
      setLoading(true);
      setUser(firebaseUser);
      try {
        if (firebaseUser) {
          const data = await getUserProfile(firebaseUser.uid);
          setProfile(data);
        } else {
          setProfile(null);
        }
      } catch (error) {
        console.warn('Failed to load user profile:', error);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const refreshProfile = async () => {
    if (!auth.currentUser) {
      setProfile(null);
      return null;
    }
    const data = await getUserProfile(auth.currentUser.uid);
    setProfile(data);
    return data;
  };

  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      isOnboarded: isProfileOnboarded(profile),
      signUp: authService.signUp,
      signIn: authService.signIn,
      resetPassword: authService.resetPassword,
      logOut: authService.logOut,
      refreshProfile,
    }),
    [user, profile, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
