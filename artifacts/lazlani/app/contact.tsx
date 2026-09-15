import React, { useState } from 'react';
import {
  Alert, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';

const REASONS = ['Soru', 'Öneri', 'Geri Bildirim', 'İstek', 'Diğer'];

export default function ContactScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { addContactMessage } = useData();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 32 : insets.bottom + 24;

  const [reason, setReason] = useState('Soru');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const canSend = subject.trim().length > 0 && message.trim().length > 0;

  const handleSend = async () => {
    if (!canSend || !user) return;
    setSending(true);
    addContactMessage({
      id: Date.now().toString(),
      subject: `[${reason}] ${subject.trim()}`,
      message: message.trim(),
      userId: user.id,
      userName: user.displayName,
      userAvatarColor: user.avatarColor,
      status: 'bekliyor',
      createdAt: new Date().toISOString(),
    });
    setSending(false);
    setSubject('');
    setMessage('');
    Alert.alert('Mesaj Gönderildi ✓', 'Mesajınız yöneticiye ulaştı. Teşekkür ederiz!');
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={[styles.iconBadge, { backgroundColor: `${colors.primary}18` }]}>
            <Ionicons name="chatbox-ellipses-outline" size={18} color={colors.primary} />
          </View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>İletişim</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: botPad }]} keyboardShouldPersistTaps="handled">

        {/* Info */}
        <View style={[styles.infoCard, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}25` }]}>
          <Ionicons name="information-circle" size={20} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.foreground }]}>
            Soru, öneri ve geri bildirimlerinizi yöneticiye iletebilirsiniz. Mesajınız incelendikten sonra geri dönüş yapılacaktır.
          </Text>
        </View>

        {/* Reason chips */}
        <Text style={[styles.label, { color: colors.mutedForeground }]}>MESAJ TÜRÜ</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {REASONS.map(r => (
            <TouchableOpacity
              key={r}
              onPress={() => setReason(r)}
              style={[
                styles.chip,
                { backgroundColor: reason === r ? colors.primary : colors.card, borderColor: reason === r ? colors.primary : colors.border },
              ]}
            >
              <Text style={[styles.chipText, { color: reason === r ? colors.primaryForeground : colors.foreground }]}>{r}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Subject */}
        <Text style={[styles.label, { color: colors.mutedForeground }]}>KONU</Text>
        <TextInput
          value={subject}
          onChangeText={setSubject}
          placeholder="Mesajınızın konusu"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
          maxLength={100}
        />

        {/* Message */}
        <Text style={[styles.label, { color: colors.mutedForeground }]}>MESAJ</Text>
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="Mesajınızı buraya yazın..."
          placeholderTextColor={colors.mutedForeground}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
          style={[styles.textarea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
          maxLength={2000}
        />
        <Text style={[styles.charCount, { color: colors.mutedForeground }]}>{message.length}/2000</Text>

        {/* Send */}
        <TouchableOpacity
          onPress={handleSend}
          disabled={!canSend || sending}
          style={[styles.sendBtn, { backgroundColor: canSend ? colors.primary : `${colors.primary}40` }]}
        >
          <Ionicons name="send-outline" size={18} color={colors.primaryForeground} />
          <Text style={[styles.sendBtnText, { color: colors.primaryForeground }]}>{sending ? 'Gönderiliyor...' : 'Mesaj Gönder'}</Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBadge: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Poppins_600SemiBold', fontSize: 16 },
  content: { paddingHorizontal: 16, paddingTop: 16, gap: 8 },
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 4 },
  infoText: { flex: 1, fontFamily: 'Poppins_400Regular', fontSize: 13, lineHeight: 20 },
  label: { fontFamily: 'Poppins_600SemiBold', fontSize: 10, letterSpacing: 1, marginTop: 8, marginBottom: 2 },
  chips: { gap: 8, paddingVertical: 4 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipText: { fontFamily: 'Poppins_500Medium', fontSize: 13 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontFamily: 'Poppins_400Regular', fontSize: 14 },
  textarea: { borderWidth: 1, borderRadius: 12, padding: 12, fontFamily: 'Poppins_400Regular', fontSize: 14, minHeight: 140 },
  charCount: { fontFamily: 'Poppins_400Regular', fontSize: 11, textAlign: 'right', marginTop: 2 },
  sendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 14, marginTop: 8 },
  sendBtnText: { fontFamily: 'Poppins_600SemiBold', fontSize: 15 },
});
