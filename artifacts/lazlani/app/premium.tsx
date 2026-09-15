import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { PurchaseType } from '@/data/types';
import {
  createPremiumRequest,
  listPremiumRequests,
  type PremiumRequest,
} from '@workspace/api-client-react';

const VIP_COLORS = [
  '#F5C842', '#EC4899', '#9B59F5', '#06B6D4',
  '#22C55E', '#F97316', '#EF4444', '#3B82F6',
];

function apiErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback;
  const data = (error as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return fallback;
  const candidate = (data as { error?: unknown; message?: unknown }).error
    ?? (data as { error?: unknown; message?: unknown }).message;
  return typeof candidate === 'string' && candidate.trim() ? candidate : fallback;
}

interface Plan {
  id: PurchaseType;
  name: string;
  price: string;
  duration: string;
  gradient: [string, string];
  icon: React.ComponentProps<typeof Ionicons>['name'];
  features: string[];
  badge?: string;
  isVip?: boolean;
}

const PLANS: Plan[] = [
  {
    id: 'premium',
    name: 'Premium Üyelik',
    price: '₺100',
    duration: '/ay',
    gradient: ['#78350F', '#92400E'],
    icon: 'star',
    features: [
      'Sınırsız okuma',
      'Reklamsız deneyim',
      'Altın rozet',
      'Vitrin öne çıkarma',
      'Discord topluluğu',
      'Özel bölüme erişim',
    ],
    badge: 'En İyi Değer',
  },
  {
    id: 'yazarlik_rozeti',
    name: 'Yazarlık Rozeti',
    price: '₺200',
    duration: '/yıl',
    gradient: ['#1E3A5F', '#0E4D6B'],
    icon: 'create',
    features: [
      'Onaylı yazar rozeti',
      'Dergi yazarlığı hakkı',
      'Öne çıkan yazar listesi',
      'Erken erişim içerikleri',
    ],
    badge: 'Yazarlar için',
  },
  {
    id: 'vip',
    name: 'VIP Üyelik',
    price: '₺200',
    duration: '/yıl',
    gradient: ['#4C1D95', '#7C3AED'],
    icon: 'diamond',
    features: [
      'VIP kullanıcılarla özel mesajlaşma',
      'VIP sesli görüşme',
      'Özel profil çerçevesi',
      'Tüm paylaşımlar seçilen renkte',
      'Tüm içeriklere sınırsız erişim',
    ],
    badge: '👑 VIP',
    isVip: true,
  },
];

