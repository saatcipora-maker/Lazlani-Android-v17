import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

const LAST_UPDATED = '28 Temmuz 2026';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const ITEMS: { icon: IoniconsName; title: string; text: string }[] = [
  {
    icon: 'code-slash-outline',
    title: 'Uygulama ve Yazılım',
    text: 'LAZLANI uygulamasının tüm tasarımı, yazılımı, logosu, arayüzü ve orijinal içerikleri telif hakkı yasaları kapsamında korunmaktadır. İzinsiz kopyalanamaz, çoğaltılamaz veya dağıtılamaz.',
  },
  {
    icon: 'person-outline',
    title: 'Kullanıcı İçerikleri',
    text: 'Kullanıcılar yalnızca kendilerine ait telif hakkını elinde bulundurdukları içerikleri paylaşabilir. Paylaşılan içeriklerin telif hakkı sorumluluğu tamamen içeriği yükleyen kullanıcıya aittir.',
  },
  {
    icon: 'ban-outline',
    title: 'Telif Hakkı İhlali Yasaktır',
    text: 'Başkalarına ait telif hakkıyla korunan eserler (kitaplar, hikayeler, şiirler, görseller, müzikler vb.) sahiplerinin açık izni alınmadan paylaşılmamalıdır.',
  },
  {
    icon: 'trash-outline',
    title: 'İhlal Durumunda İşlem',
    text: 'Telif hakkı ihlali içerdiği tespit edilen içerikler uygulama yönetimi tarafından bildirim yapılmaksızın kaldırılabilir.',
  },
  {
    icon: 'lock-closed-outline',
    title: 'Hesap Yaptırımları',
    text: 'Tekrarlayan telif hakkı ihlallerinde ilgili kullanıcı hesabı geçici olarak askıya alınabilir ya da kalıcı olarak kapatılabilir.',
  },
  {
    icon: 'megaphone-outline',
    title: 'İhlal Bildirimi',
    text: 'Telif hakkınızın ihlal edildiğini düşünüyorsanız "Destek ve Şikâyet" bölümünden bize bildirim gönderebilirsiniz. Tüm bildirimler titizlikle incelenir.',
  },
];

export default function CopyrightScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 32 : insets.bottom + 24;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={[styles.iconBadge, { backgroundColor: `${colors.primary}18` }]}>
            <Ionicons name="ribbon-outline" size={18} color={colors.primary} />
          </View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Telif Hakkı</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: botPad }]}>
        <View style={[styles.heroBadge, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}25` }]}>
          <Ionicons name="ribbon" size={36} color={colors.primary} />
          <Text style={[styles.heroTitle, { color: colors.foreground }]}>© 2026 LAZLANI</Text>
          <Text style={[styles.heroSub, { color: colors.mutedForeground }]}>Tüm hakları saklıdır.</Text>
        </View>

        {ITEMS.map((item, i) => (
          <View key={i} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}15` }]}>
              <Ionicons name={item.icon} size={20} color={colors.primary} />
            </View>
            <View style={styles.textBlock}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>{item.title}</Text>
              <Text style={[styles.cardText, { color: colors.mutedForeground }]}>{item.text}</Text>
            </View>
          </View>
        ))}

        <TouchableOpacity
          onPress={() => router.push('/support' as any)}
          style={[styles.reportBtn, { backgroundColor: `${colors.primary}18`, borderColor: `${colors.primary}35` }]}
        >
          <Ionicons name="flag-outline" size={18} color={colors.primary} />
          <Text style={[styles.reportBtnText, { color: colors.primary }]}>Telif Hakkı İhlali Bildir</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.primary} />
        </TouchableOpacity>

        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <Ionicons name="time-outline" size={14} color={colors.mutedForeground} />
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>Son Güncelleme: {LAST_UPDATED}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBadge: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Poppins_600SemiBold', fontSize: 16 },
  content: { paddingHorizontal: 16, paddingTop: 20, gap: 10 },
  heroBadge: { alignItems: 'center', gap: 6, padding: 24, borderRadius: 16, borderWidth: 1, marginBottom: 6 },
  heroTitle: { fontFamily: 'Poppins_700Bold', fontSize: 20 },
  heroSub: { fontFamily: 'Poppins_400Regular', fontSize: 13 },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, padding: 14, borderRadius: 14, borderWidth: 1 },
  iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  textBlock: { flex: 1, gap: 4 },
  cardTitle: { fontFamily: 'Poppins_600SemiBold', fontSize: 13.5 },
  cardText: { fontFamily: 'Poppins_400Regular', fontSize: 13, lineHeight: 20 },
  reportBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, marginTop: 4 },
  reportBtnText: { flex: 1, fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, paddingTop: 16, borderTopWidth: 1, justifyContent: 'center' },
  footerText: { fontFamily: 'Poppins_400Regular', fontSize: 12 },
});
