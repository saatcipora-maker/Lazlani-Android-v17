import React, { useEffect, useState } from 'react';
import {
  Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';

WebBrowser.maybeCompleteAuthSession();

const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
  ?? Constants.expoConfig?.extra?.googleAndroidClientId;

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login, loginWithGoogle, requestPasswordReset, confirmPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleRequest, googleResponse, promptGoogle] = Google.useIdTokenAuthRequest({
    androidClientId: googleAndroidClientId,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  useEffect(() => {
    if (!googleResponse) return;
    if (googleResponse.type === 'dismiss' || googleResponse.type === 'cancel') {
      setGoogleLoading(false);
      return;
    }
    if (googleResponse.type !== 'success') {
      setGoogleLoading(false);
      Alert.alert('Google Girişi Başarısız', 'Google oturumu doğrulanamadı. Lütfen tekrar deneyin.');
      return;
    }

    const idToken = googleResponse.authentication?.idToken
      ?? (typeof googleResponse.params.id_token === 'string' ? googleResponse.params.id_token : null);
    if (!idToken) {
      setGoogleLoading(false);
      Alert.alert('Google Girişi Başarısız', 'Google kimlik doğrulama yanıtı eksik.');
      return;
    }

    void loginWithGoogle(idToken).then(result => {
      setGoogleLoading(false);
      if (!result.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Google Girişi Başarısız', result.message);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    });
  }, [googleResponse]);

  const handleGoogleLogin = async () => {
    if (!googleRequest) {
      Alert.alert('Google Girişi Kullanılamıyor', 'Google giriş yapılandırması henüz hazır değil.');
      return;
    }
    setGoogleLoading(true);
    try {
      await promptGoogle();
    } catch {
      setGoogleLoading(false);
      Alert.alert('Bağlantı Hatası', 'Google girişine bağlanılamadı. İnternet bağlantınızı kontrol edin.');
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Hata', 'Tüm alanları doldurun.');
      return;
    }
    setLoading(true);
    const ok = await login(email.trim(), password);
    setLoading(false);
    if (ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Hatalı Giriş', 'E-posta veya şifre yanlış.');
    }
  };

  const closeReset = () => {
    setShowReset(false);
    setResetStep('request');
    setResetEmail('');
    setResetCode('');
    setResetPasswordValue('');
    setResetConfirm('');
    setResetMessage('');
  };

  const handleSendResetCode = async () => {
    const normalizedEmail = resetEmail.trim();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      Alert.alert('Hata', 'Geçerli bir e-posta adresi girin.');
      return;
    }

    setResetLoading(true);
    setResetMessage('');
    const result = await requestPasswordReset(normalizedEmail);
    setResetLoading(false);
    if (!result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setResetMessage(result.message);
      Alert.alert('Kod gönderilemedi', result.message);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setResetStep('confirm');
    setResetCode('');
    setResetMessage(
      `${result.message} Kod ${Math.round((result.expiresInSeconds ?? 900) / 60)} dakika geçerlidir.`,
    );
  };

  const handleResetPassword = async () => {
    const normalizedEmail = resetEmail.trim();
    if (!/^\d{6}$/.test(resetCode)) {
      Alert.alert('Hata', 'E-postadaki 6 haneli doğrulama kodunu girin.');
      return;
    }
    if (resetPasswordValue.length < 8) {
      Alert.alert('Hata', 'Yeni şifre en az 8 karakter olmalı.');
      return;
    }
    if (resetPasswordValue !== resetConfirm) {
      Alert.alert('Hata', 'Yeni şifreler eşleşmiyor.');
      return;
    }

    setResetLoading(true);
    setResetMessage('');
    const result = await confirmPasswordReset(normalizedEmail, resetCode, resetPasswordValue);
    setResetLoading(false);
    if (!result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setResetMessage(result.message);
      Alert.alert('Şifre yenilenemedi', result.message);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    closeReset();
    setEmail(normalizedEmail);
    Alert.alert('Şifre yenilendi', result.message);
  };

  return (
    <LinearGradient
      colors={['#1A0B3B', '#0D0B24']}
      style={[styles.root, { paddingTop: topPad }]}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: botPad + 16 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Logo */}
        <View style={styles.logoSection}>
          <LinearGradient
            colors={['#9B59F5', '#EC4899']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.logoIcon}
          >
            <Ionicons name="book" size={36} color="#fff" />
          </LinearGradient>
          <Text style={styles.logoText}>LAZLANI</Text>
          <Text style={styles.logoTagline}>Edebiyatın yeni adresi</Text>
        </View>

        {/* Form */}
        <View style={styles.formCard}>
          <Text style={[styles.formTitle, { color: colors.foreground }]}>Hoş Geldin</Text>
          <Text style={[styles.formSubtitle, { color: colors.mutedForeground }]}>Hesabına giriş yap</Text>

          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>E-posta</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.input, borderColor: colors.border }]}>
              <Ionicons name="mail-outline" size={18} color={colors.mutedForeground} />
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="ornek@email.com"
                placeholderTextColor={colors.mutedForeground}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Şifre</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.input, borderColor: colors.border }]}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.mutedForeground} />
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="••••••••"
                placeholderTextColor={colors.mutedForeground}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPass}
              />
              <TouchableOpacity onPress={() => setShowPass(!showPass)}>
                <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={styles.forgotRow}
            onPress={() => {
              setResetEmail(email.trim());
              setResetStep('request');
              setResetMessage('');
              setShowReset(true);
            }}
          >
            <Text style={[styles.forgotText, { color: colors.primary }]}>Şifremi Unuttum</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleLogin} disabled={loading} style={styles.loginBtn} activeOpacity={0.85}>
            <LinearGradient colors={['#9B59F5', '#EC4899']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.loginBtnGrad}>
              {loading ? (
                <Text style={styles.loginBtnText}>Giriş yapılıyor...</Text>
              ) : (
                <Text style={styles.loginBtnText}>Giriş Yap</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>veya</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          <TouchableOpacity
            onPress={handleGoogleLogin}
            disabled={googleLoading}
            style={[styles.googleBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            activeOpacity={0.85}
            testID="google-login-button"
          >
            <Ionicons name="logo-google" size={20} color={colors.foreground} />
            <Text style={[styles.googleBtnText, { color: colors.foreground }]}>
              {googleLoading ? 'Google bekleniyor...' : 'Google ile Giriş Yap'}
            </Text>
          </TouchableOpacity>

        </View>

        {/* Register link */}
        <View style={styles.registerRow}>
          <Text style={[styles.registerText, { color: colors.mutedForeground }]}>Hesabın yok mu?</Text>
          <TouchableOpacity onPress={() => router.push('/auth/register' as any)}>
            <Text style={[styles.registerLink, { color: colors.primary }]}>Kayıt Ol</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
      <Modal visible={showReset} transparent animationType="slide" onRequestClose={closeReset}>
        <KeyboardAvoidingView style={styles.modalRoot} behavior="padding" keyboardVerticalOffset={0}>
          <Pressable style={styles.modalOverlay} onPress={closeReset} />
          <ScrollView
            style={[styles.resetSheet, { backgroundColor: colors.card, borderColor: colors.border }]}
            contentContainerStyle={styles.resetSheetContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            bounces={false}
          >
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.resetTitle, { color: colors.foreground }]}>Şifremi Unuttum</Text>
            <Text style={[styles.resetDescription, { color: colors.mutedForeground }]}>
              {resetStep === 'request'
                ? 'E-posta adresinize 15 dakika geçerli, tek kullanımlık bir doğrulama kodu göndereceğiz.'
                : 'E-postadaki doğrulama kodunu ve yeni şifrenizi girin.'}
            </Text>
            <TextInput
              style={[styles.resetInput, { color: colors.foreground, backgroundColor: colors.input, borderColor: colors.border }]}
              placeholder="E-posta"
              placeholderTextColor={colors.mutedForeground}
              value={resetEmail}
              onChangeText={setResetEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={resetStep === 'request' && !resetLoading}
              testID="password-reset-email"
            />
            {resetMessage ? (
              <View style={[styles.resetFeedback, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Ionicons
                  name={resetStep === 'confirm' ? 'mail-open-outline' : 'alert-circle-outline'}
                  size={17}
                  color={resetStep === 'confirm' ? colors.primary : colors.destructive}
                />
                <Text style={[styles.resetFeedbackText, { color: colors.foreground }]}>{resetMessage}</Text>
              </View>
            ) : null}
            {resetStep === 'confirm' ? (
              <>
                <TextInput
                  style={[styles.resetInput, styles.codeInput, { color: colors.foreground, backgroundColor: colors.input, borderColor: colors.border }]}
                  placeholder="6 haneli kod"
                  placeholderTextColor={colors.mutedForeground}
                  value={resetCode}
                  onChangeText={value => setResetCode(value.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoCapitalize="none"
                  autoCorrect={false}
                  testID="password-reset-code"
                />
                <TextInput
                  style={[styles.resetInput, { color: colors.foreground, backgroundColor: colors.input, borderColor: colors.border }]}
                  placeholder="Yeni şifre (min. 8 karakter)"
                  placeholderTextColor={colors.mutedForeground}
                  value={resetPasswordValue}
                  onChangeText={setResetPasswordValue}
                  secureTextEntry
                  autoCapitalize="none"
                  testID="password-reset-new-password"
                />
                <TextInput
                  style={[styles.resetInput, { color: colors.foreground, backgroundColor: colors.input, borderColor: colors.border }]}
                  placeholder="Yeni şifre (tekrar)"
                  placeholderTextColor={colors.mutedForeground}
                  value={resetConfirm}
                  onChangeText={setResetConfirm}
                  secureTextEntry
                  autoCapitalize="none"
                  onSubmitEditing={handleResetPassword}
                  testID="password-reset-confirm-password"
                />
              </>
            ) : null}
            <View style={styles.resetActions}>
              <TouchableOpacity
                onPress={resetStep === 'confirm'
                  ? () => {
                    setResetStep('request');
                    setResetCode('');
                    setResetPasswordValue('');
                    setResetConfirm('');
                    setResetMessage('');
                  }
                  : closeReset}
                disabled={resetLoading}
                style={[styles.resetSecondary, { borderColor: colors.border }]}
              >
                <Text style={[styles.resetSecondaryText, { color: colors.foreground }]}>
                  {resetStep === 'confirm' ? 'Yeni Kod' : 'Vazgeç'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={resetStep === 'request' ? handleSendResetCode : handleResetPassword}
                disabled={resetLoading}
                style={[styles.resetPrimary, { backgroundColor: colors.primary }]}
                testID="password-reset-submit"
              >
                <Text style={[styles.resetPrimaryText, { color: colors.primaryForeground }]}>
                  {resetLoading
                    ? (resetStep === 'request' ? 'Gönderiliyor...' : 'Doğrulanıyor...')
                    : (resetStep === 'request' ? 'Kod Gönder' : 'Şifreyi Yenile')}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 24 },
  logoSection: { alignItems: 'center', gap: 10 },
  logoIcon: { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#FFFFFF', fontFamily: 'Poppins_700Bold', fontSize: 32, letterSpacing: 4 },
  logoTagline: { color: 'rgba(255,255,255,0.5)', fontFamily: 'Poppins_400Regular', fontSize: 14 },
  formCard: { gap: 14 },
  formTitle: { fontFamily: 'Poppins_700Bold', fontSize: 24 },
  formSubtitle: { fontFamily: 'Poppins_400Regular', fontSize: 14, marginBottom: 4 },
  inputGroup: { gap: 6 },
  inputLabel: { fontFamily: 'Poppins_500Medium', fontSize: 13 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13,
  },
  input: { flex: 1, fontFamily: 'Poppins_400Regular', fontSize: 14 },
  forgotRow: { alignItems: 'flex-end' },
  forgotText: { fontFamily: 'Poppins_500Medium', fontSize: 13 },
  loginBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 4 },
  loginBtnGrad: { paddingVertical: 15, alignItems: 'center' },
  loginBtnText: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: 16 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 2 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontFamily: 'Poppins_400Regular', fontSize: 12 },
  googleBtn: {
    minHeight: 52, borderWidth: 1, borderRadius: 16, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  googleBtnText: { fontFamily: 'Poppins_600SemiBold', fontSize: 15 },
  demoHint: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderWidth: 1 },
  demoText: { fontFamily: 'Poppins_400Regular', fontSize: 12, flex: 1 },
  registerRow: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  registerText: { fontFamily: 'Poppins_400Regular', fontSize: 14 },
  registerLink: { fontFamily: 'Poppins_700Bold', fontSize: 14 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  resetSheet: { maxHeight: '88%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1 },
  resetSheetContent: { padding: 22, paddingBottom: 36, gap: 12 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  resetTitle: { fontFamily: 'Poppins_700Bold', fontSize: 22 },
  resetDescription: { fontFamily: 'Poppins_400Regular', fontSize: 13, lineHeight: 20 },
  resetInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontFamily: 'Poppins_400Regular', fontSize: 14 },
  codeInput: { fontFamily: 'Poppins_600SemiBold', fontSize: 20, letterSpacing: 6, textAlign: 'center' },
  resetFeedback: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: 12, padding: 12 },
  resetFeedbackText: { flex: 1, fontFamily: 'Poppins_400Regular', fontSize: 12, lineHeight: 18 },
  resetActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  resetSecondary: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  resetSecondaryText: { fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
  resetPrimary: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  resetPrimaryText: { fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
});
