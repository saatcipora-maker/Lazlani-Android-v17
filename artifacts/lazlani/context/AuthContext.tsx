import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '@/data/types';
import { useTheme } from '@/context/ThemeContext';
import { useData } from '@/context/DataContext';
import { THEMES, ThemeName } from '@/constants/colors';
import { resolveLegacyOwnerUserId } from '@/services/authStorageBinding';
import {
  authGoogle,
  authChangePassword,
  authLogin,
  authLogout,
  authRegister,
  authSession,
  authUpdateProfile,
  confirmPasswordReset as confirmPasswordResetRequest,
  requestPasswordReset as requestPasswordResetRequest,
  setAuthTokenGetter,
} from '@workspace/api-client-react';

type ProfileUpdates = Partial<Pick<User,
  'displayName' | 'bio' | 'avatarColor' | 'coverColor' | 'username' | 'avatarUrl' | 'coverUrl' | 'theme'
>>;

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  loginWithGoogle: (idToken: string) => Promise<PasswordResetResult>;
  register: (username: string, displayName: string, email: string, password: string) => Promise<boolean>;
  requestPasswordReset: (email: string) => Promise<PasswordResetResult>;
  confirmPasswordReset: (email: string, code: string, newPassword: string) => Promise<PasswordResetResult>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<PasswordResetResult>;
  logout: () => Promise<void>;
  clearLocalSession: () => Promise<void>;
  updateProfile: (updates: ProfileUpdates) => Promise<void>;
  refreshSession: () => Promise<boolean>;
}

