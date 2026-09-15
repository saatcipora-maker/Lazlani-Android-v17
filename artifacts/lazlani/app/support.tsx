import React, { useState } from 'react';
import {
  Alert, Linking, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { TicketType } from '@/data/types';

const SUPPORT_EMAIL = 'saatcipora@gmail.com';

const TICKET_TYPES: { value: TicketType; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; desc: string }[] = [
  { value: 'teknik', label: 'Teknik Destek', icon: 'construct-outline', desc: 'Uygulama teknik sorunları' },
  { value: 'hata',   label: 'Hata Bildirimi', icon: 'bug-outline',       desc: 'Bir hata mı buldunuz?' },
  { value: 'sikayet',label: 'Şikâyet',         icon: 'flag-outline',      desc: 'İçerik veya kullanıcı şikâyeti' },
  { value: 'oneri',  label: 'Öneri',           icon: 'bulb-outline',      desc: 'Yeni özellik önerisi' },
];

export default function SupportScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { addSupportTicket } = useData();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 32 : insets.bottom + 24;

  const [selectedType, setSelectedType] = useState<TicketType | null>(null);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);

  const canSend = selectedType && subject.trim().length > 0 && description.trim().length > 0;

  const handleSend = async () => {
    if (!canSend || !user) return;
    setSending(true);
    addSupportTicket({
      id: Date.now().toString(),
      type: selectedType!,
      subject: subject.trim(),
      description: description.trim(),
      userId: user.id,
      userName: user.displayName,
      userAvatarColor: user.avatarColor,
      status: 'bekliyor',
      createdAt: new Date().toISOString(),
    });
    setSending(false);
    setSelectedType(null);
    setSubject('');
    setDescription('');
    Alert.alert('Gönderildi ✓', 'Talebiniz alındı. En kısa sürede size geri döneceğiz.');
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
            <Ionicons name="headset-outline" size={18} color={colors.primary} />
          </View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Destek ve Şikâyet</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: botPad }]} keyboardShouldPersistTaps="handled">

        {/* Email card */}
        <TouchableOpacity
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          style={[styles.emailCard, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}30` }]}
        >
          <View style={[styles.emailIcon, { backgroundColor: `${colors.primary}20` }]}>
            <Ionicons name="mail" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.emailLabel, { color: colors.mutedForeground }]}>Doğrudan e-posta gönderin</Text>
            <Text style={[styles.emailAddress, { color: colors.primary }]}>{SUPPORT_EMAIL}</Text>
          </View>
          <Ionicons name="open-outline" size={18} color={colors.primary} />
        </TouchableOpacity>

        {/* Type selector */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>TALEP TÜRÜ</Text>
        <View style={styles.typeGrid}>
          {TICKET_TYPES.map(t => {
            const active = selectedType === t.value;
            return (
              <TouchableOpacity
                key={t.value}
                onPress={() => setSelectedType(t.value)}
                style={[
                  styles.typeCard,
                  {
                    backgroundColor: active ? `${colors.primary}18` : colors.card,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Ionicons name={t.icon} size={22} color={active ? colors.primary : colors.mutedForeground} />
                <Text style={[styles.typeLabel, { color: active ? colors.primary : colors.foreground }]}>{t.label}</Text>
                <Text style={[styles.typeDesc, { color: colors.mutedForeground }]}>{t.desc}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Subject */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>KONU</Text>
        <TextInput
          value={subject}
          onChangeText={setSubject}
          placeholder="Talebinizi kısaca özetleyin"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
          maxLength={100}
        />

        {/* Description */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>AÇIKLAMA</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Durumu ayrıntılı açıklayın..."
          placeholderTextColor={colors.mutedForeground}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          style={[styles.textarea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
          maxLength={1000}
        />
        <Text style={[styles.charCount, { color: colors.mutedForeground }]}>{description.length}/1000</Text>

        {/* Send button */}
        <TouchableOpacity
          onPress={handleSend}
          disabled={!canSend || sending}
          style={[
            styles.sendBtn,
            { backgroundColor: canSend ? colors.primary : `${colors.primary}40` },
          ]}
        >
          <Ionicons name="send-outline" size={18} color={colors.primaryForeground} />
          <Text style={[styles.sendBtnText, { color: colors.primaryForeground }]}>{sending ? 'Gönderiliyor...' : 'Talebi Gönder'}</Text>
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
  emailCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 4 },
  emailIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  emailLabel: { fontFamily: 'Poppins_400Regular', fontSize: 12 },
  emailAddress: { fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
  sectionLabel: { fontFamily: 'Poppins_600SemiBold', fontSize: 10, letterSpacing: 1, marginTop: 8, marginBottom: 2 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  typeCard: { width: '47%', padding: 12, borderRadius: 14, borderWidth: 1.5, gap: 4 },
  typeLabel: { fontFamily: 'Poppins_600SemiBold', fontSize: 13 },
  typeDesc: { fontFamily: 'Poppins_400Regular', fontSize: 11 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontFamily: 'Poppins_400Regular', fontSize: 14 },
  textarea: { borderWidth: 1, borderRadius: 12, padding: 12, fontFamily: 'Poppins_400Regular', fontSize: 14, minHeight: 120 },
  charCount: { fontFamily: 'Poppins_400Regular', fontSize: 11, textAlign: 'right', marginTop: 2 },
  sendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 14, marginTop: 8 },
  sendBtnText: { fontFamily: 'Poppins_600SemiBold', fontSize: 15 },
});
