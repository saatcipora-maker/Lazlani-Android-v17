import React, { useState } from 'react';
import {
  Alert, Platform, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';

export default function RegisterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const handleRegister = async () => {
    if (!displayName.trim() || !username.trim() || !email.trim() || !password.trim()) {
      Alert.alert('Hata', 'Tüm alanları doldurun.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Hata', 'Şifre en az 8 karakter olmalı.');
      return;
    }
    setLoading(true);
    const registered = await register(username.trim(), displayName.trim(), email.trim(), password);
    setLoading(false);
    if (!registered) {
      Alert.alert('Kayıt başarısız', 'E-posta veya kullanıcı adı kullanılıyor olabilir. Bilgileri kontrol edip tekrar deneyin.');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/(tabs)');
  };

  return (
    <LinearGradient
      colors={['#1A0B3B', '#0D0B24']}
      style={[styles.root, { paddingTop: topPad }]}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: botPad + 16 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.logoSection}>
          <LinearGradient
            colors={['#9B59F5', '#EC4899']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.logoIcon}
          >
            <Ionicons name="book" size={30} color="#fff" />
          </LinearGradient>
          <Text style={styles.logoText}>LAZLANI</Text>
        </View>

        <View style={styles.formCard}>
          <Text style={[styles.formTitle, { color: colors.foreground }]}>Hesap Oluştur</Text>
          <Text style={[styles.formSubtitle, { color: colors.mutedForeground }]}>Edebiyat dünyasına katıl</Text>

          {[
            { label: 'Ad Soyad', value: displayName, set: setDisplayName, icon: 'person-outline' as const, placeholder: 'Adınızı girin', keyboardType: 'default' as const },
            { label: 'Kullanıcı Adı', value: username, set: setUsername, icon: 'at-outline' as const, placeholder: '@kullaniciadiniz', keyboardType: 'default' as const },
            { label: 'E-posta', value: email, set: setEmail, icon: 'mail-outline' as const, placeholder: 'ornek@email.com', keyboardType: 'email-address' as const },
          ].map(field => (
            <View key={field.label} style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>{field.label}</Text>
              <View style={[styles.inputWrap, { backgroundColor: colors.input, borderColor: colors.border }]}>
                <Ionicons name={field.icon} size={18} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.input, { color: colors.foreground }]}
                  placeholder={field.placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  value={field.value}
                  onChangeText={field.set}
                  keyboardType={field.keyboardType}
                  autoCapitalize="none"
                />
              </View>
            </View>
          ))}

          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Şifre</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.input, borderColor: colors.border }]}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.mutedForeground} />
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="Şifreniz (min. 6 karakter)"
                placeholderTextColor={colors.mutedForeground}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>
          </View>

          <TouchableOpacity onPress={handleRegister} disabled={loading} style={styles.registerBtn} activeOpacity={0.85}>
            <LinearGradient colors={['#9B59F5', '#EC4899']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.registerBtnGrad}>
              <Text style={styles.registerBtnText}>{loading ? 'Kaydediliyor...' : 'Kayıt Ol'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <View style={styles.loginRow}>
          <Text style={[styles.loginText, { color: colors.mutedForeground }]}>Hesabın var mı?</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[styles.loginLink, { color: colors.primary }]}>Giriş Yap</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, padding: 24, gap: 20 },
  headerRow: { alignItems: 'flex-start' },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  logoSection: { alignItems: 'center', gap: 8 },
  logoIcon: { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#FFFFFF', fontFamily: 'Poppins_700Bold', fontSize: 26, letterSpacing: 4 },
  formCard: { gap: 12 },
  formTitle: { fontFamily: 'Poppins_700Bold', fontSize: 22 },
  formSubtitle: { fontFamily: 'Poppins_400Regular', fontSize: 14, marginBottom: 4 },
  inputGroup: { gap: 6 },
  inputLabel: { fontFamily: 'Poppins_500Medium', fontSize: 13 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13,
  },
  input: { flex: 1, fontFamily: 'Poppins_400Regular', fontSize: 14 },
  registerBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 4 },
  registerBtnGrad: { paddingVertical: 15, alignItems: 'center' },
  registerBtnText: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: 16 },
  loginRow: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  loginText: { fontFamily: 'Poppins_400Regular', fontSize: 14 },
  loginLink: { fontFamily: 'Poppins_700Bold', fontSize: 14 },
});
