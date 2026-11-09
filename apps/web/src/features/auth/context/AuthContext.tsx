import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { isAuthRetryableFetchError, type Session, type User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { removePushSubscription } from "@/shared/lib/pushNotifications";
import { readSavedSession, supabase } from "@/shared/lib/supabase";
import { isOnline } from "@/shared/lib/offline";
import { setErrorReportingUser } from "@/shared/lib/errorReporting";
import { claimQueryCache, startQueryPersistence } from "@/shared/lib/queryPersistence";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  // Resolves to false when Supabase wants the email confirmed before signing in.
  signUp: (email: string, password: string) => Promise<boolean>;
  signInWithGoogle: () => Promise<void>;
  linkGoogle: () => Promise<void>;
  hasGoogleIdentity: boolean;
  signOut: () => Promise<void>;
  sendPasswordResetEmail: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

type SupabaseAuthError = Error & {
  code?: string;
  status?: number;
};

const getAuthErrorMessage = (error: unknown) => {
  const authError = error as SupabaseAuthError;
  const message = authError?.message?.toLowerCase() ?? "";
  const code = authError?.code?.toLowerCase() ?? "";
  const isRateLimited =
    authError?.status === 429 ||
    code.includes("rate_limit") ||
    code.includes("over_email_send_rate_limit") ||
    message.includes("email rate limit exceeded");

  if (isRateLimited) {
    return "Too many signup attempts right now. Please wait a bit and try again, or sign in if you already created an account.";
  }
  return error instanceof Error ? error.message : "Authentication failed.";
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    // Bring back this person's saved data before any page renders, so the
    // app opens on their rooms instantly (and never on someone else's).
    const start = async (session: Session | null) => {
      await startQueryPersistence(queryClient, session?.user?.id ?? null);
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    };

    // Opened offline: an expired access token can't be refreshed, and the
    // auth client keeps retrying for a while before giving up. The person is
    // still signed in, so open on the saved session straight away; it's
    // refreshed once the connection is back.
    const savedOffline = isOnline() ? null : readSavedSession();
    if (savedOffline) void start(savedOffline);

    void supabase.auth.getSession().then(({ data, error }) => {
      if (savedOffline) {
        if (data.session) {
          setSession(data.session);
          setUser(data.session.user);
        }
        return;
      }
      // A refresh that failed for lack of network isn't a sign-out either.
      void start(
        data.session ??
          (error && isAuthRetryableFetchError(error) ? readSavedSession() : null),
      );
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Only a real sign-out ends the session here. The initial "no session"
      // that comes when the app opens offline must not sign the person out
      // or clear their saved data.
      if (!session && event !== "SIGNED_OUT") return;
      claimQueryCache(queryClient, session?.user?.id ?? null);
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

  // Error reports carry the auth id (never the email) of who hit them.
  useEffect(() => {
    setErrorReportingUser(user?.id ?? null);
  }, [user?.id]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      const mappedError = new Error(getAuthErrorMessage(error)) as Error & {
        cause?: unknown;
      };
      mappedError.cause = error;
      throw mappedError;
    }
    return !!data.session;
  };

  // Google sends people back to /auth/callback, which picks up the session and
  // continues to wherever they were heading (see postAuthRedirect).
  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw error;
  };

  // Attaches Google to the signed-in account, so a Google login with a different
  // email still opens this account. Needs "manual linking" enabled in Supabase.
  const linkGoogle = async () => {
    const { error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw error;
  };

  const hasGoogleIdentity =
    user?.identities?.some((identity) => identity.provider === "google") ?? false;

  const signOut = async () => {
    // Stop pushes to this device before the session (needed to do it) ends.
    await removePushSubscription();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    queryClient.clear();
  };

  const sendPasswordResetEmail = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        signIn,
        signUp,
        signInWithGoogle,
        linkGoogle,
        hasGoogleIdentity,
        signOut,
        sendPasswordResetEmail,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
