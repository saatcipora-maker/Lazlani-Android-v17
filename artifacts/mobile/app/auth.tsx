import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Redirect, router, type Href } from 'expo-router';
import { useAuth, useSignIn, useSignUp } from '@clerk/expo';
import { Feather } from '@expo/vector-icons';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Step = 'credentials' | 'details' | 'signup-code' | 'signin-code';

/** Errors must be visible on web as well as on devices (Alert is not enough). */
function errorMessage(error: unknown): string {
  const value = error as { code?: string; message?: string; longMessage?: string; errors?: { code?: string; message?: string; longMessage?: string }[] };
  const item = value?.errors?.[0] ?? value;
  const messages: Record<string, string> = {
    form_identifier_exists: 'Bu e-posta adresi kayıtlı. Giriş yap seçeneğini kullan.',
    form_identifier_not_found: 'Bu e-posta adresiyle bir hesap bulunamadı. Kayıt ol seçeneğini kullan.',
    form_password_incorrect: 'Şifre yanlış. Lütfen yeniden dene.',
    form_password_pwned: 'Bu şifre güvenli bulunmadı. Daha önce kullanmadığın güçlü bir şifre seç.',
    form_password_length_too_short: 'Şifren çok kısa. En az 8 karakterli güçlü bir şifre seç.',
    form_code_incorrect: 'Doğrulama kodu yanlış. E-postandaki son kodu gir.',
    verification_expired: 'Kodun süresi dolmuş. Yeni kod gönder seçeneğini kullan.',
    too_many_requests: 'Çok fazla deneme yapıldı. Biraz bekleyip yeniden dene.',
    captcha_invalid: 'Güvenlik kontrolü tamamlanamadı. Kontrolü tamamlayıp yeniden dene.',
    captcha_missing_token: 'Lütfen ekrandaki güvenlik kontrolünü tamamla.',
  };
  return messages[item?.code ?? ''] ?? item?.longMessage ?? item?.message ?? 'İşlem tamamlanamadı. Bağlantını kontrol edip yeniden dene.';
}

