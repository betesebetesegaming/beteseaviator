"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, initAnalytics } from "./firebase";
import { db } from "./firestore";
import { loginPathFor } from "./staff-routes";
import { hardRedirect } from "./hardRedirect";
import { isAgentRole } from "@/lib/roles";
import type { Role, UserProfile, Wallet } from "./types";

interface AuthState {
  fbUser: User | null;
  profile: UserProfile | null;
  wallet: Wallet | null;
  /** True until Firebase session restore finishes (capped for guests). */
  loading: boolean;
  /** True once the users/{uid} Firestore read has completed or timed out. */
  profileReady: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  fbUser: null,
  profile: null,
  wallet: null,
  loading: true,
  profileReady: false,
  logout: async () => {},
});

export function homeFor(role: Role | undefined | null): string {
  if (role === "admin" || isAgentRole(role)) return "/admin";
  if (role === "player") return "/play";
  return "/play";
}

export { loginPathFor } from "./staff-routes";

/** Brief wait for Firebase to restore a persisted session — avoids flashing "Demo mode". */
const AUTH_RESTORE_MS = 500;
/** Never block guest session restore longer than this. */
const AUTH_MAX_WAIT_MS = 1800;
/** Staff routes may wait a bit longer for the profile doc before giving up. */
const PROFILE_MAX_WAIT_MS = 3000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [fbUser, setFbUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [sessionResolved, setSessionResolved] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [forceReady, setForceReady] = useState(false);
  const [profileForceReady, setProfileForceReady] = useState(false);

  const lastUidRef = useRef<string | null>(null);
  const signOutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const explicitSignOutRef = useRef(false);

  useEffect(() => {
    const readyTimer = setTimeout(() => setForceReady(true), AUTH_MAX_WAIT_MS);
    void initAnalytics();

    return () => {
      clearTimeout(readyTimer);
    };
  }, []);

  useEffect(() => {
    if (!fbUser) {
      setProfileForceReady(false);
      return;
    }

    setProfileForceReady(false);
    const profileTimer = setTimeout(() => setProfileForceReady(true), PROFILE_MAX_WAIT_MS);
    return () => clearTimeout(profileTimer);
  }, [fbUser?.uid]);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      if (signOutTimerRef.current) {
        clearTimeout(signOutTimerRef.current);
        signOutTimerRef.current = null;
      }

      if (u) {
        explicitSignOutRef.current = false;
        const uidChanged = lastUidRef.current !== u.uid;
        lastUidRef.current = u.uid;
        setFbUser(u);
        setSessionResolved(true);
        if (uidChanged) {
          setProfileReady(false);
          setProfile(null);
          setWallet(null);
        }
        return;
      }

      // Firebase may emit null briefly before restoring persisted session — don't sign out yet.
      if (!explicitSignOutRef.current && lastUidRef.current) {
        signOutTimerRef.current = setTimeout(() => {
          if (auth.currentUser) return;
          lastUidRef.current = null;
          setFbUser(null);
          setProfile(null);
          setWallet(null);
          setProfileReady(true);
          setSessionResolved(true);
        }, 400);
        return;
      }

      lastUidRef.current = null;
      setFbUser(null);
      setProfile(null);
      setWallet(null);
      setProfileReady(true);

      signOutTimerRef.current = setTimeout(() => {
        setSessionResolved(true);
      }, AUTH_RESTORE_MS);
    });
  }, []);

  useEffect(() => {
    if (!fbUser) return;

    let cancelled = false;
    const uid = fbUser.uid;

    void getDoc(doc(db, "users", uid)).then((snap) => {
      if (cancelled || auth.currentUser?.uid !== uid) return;
      setProfile(snap.exists() ? ({ uid: snap.id, ...snap.data() } as UserProfile) : null);
      setProfileReady(true);
    });

    const unsubProfile = onSnapshot(
      doc(db, "users", uid),
      (snap) => {
        if (cancelled || auth.currentUser?.uid !== uid) return;
        setProfile(snap.exists() ? ({ uid: snap.id, ...snap.data() } as UserProfile) : null);
        setProfileReady(true);
      },
      () => {
        if (!cancelled) setProfileReady(true);
      }
    );

    const unsubWallet = onSnapshot(doc(db, "wallets", uid), (snap) => {
      if (!cancelled) setWallet(snap.exists() ? (snap.data() as Wallet) : null);
    });

    return () => {
      cancelled = true;
      unsubProfile();
      unsubWallet();
    };
  }, [fbUser?.uid]);

  // Persist a throttled last-login timestamp for players (drives Smart Bonus
  // login-recency scoring). users/{uid} is read-only from clients, so we use a
  // dedicated self-writable playerActivity/{uid} doc. Throttled to ~1/hour.
  useEffect(() => {
    const uid = fbUser?.uid;
    if (!uid || profile?.role !== "player") return;
    try {
      const key = `betese:lastLoginPing:${uid}`;
      const last = Number(window.localStorage.getItem(key) ?? 0);
      if (Date.now() - last < 60 * 60 * 1000) return;
      window.localStorage.setItem(key, String(Date.now()));
      void setDoc(
        doc(db, "playerActivity", uid),
        { lastLoginAt: serverTimestamp() },
        { merge: true }
      ).catch(() => undefined);
    } catch {
      /* localStorage unavailable / offline — login recency stays approximate */
    }
  }, [fbUser?.uid, profile?.role]);

  const logout = async () => {
    explicitSignOutRef.current = true;
    const redirect = loginPathFor(profile?.role) || "/admin/login";
    void signOut(auth).catch(() => undefined);
    hardRedirect(redirect);
  };

  const sessionPending = !sessionResolved;
  const profilePending = !!fbUser && !profileReady;
  const loading =
    (sessionPending && !forceReady) || (profilePending && !profileForceReady);

  return (
    <AuthContext.Provider
      value={{
        fbUser,
        profile,
        wallet,
        loading,
        profileReady: profileReady || profileForceReady,
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

export function profileMatchesUser(
  profile: UserProfile | null | undefined,
  fbUser: User | null | undefined,
): boolean {
  return !!fbUser && !!profile && profile.uid === fbUser.uid;
}
