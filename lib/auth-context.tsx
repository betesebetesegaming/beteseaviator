"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth, initAnalytics } from "./firebase";
import { loginPathFor } from "./staff-routes";
import type { Role, UserProfile, Wallet } from "./types";

interface AuthState {
  /** Firebase auth user (null = signed out, undefined = still loading) */
  fbUser: User | null;
  /** Firestore profile with role; null until loaded */
  profile: UserProfile | null;
  wallet: Wallet | null;
  /** true while auth state or profile is being resolved */
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  fbUser: null,
  profile: null,
  wallet: null,
  loading: true,
  logout: async () => {},
});

export function homeFor(role: Role | undefined | null): string {
  switch (role) {
    case "admin":
    case "super_agent":
    case "sub_agent":
      return "/admin";
    case "player":
      return "/play";
    default:
      return "/play";
  }
}

export { loginPathFor } from "./staff-routes";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [fbUser, setFbUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);

  useEffect(() => {
    initAnalytics();
    return onAuthStateChanged(auth, (u) => {
      setFbUser(u);
      setAuthReady(true);
      if (!u) {
        setProfile(null);
        setWallet(null);
        setProfileReady(true);
      } else {
        setProfileReady(false);
      }
    });
  }, []);

  useEffect(() => {
    if (!fbUser) return;

    let cancelled = false;
    let unsubProfile: (() => void) | undefined;
    let unsubWallet: (() => void) | undefined;

    void (async () => {
      const { doc, onSnapshot } = await import("firebase/firestore");
      const { db } = await import("./firestore");
      if (cancelled) return;

      unsubProfile = onSnapshot(
        doc(db, "users", fbUser.uid),
        (snap) => {
          setProfile(
            snap.exists() ? ({ uid: snap.id, ...snap.data() } as UserProfile) : null
          );
          setProfileReady(true);
        },
        () => setProfileReady(true)
      );
      unsubWallet = onSnapshot(doc(db, "wallets", fbUser.uid), (snap) => {
        setWallet(snap.exists() ? (snap.data() as Wallet) : null);
      });
    })();

    return () => {
      cancelled = true;
      unsubProfile?.();
      unsubWallet?.();
    };
  }, [fbUser]);

  const logout = async () => {
    const redirect = loginPathFor(profile?.role);
    await signOut(auth);
    if (typeof window !== "undefined") window.location.href = redirect;
  };

  return (
    <AuthContext.Provider
      value={{
        fbUser,
        profile,
        wallet,
        loading: !authReady || (!!fbUser && !profileReady),
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