export default function AuthScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useAuth();
  const { signIn, fetchStatus: signInStatus } = useSignIn();
  const { signUp, fetchStatus: signUpStatus } = useSignUp();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [step, setStep] = useState<Step>('credentials');
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visiblePassword, setVisiblePassword] = useState(false);
  const [code, setCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [working, setWorking] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const inFlight = useRef(false);
  const busy = working || signInStatus === 'fetching' || signUpStatus === 'fetching';
  const verifying = step === 'signup-code' || step === 'signin-code';

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = setTimeout(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendSeconds]);

  async function run(operation: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setWorking(true);
    setError('');
    setNotice('');
    try { await operation(); } catch (cause) { setError(errorMessage(cause)); }
    finally { inFlight.current = false; setWorking(false); }
  }

  async function finish(flow: typeof signUp | typeof signIn) {
    const result = await flow.finalize({
      navigate: ({ session, decorateUrl }) => {
        if (session?.currentTask) {
          setError('Hesabın ek bir güvenlik adımı gerektiriyor. Bu adım tamamlanmadan oturum açılamaz.');
          return;
        }
        const destination = decorateUrl('/settings');
        if (Platform.OS === 'web' && /^https?:\/\//.test(destination)) window.location.assign(destination);
        else router.replace(destination as Href);
      },
    });
    if (result.error) throw result.error;
  }

  async function sendCode(kind: 'signup-code' | 'signin-code') {
    const result = kind === 'signup-code'
      ? await signUp.verifications.sendEmailCode()
      : await signIn.mfa.sendEmailCode();
    if (result.error) throw result.error;
    setStep(kind);
    setCode('');
    setResendSeconds(30);
    setNotice('Doğrulama kodu gönderildi. Gelen kutunu ve spam klasörünü kontrol et.');
  }

  async function continueSignUp() {
    if (signUp.status === 'complete') { await finish(signUp); return; }
    if (signUp.missingFields.length) {
      setMissingFields([...signUp.missingFields]);
      setStep('details');
      return;
    }
    if (signUp.unverifiedFields.includes('email_address')) {
      await sendCode('signup-code');
      return;
    }
    throw new Error('Kayıt tamamlanamadı. E-posta ve şifreni kontrol edip yeniden başla.');
  }

  async function submit() {
    const email = emailAddress.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Geçerli bir e-posta adresi gir.');
    if (!password) throw new Error('Şifreni gir.');
    if (mode === 'sign-up') {
      if (password.length < 8) throw new Error('Şifren en az 8 karakter olmalı.');
      if (password !== confirmation) throw new Error('Şifreler eşleşmiyor.');
      const result = await signUp.password({ emailAddress: email, password });
      if (result.error) throw result.error;
      await continueSignUp();
    } else {
      const result = await signIn.password({ emailAddress: email, password });
      if (result.error) throw result.error;
      if (signIn.status === 'complete') await finish(signIn);
      else if ((signIn.status === 'needs_client_trust' || signIn.status === 'needs_second_factor') &&
        signIn.supportedSecondFactors.some((factor) => factor.strategy === 'email_code')) await sendCode('signin-code');
      else throw new Error('Bu hesap ek bir güvenlik doğrulaması gerektiriyor. Oturum henüz açılmadı.');
    }
  }

  async function saveDetails() {
    const unsupported = missingFields.filter((field) => !['first_name', 'last_name', 'username'].includes(field));
    if (unsupported.length) throw new Error(`Hesap için ek bir doğrulama gerekiyor: ${unsupported.join(', ')}. Kayıt henüz tamamlanmadı.`);
    if (missingFields.includes('first_name') && !firstName.trim()) throw new Error('Adını gir.');
    if (missingFields.includes('last_name') && !lastName.trim()) throw new Error('Soyadını gir.');
    if (missingFields.includes('username') && !username.trim()) throw new Error('Kullanıcı adını gir.');
    const result = await signUp.update({
      ...(missingFields.includes('first_name') ? { firstName: firstName.trim() } : {}),
      ...(missingFields.includes('last_name') ? { lastName: lastName.trim() } : {}),
      ...(missingFields.includes('username') ? { username: username.trim() } : {}),
    });
    if (result.error) throw result.error;
    await continueSignUp();
  }

  async function verify() {
    if (!/^\d{6}$/.test(code.trim())) throw new Error('E-postandaki 6 haneli kodu gir.');
    if (step === 'signup-code') {
      const result = await signUp.verifications.verifyEmailCode({ code: code.trim() });
      if (result.error) throw result.error;
      await continueSignUp();
    } else {
      const result = await signIn.mfa.verifyEmailCode({ code: code.trim() });
      if (result.error) throw result.error;
      if (signIn.status === 'complete') await finish(signIn);
      else throw new Error('Doğrulama tamamlanamadı. E-postana gelen son kodu kullan.');
    }
  }

  async function changeMode(next: typeof mode) {
    await signIn.reset();
    await signUp.reset();
    setMode(next);
    setStep('credentials');
    setCode('');
    setPassword('');
    setConfirmation('');
    setMissingFields([]);
    setResendSeconds(0);
  }

  if (isSignedIn) return <Redirect href="/settings" />;
  const inputStyle = { minHeight: 52, paddingHorizontal: 15, borderRadius: 15, borderWidth: 1, borderColor: colors.border, color: colors.deep, backgroundColor: colors.card };
  const button = (label: string, action: () => Promise<void>, testID: string, disabled = false) => (
    <Pressable accessibilityRole="button" testID={testID} disabled={busy || disabled} onPress={() => void run(action)} style={{ minHeight: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', opacity: busy || disabled ? 0.55 : 1 }}>
      <Text style={{ color: colors.primaryForeground, fontWeight: '800' }}>{busy ? 'Lütfen bekle…' : label}</Text>
    </Pressable>
  );
  return <KeyboardAwareScrollViewCompat style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: (Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top) + 22, paddingBottom: Math.max(insets.bottom, 34) + 20, flexGrow: 1, justifyContent: 'center', gap: 16 }} bottomOffset={60} keyboardShouldPersistTaps="handled">
    <View style={{ alignItems: 'center', gap: 10 }}>
      <Text style={{ color: colors.deep, fontFamily: 'PlayfairDisplay_600SemiBold_Italic', fontSize: 42 }}>Afilli</Text>
      <Text style={{ color: colors.deep, fontSize: 25, fontFamily: 'PlayfairDisplay_600SemiBold', textAlign: 'center' }}>{verifying ? 'E-postanı doğrula' : step === 'details' ? 'Hesabını tamamla' : mode === 'sign-in' ? 'Yeniden hoş geldin' : 'Okur halkasına katıl'}</Text>
      <Text style={{ color: colors.mutedForeground, textAlign: 'center', lineHeight: 21 }}>{verifying ? `${emailAddress.trim()} adresine gönderilen kodu gir.` : 'Kitapları keşfet, yaz ve paylaş. Hesap açmak için yönetici kodu gerekmez.'}</Text>
    </View>
    {step === 'credentials' ? <View style={{ flexDirection: 'row', gap: 10 }}>
      {(['sign-in', 'sign-up'] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: mode === value }} disabled={busy} onPress={() => void run(() => changeMode(value))} style={{ flex: 1, padding: 13, borderRadius: 14, backgroundColor: mode === value ? colors.secondary : colors.card, borderWidth: 1, borderColor: colors.border }}><Text style={{ textAlign: 'center', color: colors.deep, fontWeight: '700' }}>{value === 'sign-in' ? 'Giriş yap' : 'Kayıt ol'}</Text></Pressable>)}
    </View> : null}
    <View style={{ gap: 13 }}>
      {step === 'credentials' ? <>
        <Text style={{ color: colors.deep, fontWeight: '600' }}>E-posta adresi</Text>
        <TextInput accessibilityLabel="E-posta adresi" testID="auth-email" editable={!busy} value={emailAddress} onChangeText={setEmailAddress} placeholder="E-posta adresi" placeholderTextColor={colors.mutedForeground} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" style={inputStyle} />
        <Text style={{ color: colors.deep, fontWeight: '600' }}>Şifre</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TextInput accessibilityLabel="Şifre" testID="auth-password" editable={!busy} value={password} onChangeText={setPassword} placeholder={mode === 'sign-up' ? 'En az 8 karakter' : 'Şifren'} placeholderTextColor={colors.mutedForeground} secureTextEntry={!visiblePassword} autoCapitalize="none" autoCorrect={false} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} style={[inputStyle, { flex: 1 }]} />
          <Pressable accessibilityRole="button" accessibilityLabel={visiblePassword ? 'Şifreyi gizle' : 'Şifreyi göster'} onPress={() => setVisiblePassword((value) => !value)} style={{ padding: 12 }}><Feather name={visiblePassword ? 'eye-off' : 'eye'} size={21} color={colors.deep} /></Pressable>
        </View>
        {mode === 'sign-up' ? <><Text style={{ color: colors.deep, fontWeight: '600' }}>Şifre tekrar</Text><TextInput accessibilityLabel="Şifre tekrar" testID="auth-confirmation" editable={!busy} value={confirmation} onChangeText={setConfirmation} placeholder="Şifreni yeniden gir" placeholderTextColor={colors.mutedForeground} secureTextEntry={!visiblePassword} autoCapitalize="none" autoCorrect={false} autoComplete="new-password" style={inputStyle} /></> : null}
      </> : step === 'details' ? <>
        {missingFields.includes('first_name') ? <TextInput accessibilityLabel="Adın" value={firstName} onChangeText={setFirstName} placeholder="Adın" placeholderTextColor={colors.mutedForeground} style={inputStyle} /> : null}
        {missingFields.includes('last_name') ? <TextInput accessibilityLabel="Soyadın" value={lastName} onChangeText={setLastName} placeholder="Soyadın" placeholderTextColor={colors.mutedForeground} style={inputStyle} /> : null}
        {missingFields.includes('username') ? <TextInput accessibilityLabel="Kullanıcı adı" value={username} onChangeText={setUsername} placeholder="Kullanıcı adı" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" style={inputStyle} /> : null}
      </> : <TextInput accessibilityLabel="E-posta doğrulama kodu" testID="auth-code" editable={!busy} value={code} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} placeholder="6 haneli kod" placeholderTextColor={colors.mutedForeground} keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} style={[inputStyle, { textAlign: 'center', letterSpacing: 5 }]} />}
      {error ? <Text testID="auth-error" accessibilityRole="alert" style={{ color: colors.destructive, lineHeight: 22 }}>{error}</Text> : null}
      {notice ? <Text accessibilityLiveRegion="polite" style={{ color: colors.deep, lineHeight: 22 }}>{notice}</Text> : null}
      {mode === 'sign-up' ? <View nativeID="clerk-captcha" /> : null}
      {button(verifying ? 'Kodu doğrula' : step === 'details' ? 'Devam et' : mode === 'sign-in' ? 'Giriş yap' : 'Hesap oluştur', verifying ? verify : step === 'details' ? saveDetails : submit, 'auth-submit')}
      {verifying ? button(resendSeconds > 0 ? `Yeni kod için ${resendSeconds} saniye` : 'Yeni kod gönder', () => sendCode(step === 'signup-code' ? 'signup-code' : 'signin-code'), 'auth-resend', resendSeconds > 0) : null}
      {step !== 'credentials' ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void run(() => changeMode(mode))}><Text style={{ color: colors.deep, textAlign: 'center', padding: 12 }}>E-posta adresini değiştir / Baştan başla</Text></Pressable> : null}
    </View>
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={{ padding: 14 }}><Text style={{ color: colors.mutedForeground, textAlign: 'center' }}>Giriş yapmadan keşfetmeye devam et</Text></Pressable>
  </KeyboardAwareScrollViewCompat>;
}