interface PasswordResetResult {
  ok: boolean;
  message: string;
  expiresInSeconds?: number;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const STORAGE_KEY = 'lazlani_user';
const TOKEN_KEY = 'lazlani_auth_token';
let currentAuthToken: string | null = null;
setAuthTokenGetter(() => currentAuthToken);

function apiErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback;
  const data = (error as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return fallback;
  const candidate = (data as { error?: unknown; message?: unknown }).error
    ?? (data as { error?: unknown; message?: unknown }).message;
  return typeof candidate === 'string' && candidate.trim() ? candidate : fallback;
}

async function captureStoredUserId(): Promise<string | null> {
  const [currentValue, historicalValue] = await AsyncStorage.multiGet([
    STORAGE_KEY,
    'lazlani_current_user',
  ]);
  return resolveLegacyOwnerUserId(currentValue[1], historicalValue[1]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { setTheme } = useTheme();
  const { addUser, setSyncSession } = useData();

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const legacyOwnerUserId = await captureStoredUserId();
        currentAuthToken = await AsyncStorage.getItem(TOKEN_KEY);
        if (!currentAuthToken) return;
        const response = await authSession();
        const restoredUser: User = response.user;
        setUser(restoredUser);
        setSyncSession(restoredUser.id, currentAuthToken, legacyOwnerUserId);
        addUser(restoredUser);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(restoredUser));
        if (restoredUser.theme && restoredUser.theme in THEMES) {
          setTheme(restoredUser.theme as ThemeName);
        }
      } catch {
        currentAuthToken = null;
        setSyncSession(null, null, null);
        await AsyncStorage.multiRemove([TOKEN_KEY, STORAGE_KEY]);
      } finally {
        setLoading(false);
      }
    };
    void restoreSession();
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const response = await authLogin({ email: email.trim().toLowerCase(), password });
      const legacyOwnerUserId = await captureStoredUserId();
      currentAuthToken = response.token;
      const authenticatedUser: User = response.user;
      setUser(authenticatedUser);
      setSyncSession(authenticatedUser.id, response.token, legacyOwnerUserId);
      addUser(authenticatedUser);
      await AsyncStorage.multiSet([
        [TOKEN_KEY, response.token],
        [STORAGE_KEY, JSON.stringify(authenticatedUser)],
      ]);
      if (authenticatedUser.theme && authenticatedUser.theme in THEMES) {
        setTheme(authenticatedUser.theme as ThemeName);
      }
      return true;
    } catch {
      setSyncSession(null, null, null);
      return false;
    }
  };

  const loginWithGoogle = async (idToken: string): Promise<PasswordResetResult> => {
    try {
      const verification = await authGoogle({ idToken });
      const legacyOwnerUserId = await captureStoredUserId();
      currentAuthToken = verification.token;
      const authenticatedUser: User = verification.user;
      setUser(authenticatedUser);
      setSyncSession(authenticatedUser.id, verification.token, legacyOwnerUserId);
      addUser(authenticatedUser);
      await AsyncStorage.multiSet([
        [TOKEN_KEY, verification.token],
        [STORAGE_KEY, JSON.stringify(authenticatedUser)],
      ]);
      if (authenticatedUser.theme && authenticatedUser.theme in THEMES) {
        setTheme(authenticatedUser.theme as ThemeName);
      }
      return { ok: true, message: 'Google hesabınızla giriş yapıldı.' };
    } catch (error) {
      return {
        ok: false,
        message: apiErrorMessage(error, 'Google ile giriş tamamlanamadı. Lütfen tekrar deneyin.'),
      };
    }
  };

  const requestPasswordReset = async (email: string): Promise<PasswordResetResult> => {
    const normalizedEmail = email.trim().toLowerCase();
    try {
      const response = await requestPasswordResetRequest({ email: normalizedEmail });
      return {
        ok: true,
        message: response.message,
        expiresInSeconds: response.expiresInSeconds,
      };
    } catch (error) {
      return {
        ok: false,
        message: apiErrorMessage(error, 'Kod gönderilemedi. Lütfen bağlantınızı kontrol edip tekrar deneyin.'),
      };
    }
  };

  const confirmPasswordReset = async (
    email: string,
    code: string,
    newPassword: string,
  ): Promise<PasswordResetResult> => {
    const normalizedEmail = email.trim().toLowerCase();
    try {
      const response = await confirmPasswordResetRequest({
        email: normalizedEmail,
        code,
        newPassword,
      });
      return { ok: true, message: response.message };
    } catch (error) {
      return {
        ok: false,
        message: apiErrorMessage(error, 'Şifre yenilenemedi. Kodun süresini ve bağlantınızı kontrol edin.'),
      };
    }
  };

  const register = async (
    username: string, displayName: string, email: string, password: string
  ): Promise<boolean> => {
    try {
      const response = await authRegister({
        username: username.trim(),
        displayName: displayName.trim(),
        email: email.trim().toLowerCase(),
        password,
      });
      currentAuthToken = response.token;
      const newUser: User = response.user;
      const legacyOwnerUserId = await captureStoredUserId();
      addUser(newUser);
      setUser(newUser);
      setSyncSession(newUser.id, response.token, legacyOwnerUserId);
      await AsyncStorage.multiSet([
        [TOKEN_KEY, response.token],
        [STORAGE_KEY, JSON.stringify(newUser)],
      ]);
      return true;
    } catch {
      setSyncSession(null, null, null);
      return false;
    }
  };

  const clearLocalSession = async () => {
    currentAuthToken = null;
    setSyncSession(null, null, null);
    setUser(null);
    await AsyncStorage.multiRemove([TOKEN_KEY, STORAGE_KEY]);
  };

  const logout = async () => {
    try {
      await authLogout();
    } catch {
      // Yerel oturum her durumda kapatılır; sunucu belirteci ayrıca süre sonunda geçersizleşir.
    }
    await clearLocalSession();
  };

  const changePassword = async (
    currentPassword: string,
    newPassword: string,
  ): Promise<PasswordResetResult> => {
    try {
      const response = await authChangePassword({ currentPassword, newPassword });
      currentAuthToken = response.token;
      const authenticatedUser: User = response.user;
      const legacyOwnerUserId = await captureStoredUserId();
      setUser(authenticatedUser);
      setSyncSession(authenticatedUser.id, response.token, legacyOwnerUserId);
      await AsyncStorage.multiSet([
        [TOKEN_KEY, response.token],
        [STORAGE_KEY, JSON.stringify(authenticatedUser)],
      ]);
      return { ok: true, message: 'Şifreniz güncellendi. Diğer cihazlardaki oturumlar kapatıldı.' };
    } catch (error) {
      return { ok: false, message: apiErrorMessage(error, 'Şifre güncellenemedi. Lütfen tekrar deneyin.') };
    }
  };

  const updateProfile = async (updates: ProfileUpdates) => {
    if (!user) return;
    const response = await authUpdateProfile(updates);
    const updated: User = response.user;
    setUser(updated);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    // If theme was updated, apply it immediately
    if (updates.theme && updates.theme in THEMES) {
      setTheme(updates.theme as ThemeName);
    }
  };

  const refreshSession = async (): Promise<boolean> => {
    if (!currentAuthToken) return false;
    try {
      const response = await authSession();
      const refreshedUser: User = response.user;
      setUser(refreshedUser);
      addUser(refreshedUser);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(refreshedUser));
      if (refreshedUser.theme && refreshedUser.theme in THEMES) {
        setTheme(refreshedUser.theme as ThemeName);
      }
      return true;
    } catch {
      // A failed refresh never grants access from local state. Keep the
      // existing authenticated session until the normal auth lifecycle can
      // determine whether the token itself is invalid.
      return false;
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      loginWithGoogle,
      register,
      requestPasswordReset,
      confirmPasswordReset,
      changePassword,
      logout,
      clearLocalSession,
      updateProfile,
      refreshSession,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
