import React from 'react';
import {
  Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

const LAST_UPDATED = '28 Temmuz 2026';

const RULES: { no: number; text: string }[] = [
  { no: 1,  text: 'Uygulamayı kullanan herkes bu kuralları kabul etmiş sayılır.' },
  { no: 2,  text: 'Kullanıcılar birbirlerine karşı saygılı davranmalıdır.' },
  { no: 3,  text: 'Hakaret, küfür, tehdit, nefret söylemi, ayrımcılık ve zorbalık içeren içerikler paylaşmak yasaktır.' },
  { no: 4,  text: 'Yasa dışı faaliyetleri teşvik eden içerikler paylaşılmaz.' },
  { no: 5,  text: 'Başkasına ait telif hakkı bulunan içerikler izin alınmadan paylaşılmaz.' },
  { no: 6,  text: 'Spam, reklam veya yanıltıcı içerikler paylaşmak yasaktır.' },
  { no: 7,  text: 'Sahte hesap oluşturmak veya başka bir kullanıcıyı taklit etmek yasaktır.' },
  { no: 8,  text: 'Kullanıcılar hesap bilgilerinin güvenliğinden kendileri sorumludur.' },
  { no: 9,  text: 'Kitap, hikâye ve diğer paylaşımların sorumluluğu paylaşımı yapan kullanıcıya aittir.' },
  { no: 10, text: 'Uygulama yönetimi, kullanım kurallarını ihlal eden içerikleri kaldırma ve gerekli durumlarda hesapları askıya alma veya kalıcı olarak kapatma hakkını saklı tutar.' },
  { no: 11, text: 'Kullanıcılar uygulamayı kötüye kullanacak yazılım, bot veya otomatik sistemler kullanamaz.' },
  { no: 12, text: 'Kurallar gerektiğinde güncellenebilir ve güncellenen kurallar yayınlandığı andan itibaren geçerli olur.' },
];

export default function TermsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 32 : insets.bottom + 24;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={[styles.iconBadge, { backgroundColor: `${colors.primary}18` }]}>
            <Ionicons name="document-text-outline" size={18} color={colors.primary} />
          </View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Kullanım Kuralları</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: botPad }]}
      >
        {/* Intro card */}
        <View style={[styles.introCard, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}30` }]}>
          <Ionicons name="information-circle" size={20} color={colors.primary} style={{ marginTop: 1 }} />
          <Text style={[styles.introText, { color: colors.foreground }]}>
            LAZLANI uygulamasını kullanarak aşağıdaki kuralları okuduğunuzu ve kabul ettiğinizi onaylamış olursunuz.
          </Text>
        </View>

        {/* Rules */}
        {RULES.map((rule) => (
          <View key={rule.no} style={[styles.ruleItem, { borderLeftColor: colors.primary, backgroundColor: colors.card }]}>
            <View style={[styles.ruleNo, { backgroundColor: `${colors.primary}18` }]}>
              <Text style={[styles.ruleNoText, { color: colors.primary }]}>{rule.no}</Text>
            </View>
            <Text style={[styles.ruleText, { color: colors.foreground }]}>{rule.text}</Text>
          </View>
        ))}

        {/* Footer */}
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <Ionicons name="time-outline" size={14} color={colors.mutedForeground} />
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
            Son Güncelleme: {LAST_UPDATED}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 16,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 10,
  },
  introCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 6,
  },
  introText: {
    flex: 1,
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    lineHeight: 20,
  },
  ruleItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderLeftWidth: 3,
  },
  ruleNo: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  ruleNoText: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 12,
  },
  ruleText: {
    flex: 1,
    fontFamily: 'Poppins_400Regular',
    fontSize: 13.5,
    lineHeight: 21,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    justifyContent: 'center',
  },
  footerText: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
  },
});
