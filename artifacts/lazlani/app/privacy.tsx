import React from 'react';
import {
  Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

const LAST_UPDATED = '28 Temmuz 2026';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const ITEMS: { icon: IoniconsName; title: string; text: string }[] = [
  {
    icon: 'shield-checkmark-outline',
    title: 'Kişisel Verilerin Korunması',
    text: 'Kullanıcıların kişisel bilgileri gizlilik ilkelerine uygun şekilde korunur.',
  },
  {
    icon: 'server-outline',
    title: 'Veri İşleme Amacı',
    text: 'Paylaşılan içerikler yalnızca uygulamanın sunduğu hizmetleri sağlamak amacıyla işlenir.',
  },
  {
    icon: 'lock-closed-outline',
    title: 'Şifre Güvenliği',
    text: 'Kullanıcı şifreleri güvenli şekilde saklanır ve hiçbir kullanıcıya gösterilmez.',
  },
  {
    icon: 'people-outline',
    title: 'Üçüncü Taraflarla Paylaşım',
    text: 'Uygulama, kullanıcı verilerini izinsiz olarak üçüncü kişilerle satmaz veya paylaşmaz. Yasal zorunluluklar ve kullanıcı onayı gereken durumlar bu kapsamın dışındadır.',
  },
  {
    icon: 'eye-outline',
    title: 'Herkese Açık İçerikler',
    text: 'Profil fotoğrafları, paylaşımlar ve kullanıcı tarafından herkese açık olarak paylaşılan bilgiler uygulama içinde diğer kullanıcılar tarafından görüntülenebilir.',
  },
  {
    icon: 'trash-outline',
    title: 'Hesap Silme Hakkı',
    text: 'Kullanıcı istediği zaman hesabını silebilir. Hesap silme işleminden sonra ilgili veriler yürürlükteki yasal yükümlülükler saklı kalmak kaydıyla sistemden kaldırılır.',
  },
  {
    icon: 'construct-outline',
    title: 'Güvenlik Önlemleri',
    text: 'Uygulama güvenliği için teknik ve idari güvenlik önlemleri uygulanır.',
  },
  {
    icon: 'refresh-outline',
    title: 'Politika Güncellemeleri',
    text: 'Gizlilik politikası gerektiğinde güncellenebilir ve yeni sürüm uygulama içerisinde yayınlanır.',
  },
  {
    icon: 'checkmark-circle-outline',
    title: 'Zımni Kabul',
    text: 'Kullanıcı uygulamayı kullanmaya devam ederek güncel gizlilik politikasını kabul etmiş sayılır.',
  },
];

export default function PrivacyScreen() {
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
            <Ionicons name="lock-closed-outline" size={18} color={colors.primary} />
          </View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Gizlilik Politikası</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: botPad }]}
      >
        {/* Intro card */}
        <View style={[styles.introCard, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}30` }]}>
          <Ionicons name="shield-outline" size={20} color={colors.primary} style={{ marginTop: 1 }} />
          <Text style={[styles.introText, { color: colors.foreground }]}>
            LAZLANI olarak kullanıcılarımızın gizliliğine önem veriyoruz. Bu politika, verilerinizi nasıl işlediğimizi açıklar.
          </Text>
        </View>

        {/* Policy items */}
        {ITEMS.map((item, index) => (
          <View key={index} style={[styles.policyItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}15` }]}>
              <Ionicons name={item.icon} size={20} color={colors.primary} />
            </View>
            <View style={styles.textBlock}>
              <Text style={[styles.itemTitle, { color: colors.foreground }]}>{item.title}</Text>
              <Text style={[styles.itemText, { color: colors.mutedForeground }]}>{item.text}</Text>
            </View>
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
  policyItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textBlock: {
    flex: 1,
    gap: 4,
  },
  itemTitle: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 13.5,
  },
  itemText: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    lineHeight: 20,
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