export default function PremiumScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { user, refreshSession } = useAuth();
  const { purchaseRequests, requestPurchase } = useData();
  const topPad  = Platform.OS === 'web' ? 67 : insets.top;

  const [selected, setSelected] = useState<PurchaseType | null>('premium');
  const [vipColor, setVipColor] = useState<string>(VIP_COLORS[0]);
  const [premiumRequests, setPremiumRequests] = useState<PremiumRequest[]>([]);
  const [premiumRequestsLoading, setPremiumRequestsLoading] = useState(true);
  const [premiumRequestsError, setPremiumRequestsError] = useState<string | null>(null);
  const [isSubmittingPremium, setIsSubmittingPremium] = useState(false);
  const [premiumSuccess, setPremiumSuccess] = useState<string | null>(null);

  const loadPremiumRequests = useCallback(async () => {
    if (!user) {
      setPremiumRequests([]);
      setPremiumRequestsLoading(false);
      return;
    }
    setPremiumRequestsLoading(true);
    setPremiumRequestsError(null);
    try {
      const response = await listPremiumRequests();
      setPremiumRequests(response.requests);
      if (response.requests.some(request => request.status === 'approved') && !user.isPremium) {
        // The server is authoritative for entitlements. Refresh the authenticated
        // user rather than inferring premium access from a request response.
        await refreshSession();
      }
    } catch (error) {
      setPremiumRequestsError(apiErrorMessage(
        error,
        'Premium talepleri yüklenemedi. Lütfen bağlantınızı kontrol edip tekrar deneyin.',
      ));
    } finally {
      setPremiumRequestsLoading(false);
    }
  }, [refreshSession, user]);

  useFocusEffect(useCallback(() => {
    void loadPremiumRequests();
  }, [loadPremiumRequests]));

  const selectedPlan = PLANS.find(p => p.id === selected);
  const hasPendingRequest = selected === 'premium'
    ? premiumRequests.some(request => request.status === 'pending')
    : purchaseRequests.some(
      request => request.userId === user?.id && request.type === selected && request.status === 'pending',
    );

  const handleRequest = async () => {
    if (!selected || !selectedPlan) {
      Alert.alert('Plan Seç', 'Lütfen bir abonelik planı seçin.');
      return;
    }
    if (hasPendingRequest) {
      Alert.alert('Talebiniz İnceleniyor', 'Bu üyelik için bekleyen bir talebiniz zaten var.');
      return;
    }
    if (selected === 'premium') {
      if (!user) {
        Alert.alert('Giriş gerekli', 'Premium talebi göndermek için giriş yapmalısınız.');
        return;
      }
      if (premiumRequestsLoading || premiumRequestsError) {
        Alert.alert(
          'Talepler yüklenemedi',
          premiumRequestsError ?? 'Bekleyen talep kontrol edilemedi. Lütfen tekrar deneyin.',
        );
        return;
      }
      setIsSubmittingPremium(true);
      setPremiumSuccess(null);
      setPremiumRequestsError(null);
      try {
        // The premium endpoint owns the monthly price. Deliberately send no
        // client-provided plan, price, or currency fields.
        const response = await createPremiumRequest({});
        setPremiumRequests(prev => [response.request, ...prev.filter(request => request.id !== response.request.id)]);
        setPremiumSuccess('Premium talebiniz gönderildi. Yönetici onayından sonra üyeliğiniz aktifleşir.');
        Alert.alert('Talep Gönderildi', 'Premium talebiniz yöneticiye iletildi.');
      } catch (error) {
        setPremiumRequestsError(apiErrorMessage(
          error,
          'Premium talebi gönderilemedi. Lütfen tekrar deneyin.',
        ));
      } finally {
        setIsSubmittingPremium(false);
      }
      return;
    }
    requestPurchase(
      selected,
      selectedPlan.name,
      selectedPlan.price + selectedPlan.duration,
      user?.id ?? 'unknown',
      user?.displayName ?? 'Kullanıcı',
      selected === 'vip' ? vipColor : undefined,
    );
    Alert.alert(
      'Talep Gönderildi',
      `${selectedPlan.name} talebiniz yöneticiye iletildi.\nOnay sonrası üyeliğiniz aktif edilecek.`,
      [{ text: 'Tamam', onPress: () => router.back() }],
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Hero */}
      <LinearGradient
        colors={['#4C1D95', '#7C3AED', '#9B59F5']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: topPad }]}
      >
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </Pressable>
        <View style={styles.heroContent}>
          <Ionicons name="diamond" size={44} color="#FFD700" />
          <Text style={styles.heroTitle}>Premium & VIP</Text>
          <Text style={styles.heroSub}>
            Premium üyelik aylık ₺100
          </Text>
        </View>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Aktif üyelik banner */}
        {(user?.isPremium || user?.isVip) && (
          <View style={[styles.activeBanner, { borderColor: '#F5C842' }]}>
            <Ionicons name="checkmark-circle" size={20} color="#F5C842" />
            <Text style={[styles.activeBannerText, { color: '#F5C842' }]}>
              {user.isVip ? '👑 VIP Üyeliğin Aktif' : '⭐ Premium Üyeliğin Aktif'}
            </Text>
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Plan Seç</Text>

        {PLANS.map(plan => (
          <Pressable key={plan.id} onPress={() => setSelected(plan.id)}>
            <LinearGradient
              colors={plan.gradient}
              style={[
                styles.planCard,
                selected === plan.id && { borderWidth: 2, borderColor: '#FFD700' },
              ]}
            >
              {plan.badge && (
                <View style={styles.badgeWrap}>
                  <Text style={styles.badgeText}>{plan.badge}</Text>
                </View>
              )}
              <View style={styles.planHeader}>
                <Ionicons name={plan.icon} size={26} color="#FFD700" />
                <Text style={styles.planName}>{plan.name}</Text>
                <View style={{ flex: 1 }} />
                <Text style={styles.planPrice}>{plan.price}</Text>
                <Text style={styles.planDuration}>{plan.duration}</Text>
                {selected === plan.id && (
                  <Ionicons name="checkmark-circle" size={22} color="#22C55E" style={{ marginLeft: 6 }} />
                )}
              </View>
              <View style={styles.featureList}>
                {plan.features.map((f, i) => (
                  <View key={i} style={styles.featureRow}>
                    <Ionicons name="checkmark" size={14} color="#22C55E" />
                    <Text style={styles.featureText}>{f}</Text>
                  </View>
                ))}
              </View>

              {plan.isVip && selected === 'vip' && (
                <View style={styles.colorPickerWrap}>
                  <Text style={styles.colorPickerLabel}>
                    Profil çerçeve rengin seç (değiştirilemez):
                  </Text>
                  <View style={styles.colorRow}>
                    {VIP_COLORS.map(c => (
                      <Pressable
                        key={c}
                        onPress={() => setVipColor(c)}
                        style={[
                          styles.colorDot,
                          { backgroundColor: c },
                          vipColor === c && styles.colorDotSelected,
                        ]}
                      />
                    ))}
                  </View>
                  <View style={styles.colorPreview}>
                    <View style={[styles.colorPreviewFrame, { borderColor: vipColor }]}>
                      <View style={[styles.colorPreviewAvatar, { backgroundColor: user?.avatarColor ?? '#9B59F5' }]}>
                        <Text style={styles.colorPreviewInitial}>
                          {user?.displayName?.[0] ?? 'V'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.colorPreviewTxt}>Önizleme</Text>
                  </View>
                </View>
              )}

            </LinearGradient>
          </Pressable>
        ))}

        {/* Talep butonu */}
        <TouchableOpacity
          onPress={handleRequest}
          disabled={!selected || hasPendingRequest || isSubmittingPremium || (selected === 'premium' && premiumRequestsLoading)}
          style={[styles.requestBtn, {
            backgroundColor: selected && !hasPendingRequest && !isSubmittingPremium ? '#7C3AED' : colors.muted,
          }]}
          activeOpacity={0.85}
        >
          <Ionicons name="diamond-outline" size={18} color="#fff" />
          <Text style={styles.requestBtnText}>
            {isSubmittingPremium
              ? 'Gönderiliyor...'
              : selected === 'premium' && premiumRequestsLoading
                ? 'Talepler yükleniyor...'
                : hasPendingRequest
              ? 'Talebiniz İnceleniyor'
              : selectedPlan
                ? `${selectedPlan.name} Talebi Gönder`
                : 'Plan Seçin'}
          </Text>
        </TouchableOpacity>

        {premiumSuccess && selected === 'premium' && (
          <View style={[styles.feedback, { backgroundColor: '#DCFCE7' }]}>
            <Ionicons name="checkmark-circle" size={18} color="#15803D" />
            <Text style={[styles.feedbackText, { color: '#166534' }]}>{premiumSuccess}</Text>
          </View>
        )}
        {premiumRequestsError && (
          <View style={[styles.feedback, { backgroundColor: '#FEE2E2' }]}>
            <Ionicons name="alert-circle" size={18} color="#B91C1C" />
            <Text style={[styles.feedbackText, { color: '#991B1B' }]}>{premiumRequestsError}</Text>
          </View>
        )}
        {selected === 'premium' && premiumRequestsLoading && (
          <ActivityIndicator color="#7C3AED" />
        )}

        <Text style={[styles.note, { color: colors.mutedForeground }]}>
          Bu ekranda ödeme alınmaz. Talebiniz yönetici paneline iletilir ve yönetici onayıyla aktifleşir.
        </Text>

        <View style={{ height: insets.bottom + 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: { paddingBottom: 28 },
  backBtn: { padding: 16 },
  heroContent: { alignItems: 'center', gap: 10, paddingBottom: 8 },
  heroTitle: { fontSize: 26, fontFamily: 'Poppins_700Bold', color: '#fff' },
  heroSub: { fontSize: 13, fontFamily: 'Poppins_400Regular', color: 'rgba(255,255,255,0.8)', textAlign: 'center', paddingHorizontal: 32 },
  content: { padding: 16, gap: 12 },
  activeBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 13, borderWidth: 1.5, backgroundColor: 'rgba(245,200,66,0.08)' },
  activeBannerText: { fontSize: 14, fontFamily: 'Poppins_700Bold' },
  sectionTitle: { fontSize: 16, fontFamily: 'Poppins_600SemiBold' },
  planCard: { borderRadius: 18, padding: 16, borderWidth: 1, borderColor: 'transparent' },
  badgeWrap: { alignSelf: 'flex-start', backgroundColor: '#FFD700', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8 },
  badgeText: { fontSize: 11, fontFamily: 'Poppins_700Bold', color: '#000' },
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  planName: { fontSize: 17, fontFamily: 'Poppins_700Bold', color: '#fff' },
  planPrice: { fontSize: 22, fontFamily: 'Poppins_700Bold', color: '#FFD700' },
  planDuration: { fontSize: 12, color: 'rgba(255,255,255,0.65)', fontFamily: 'Poppins_400Regular', alignSelf: 'flex-end', marginBottom: 2 },
  featureList: { gap: 7 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  featureText: { fontSize: 13, color: 'rgba(255,255,255,0.9)', fontFamily: 'Poppins_400Regular' },
  colorPickerWrap: { marginTop: 14, gap: 8 },
  colorPickerLabel: { color: 'rgba(255,255,255,0.8)', fontFamily: 'Poppins_400Regular', fontSize: 12 },
  colorRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  colorDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: 'transparent' },
  colorDotSelected: { borderColor: '#fff', transform: [{ scale: 1.2 }] },
  colorPreview: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  colorPreviewFrame: { width: 46, height: 46, borderRadius: 23, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  colorPreviewAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  colorPreviewInitial: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: 18 },
  colorPreviewTxt: { color: 'rgba(255,255,255,0.7)', fontFamily: 'Poppins_400Regular', fontSize: 12 },
  // Buton
  requestBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 16, marginTop: 4 },
  requestBtnText: { fontSize: 16, fontFamily: 'Poppins_700Bold', color: '#fff' },
  feedback: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, padding: 12 },
  feedbackText: { flex: 1, fontSize: 12, fontFamily: 'Poppins_500Medium', lineHeight: 18 },
  note: { fontSize: 11, fontFamily: 'Poppins_400Regular', textAlign: 'center', lineHeight: 18 },
});
