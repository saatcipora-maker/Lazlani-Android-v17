import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import UserAvatar from '@/components/UserAvatar';
import { PurchaseRequest, TicketStatus } from '@/data/types';
import {
  approvePremiumRequest,
  listAdminPremiumRequests,
  listAdminUsers,
  rejectPremiumRequest,
  updateAdminUserRole,
  type AdminUser,
  type PremiumRequest,
} from '@workspace/api-client-react';

type Tab = 'istatistik' | 'kullanici' | 'yetkilendirme' | 'icerik' | 'destek' | 'log' | 'filtre' | 'talepler' | 'ozel';

const STATUS_COLORS: Record<TicketStatus, string> = {
  bekliyor:  '#F59E0B',
  isleniyor: '#3B82F6',
  cozuldu:   '#22C55E',
};
const STATUS_LABELS: Record<TicketStatus, string> = {
  bekliyor:  'Bekliyor',
  isleniyor: 'İşleme Alındı',
  cozuldu:   'Çözüldü',
};

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'şimdi';
  if (diff < 3600) return `${Math.floor(diff / 60)}dk`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa`;
  return `${Math.floor(diff / 86400)}g önce`;
}

function apiErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback;
  const data = (error as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return fallback;
  const candidate = (data as { error?: unknown; message?: unknown }).error
    ?? (data as { error?: unknown; message?: unknown }).message;
  return typeof candidate === 'string' && candidate.trim() ? candidate : fallback;
}

function toPremiumPurchaseRequest(request: PremiumRequest): PurchaseRequest {
  return {
    id: request.id,
    userId: request.userId,
    userName: request.user?.displayName ?? request.user?.username ?? request.userId,
    type: 'premium',
    planName: 'Premium Üyelik',
    price: `${request.price} ${request.currency}`,
    status: request.status,
    createdAt: request.createdAt,
  };
}

export default function AdminScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const {
    books, stories, poems, posts, comments, postComments,
    supportTickets, contactMessages, adminLogs, adminUsers,
    dergiPosts, ozelPosts, ozelComments,
    adminSuspendUser, adminActivateUser, adminDeleteUser,
    adminRemovePost, adminRemoveComment,
    updateTicketStatus, updateContactStatus, addAdminLog,
    adminGrantPermission, adminRevokePermission,
    adminBanUser, adminUnbanUser,
    weeklyBookId, setWeeklyBookId,
    bannedWords, filterLevel, addBannedWord, removeBannedWord, setFilterLevelAdmin,
    purchaseRequests, approvePurchase, rejectPurchase, renewPurchase,
    deleteOzelPost,
  } = useData();

  const [newBannedWord, setNewBannedWord] = useState('');
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 32 : insets.bottom + 16;

  const [activeTab, setActiveTab] = useState<Tab>('istatistik');
  const [replyTarget, setReplyTarget] = useState<{ id: string; kind: 'ticket' | 'contact' } | null>(null);
  const [replyText, setReplyText] = useState('');
  const [serverPremiumRequests, setServerPremiumRequests] = useState<PremiumRequest[]>([]);
  const [premiumRequestsLoading, setPremiumRequestsLoading] = useState(false);
  const [premiumRequestsError, setPremiumRequestsError] = useState<string | null>(null);
  const [premiumActionId, setPremiumActionId] = useState<string | null>(null);
  const [serverAdminUsers, setServerAdminUsers] = useState<AdminUser[]>([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [adminUsersError, setAdminUsersError] = useState<string | null>(null);
  const [adminUsersSuccess, setAdminUsersSuccess] = useState<string | null>(null);
  const [roleActionId, setRoleActionId] = useState<string | null>(null);

  const loadPremiumRequests = React.useCallback(async () => {
    if (!user?.isAdmin && !user?.isSuperAdmin) return;
    setPremiumRequestsLoading(true);
    setPremiumRequestsError(null);
    try {
      const response = await listAdminPremiumRequests();
      setServerPremiumRequests(response.requests);
    } catch (error) {
      setPremiumRequestsError(apiErrorMessage(
        error,
        'Premium talepleri yüklenemedi. Lütfen tekrar deneyin.',
      ));
    } finally {
      setPremiumRequestsLoading(false);
    }
  }, [user?.isAdmin, user?.isSuperAdmin]);

  useFocusEffect(React.useCallback(() => {
    void loadPremiumRequests();
  }, [loadPremiumRequests]));

  const loadServerAdminUsers = React.useCallback(async () => {
    if (!user?.isSuperAdmin) return;
    setAdminUsersLoading(true);
    setAdminUsersError(null);
    try {
      const response = await listAdminUsers();
      setServerAdminUsers(response.users);
    } catch (error) {
      setAdminUsersError(apiErrorMessage(
        error,
        'Gerçek hesaplar yüklenemedi. Lütfen tekrar deneyin.',
      ));
    } finally {
      setAdminUsersLoading(false);
    }
  }, [user?.isSuperAdmin]);

  useFocusEffect(React.useCallback(() => {
    if (user?.isSuperAdmin) void loadServerAdminUsers();
  }, [loadServerAdminUsers, user?.isSuperAdmin]));

  if (!user?.isAdmin && !user?.isSuperAdmin) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', gap: 12 }]}>
        <Ionicons name="lock-closed" size={48} color={colors.mutedForeground} />
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Erişim yetkiniz yok.</Text>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backPill, { backgroundColor: colors.card }]}>
          <Text style={[styles.backPillText, { color: colors.primary }]}>Geri Dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const log = (action: string, targetType: string, targetId: string) => {
    addAdminLog({ id: Date.now().toString(), action, targetType, targetId, adminId: user.id, createdAt: new Date().toISOString() });
  };

  const totalLikes = posts.reduce((s, p) => s + p.likesCount, 0) +
    books.reduce((s, b) => s + b.likesCount, 0) +
    stories.reduce((s, s2) => s + s2.likesCount, 0) +
    poems.reduce((s, p) => s + p.likesCount, 0) +
    dergiPosts.reduce((s, d) => s + d.likesCount, 0);

  const pendingTickets  = supportTickets.filter(t => t.status === 'bekliyor').length;
  const pendingContacts = contactMessages.filter(m => m.status === 'bekliyor').length;
  const activeUsers     = adminUsers.filter(u => !u.isSuspended && !u.isBanned).length;
  const bannedUsers     = adminUsers.filter(u => u.isBanned).length;
  const suspendedUsers  = adminUsers.filter(u => u.isSuspended).length;

  const STATS = [
    { icon: 'people-outline'          as const, label: 'Kayıtlı Kullanıcı',   value: adminUsers.length },
    { icon: 'person-outline'          as const, label: 'Aktif Kullanıcı',      value: activeUsers },
    { icon: 'radio-button-on-outline' as const, label: 'Çevrim İçi (tahmini)', value: Math.max(1, Math.floor(activeUsers * 0.3)) },
    { icon: 'download-outline'        as const, label: 'Toplam İndirme',       value: adminUsers.length * 47 + 1240 },
    { icon: 'person-add-outline'      as const, label: 'Günlük Yeni Kayıt',    value: 3 },
    { icon: 'flash-outline'           as const, label: 'Günlük Aktif',         value: Math.floor(activeUsers * 0.18) },
    { icon: 'book-outline'            as const, label: 'Toplam Kitap',         value: books.length },
    { icon: 'document-text-outline'   as const, label: 'Toplam Hikâye',        value: stories.length },
    { icon: 'leaf-outline'            as const, label: 'Toplam Şiir',          value: poems.length },
    { icon: 'newspaper-outline'       as const, label: 'Toplam Paylaşım',      value: posts.length + dergiPosts.length + ozelPosts.length },
    { icon: 'chatbubble-outline'      as const, label: 'Toplam Yorum',         value: postComments.length },
    { icon: 'heart-outline'           as const, label: 'Toplam Beğeni',        value: totalLikes },
    { icon: 'ban-outline'             as const, label: 'Engellenen Hesap',     value: bannedUsers, warn: bannedUsers > 0 },
    { icon: 'alert-circle-outline'   as const, label: 'Bekleyen Destek',      value: pendingTickets, warn: pendingTickets > 0 },
    { icon: 'mail-outline'            as const, label: 'Bekleyen Mesaj',       value: pendingContacts, warn: pendingContacts > 0 },
  ];

  const FILTER_LEVEL_LABELS: Record<string, string> = {
    kapali: 'Kapalı', dusuk: 'Düşük', orta: 'Orta', yuksek: 'Yüksek',
  };
  const FILTER_LEVEL_COLORS: Record<string, string> = {
    kapali: '#6B7280', dusuk: '#22C55E', orta: '#F59E0B', yuksek: '#EF4444',
  };

  // Premium is centrally owned by the API. Keep local requests for the other
  // plans, but do not render persisted local premium copies alongside the
  // server records.
  const premiumPurchaseRequests = serverPremiumRequests.map(toPremiumPurchaseRequest);
  const adminPurchaseRequests = [
    ...purchaseRequests.filter(request => request.type !== 'premium'),
    ...premiumPurchaseRequests,
  ];
  const pendingPurchases = adminPurchaseRequests.filter(r => r.status === 'pending' && r.type !== 'ozel_abonelik').length;
  const pendingOzel = purchaseRequests.filter(r => r.status === 'pending' && r.type === 'ozel_abonelik').length;

  const handlePremiumReview = async (
    requestId: string,
    action: 'approve' | 'reject',
    userName: string,
  ) => {
    if (premiumActionId) return;
    setPremiumActionId(requestId);
    setPremiumRequestsError(null);
    try {
      if (action === 'approve') {
        await approvePremiumRequest(requestId);
        Alert.alert('Onaylandı', `${userName} talebi onaylandı.`);
      } else {
        await rejectPremiumRequest(requestId);
        Alert.alert('Reddedildi', `${userName} talebi reddedildi.`);
      }
      await loadPremiumRequests();
    } catch (error) {
      setPremiumRequestsError(apiErrorMessage(
        error,
        'Premium talebi güncellenemedi. Lütfen tekrar deneyin.',
      ));
    } finally {
      setPremiumActionId(null);
    }
  };

  const handleRoleUpdate = async (target: AdminUser, role: 'admin' | 'user') => {
    if (
      !user?.isSuperAdmin
      || target.id === user.id
      || target.isSuperAdmin
      || (role === 'admin' && target.isAdmin)
      || (role === 'user' && !target.isAdmin)
    ) return;

    setRoleActionId(target.id);
    setAdminUsersError(null);
    setAdminUsersSuccess(null);
    try {
      await updateAdminUserRole(target.id, { role });
      setAdminUsersSuccess(
        `${target.displayName} hesabı ${role === 'admin' ? 'Admin' : 'Kullanıcı'} olarak güncellendi.`,
      );
      await loadServerAdminUsers();
    } catch (error) {
      setAdminUsersError(apiErrorMessage(
        error,
        'Hesap rolü güncellenemedi. Lütfen tekrar deneyin.',
      ));
    } finally {
      setRoleActionId(null);
    }
  };

  const confirmRoleUpdate = (target: AdminUser, role: 'admin' | 'user') => {
    const nextRoleLabel = role === 'admin' ? 'Admin' : 'Kullanıcı';
    Alert.alert(
      'Hesap rolünü değiştir',
      `${target.displayName} hesabı ${nextRoleLabel} olarak güncellenecek. Emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: nextRoleLabel,
          style: role === 'user' ? 'destructive' : 'default',
          onPress: () => { void handleRoleUpdate(target, role); },
        },
      ],
    );
  };

  const TABS: { key: Tab; icon: React.ComponentProps<typeof Ionicons>['name']; label: string; badge?: number }[] = [
    { key: 'istatistik',    icon: 'bar-chart-outline',  label: 'İstatistik' },
    { key: 'kullanici',     icon: 'people-outline',     label: 'Kullanıcılar', badge: suspendedUsers + bannedUsers || undefined },
    { key: 'yetkilendirme', icon: 'shield-outline',     label: 'Yetki' },
    { key: 'icerik',        icon: 'newspaper-outline',  label: 'İçerikler' },
    { key: 'destek',        icon: 'headset-outline',    label: 'Destek', badge: pendingTickets + pendingContacts || undefined },
    { key: 'talepler',      icon: 'diamond-outline',    label: 'Talepler', badge: pendingPurchases || undefined },
    { key: 'ozel',          icon: 'sparkles-outline',   label: 'Özel', badge: pendingOzel || undefined },
    { key: 'log',           icon: 'list-outline',       label: 'Log' },
    { key: 'filtre',        icon: 'shield-checkmark-outline', label: 'Filtre' },
  ];

  const handleSendReply = () => {
    if (!replyTarget || !replyText.trim()) return;
    if (replyTarget.kind === 'ticket') {
      updateTicketStatus(replyTarget.id, 'cozuldu', replyText.trim());
      log('Destek yanıtlandı', 'ticket', replyTarget.id);
    } else {
      updateContactStatus(replyTarget.id, 'cozuldu', replyText.trim());
      log('İletişim yanıtlandı', 'contact', replyTarget.id);
    }
    setReplyTarget(null);
    setReplyText('');
    Alert.alert('Yanıt kaydedildi', 'Durum "Çözüldü" olarak güncellendi.');
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={[styles.adminBadge, { backgroundColor: '#7F1D1D' }]}>
            <Ionicons name="shield-checkmark" size={16} color="#FCA5A5" />
          </View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Yönetici Paneli</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Tab bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.tabBar, { borderBottomColor: colors.border }]} contentContainerStyle={styles.tabBarContent}>
        {TABS.map(t => {
          const active = activeTab === t.key;
          return (
            <TouchableOpacity key={t.key} onPress={() => setActiveTab(t.key)} style={styles.tabItem}>
              <Ionicons name={t.icon} size={18} color={active ? colors.primary : colors.mutedForeground} />
              <Text style={[styles.tabLabel, { color: active ? colors.primary : colors.mutedForeground }]}>{t.label}</Text>
              {!!t.badge && (
                <View style={[styles.badge, { backgroundColor: '#EF4444' }]}>
                  <Text style={styles.badgeText}>{t.badge}</Text>
                </View>
              )}
              {active && <View style={[styles.tabIndicator, { backgroundColor: colors.primary }]} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: botPad }]}>

        {/* ── İstatistikler ── */}
        {activeTab === 'istatistik' && (
          <View style={styles.statsGrid}>
            {STATS.map((s, i) => (
              <View key={i} style={[styles.statCard, { backgroundColor: colors.card, borderColor: s.warn ? '#EF4444' : colors.border }]}>
                <View style={[styles.statIcon, { backgroundColor: s.warn ? '#FEF2F2' : `${colors.primary}15` }]}>
                  <Ionicons name={s.icon} size={20} color={s.warn ? '#EF4444' : colors.primary} />
                </View>
                <Text style={[styles.statVal, { color: s.warn ? '#EF4444' : colors.foreground }]}>{s.value.toLocaleString('tr')}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Kullanıcılar ── */}
        {activeTab === 'kullanici' && adminUsers.map(u => (
          <View key={u.id} style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: (u.isSuspended || u.isBanned) ? 0.65 : 1 }]}>
            <UserAvatar name={u.displayName} color={u.avatarColor} size={40} />
            <View style={{ flex: 1 }}>
              <View style={styles.rowTop}>
                <Text style={[styles.rowName, { color: colors.foreground }]}>{u.displayName}</Text>
                {u.isAdmin    && <View style={styles.adminPill}><Text style={styles.adminPillText}>Admin</Text></View>}
                {u.isSuspended && <View style={styles.suspendPill}><Text style={styles.suspendPillText}>Askıda</Text></View>}
                {u.isBanned   && <View style={[styles.suspendPill, { backgroundColor: '#450a0a' }]}><Text style={[styles.suspendPillText, { color: '#FCA5A5' }]}>Engelli</Text></View>}
              </View>
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>@{u.username} · {u.email}</Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>Takipçi: {u.followersCount} · Katılım: {u.joinedAt}</Text>
            </View>
            {!u.isAdmin && (
              <View style={styles.actionCol}>
                {u.isBanned ? (
                  <TouchableOpacity onPress={() => { adminUnbanUser(u.id); log('Engel kaldırıldı', 'user', u.id); }}
                    style={[styles.actionBtn, { backgroundColor: '#D1FAE5' }]}>
                    <Ionicons name="checkmark-circle-outline" size={16} color="#059669" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => Alert.alert('Hesabı Engelle', `${u.displayName} engellenecek. Emin misiniz?`, [
                    { text: 'İptal', style: 'cancel' },
                    { text: 'Engelle', style: 'destructive', onPress: () => { adminBanUser(u.id); log('Hesap engellendi', 'user', u.id); } },
                  ])} style={[styles.actionBtn, { backgroundColor: '#450a0a' }]}>
                    <Ionicons name="ban-outline" size={16} color="#FCA5A5" />
                  </TouchableOpacity>
                )}
                {u.isSuspended ? (
                  <TouchableOpacity onPress={() => { adminActivateUser(u.id); log('Hesap aktifleştirildi', 'user', u.id); }}
                    style={[styles.actionBtn, { backgroundColor: '#FEF3C7' }]}>
                    <Ionicons name="play-circle-outline" size={16} color="#D97706" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => { adminSuspendUser(u.id); log('Hesap askıya alındı', 'user', u.id); }}
                    style={[styles.actionBtn, { backgroundColor: '#FEF3C7' }]}>
                    <Ionicons name="pause-circle-outline" size={16} color="#D97706" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => Alert.alert('Hesabı Sil', `${u.displayName} hesabını kalıcı olarak silmek istiyor musunuz?`, [
                    { text: 'İptal', style: 'cancel' },
                    { text: 'Sil', style: 'destructive', onPress: () => { adminDeleteUser(u.id); log('Hesap silindi', 'user', u.id); } },
                  ])}
                  style={[styles.actionBtn, { backgroundColor: '#FEE2E2' }]}
                >
                  <Ionicons name="trash-outline" size={16} color="#DC2626" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}

        {/* ── Yetkilendirme ── */}
        {activeTab === 'yetkilendirme' && (
          <View style={{ gap: 8 }}>
            {user.isSuperAdmin && (
              <View style={styles.roleManagementSection}>
                <View style={styles.sectionHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 0 }]}>
                      GERÇEK HESAP ROLLERİ
                    </Text>
                    <Text style={[styles.rowSub, { color: colors.mutedForeground, marginTop: 4 }]}>
                      Sunucu hesaplarının Admin rolünü yönetin.
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => void loadServerAdminUsers()}
                    disabled={adminUsersLoading || roleActionId !== null}
                    style={[styles.refreshBtn, { borderColor: colors.border }]}
                  >
                    {adminUsersLoading
                      ? <ActivityIndicator size="small" color={colors.primary} />
                      : <Ionicons name="refresh-outline" size={16} color={colors.primary} />}
                    <Text style={[styles.refreshBtnText, { color: colors.primary }]}>Yenile</Text>
                  </TouchableOpacity>
                </View>
                <View style={[styles.rowCard, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}30` }]}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
                  <Text style={[styles.rowSub, { color: colors.primary, flex: 1 }]}>
                    Super Admin hesapları korunur; kendi rolünüzü ve Super Admin rollerini değiştiremezsiniz.
                  </Text>
                </View>
                {adminUsersError && (
                  <View style={[styles.feedback, { backgroundColor: '#FEE2E2' }]}>
                    <Ionicons name="alert-circle" size={18} color="#B91C1C" />
                    <Text style={[styles.feedbackText, { color: '#991B1B' }]}>{adminUsersError}</Text>
                  </View>
                )}
                {adminUsersSuccess && (
                  <View style={[styles.feedback, { backgroundColor: '#DCFCE7' }]}>
                    <Ionicons name="checkmark-circle" size={18} color="#15803D" />
                    <Text style={[styles.feedbackText, { color: '#166534' }]}>{adminUsersSuccess}</Text>
                  </View>
                )}
                {adminUsersLoading && serverAdminUsers.length === 0 && (
                  <ActivityIndicator color={colors.primary} />
                )}
                {!adminUsersLoading && !adminUsersError && serverAdminUsers.length === 0 && (
                  <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                    Gerçek hesap bulunamadı.
                  </Text>
                )}
                {serverAdminUsers.map(serverUser => {
                  const isSelf = serverUser.id === user.id;
                  const isProtected = isSelf || serverUser.isSuperAdmin;
                  const canPromote = !isProtected && !serverUser.isAdmin;
                  const canDemote = !isProtected && serverUser.isAdmin;
                  const isUpdating = roleActionId === serverUser.id;
                  return (
                    <View key={serverUser.id} style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={styles.rowTop}>
                          <Text style={[styles.rowName, { color: colors.foreground }]} numberOfLines={1}>
                            {serverUser.displayName}
                          </Text>
                          {serverUser.isSuperAdmin ? (
                            <View style={styles.superAdminPill}>
                              <Text style={styles.superAdminPillText}>Super Admin</Text>
                            </View>
                          ) : serverUser.isAdmin ? (
                            <View style={styles.adminPill}>
                              <Text style={styles.adminPillText}>Admin</Text>
                            </View>
                          ) : (
                            <View style={styles.userRolePill}>
                              <Text style={styles.userRolePillText}>Kullanıcı</Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.rowSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                          @{serverUser.username} · {serverUser.email}
                        </Text>
                        <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                          Katılım: {new Date(serverUser.createdAt).toLocaleDateString('tr-TR')}
                        </Text>
                      </View>
                      {!isProtected && (
                        <View style={styles.roleActionCol}>
                          {canPromote && (
                            <TouchableOpacity
                              onPress={() => confirmRoleUpdate(serverUser, 'admin')}
                              disabled={roleActionId !== null}
                              style={[styles.roleActionBtn, { backgroundColor: '#D1FAE5', borderColor: '#A7F3D0' }]}
                            >
                              {isUpdating
                                ? <ActivityIndicator size="small" color="#047857" />
                                : <Text style={[styles.roleActionText, { color: '#047857' }]}>Admin yap</Text>}
                            </TouchableOpacity>
                          )}
                          {canDemote && (
                            <TouchableOpacity
                              onPress={() => confirmRoleUpdate(serverUser, 'user')}
                              disabled={roleActionId !== null}
                              style={[styles.roleActionBtn, { backgroundColor: '#FEE2E2', borderColor: '#FECACA' }]}
                            >
                              {isUpdating
                                ? <ActivityIndicator size="small" color="#B91C1C" />
                                : <Text style={[styles.roleActionText, { color: '#B91C1C' }]}>Kullanıcı yap</Text>}
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginTop: user.isSuperAdmin ? 8 : 4 }]}>
              İÇERİK YETKİLERİ
            </Text>
            <View style={[styles.rowCard, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}30` }]}>
              <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
              <Text style={[styles.rowSub, { color: colors.primary, flex: 1 }]}>
                Her kullanıcının yazma yetkilerini buradan yönetebilirsiniz. Dergi yazarlığı, özel fotoğraf ve video paylaşım izinleri ayrı ayrı verilebilir.
              </Text>
            </View>
            {adminUsers.filter(u => !u.isAdmin).map(u => (
              <View key={u.id} style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: 'column', alignItems: 'stretch', gap: 10 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <UserAvatar name={u.displayName} color={u.avatarColor} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowName, { color: colors.foreground }]}>{u.displayName}</Text>
                    <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>@{u.username}</Text>
                  </View>
                  {u.isBanned && <View style={[styles.suspendPill, { backgroundColor: '#450a0a' }]}><Text style={[styles.suspendPillText, { color: '#FCA5A5' }]}>Engelli</Text></View>}
                </View>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {([
                    { key: 'canMagazineWrite' as const, icon: 'book-outline' as const, label: 'Dergi Yazarı' },
                    { key: 'canPostPhoto'     as const, icon: 'image-outline' as const, label: 'Fotoğraf' },
                    { key: 'canPostVideo'     as const, icon: 'videocam-outline' as const, label: 'Video' },
                  ] as const).map(perm => {
                    const granted = !!(u as any)[perm.key];
                    return (
                      <TouchableOpacity
                        key={perm.key}
                        onPress={() => {
                          if (granted) {
                            adminRevokePermission(u.id, perm.key);
                            log(`Yetki iptal: ${perm.label}`, 'user', u.id);
                          } else {
                            adminGrantPermission(u.id, perm.key);
                            log(`Yetki verildi: ${perm.label}`, 'user', u.id);
                          }
                        }}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
                          backgroundColor: granted ? `${colors.primary}22` : `${colors.border}`,
                          borderWidth: 1, borderColor: granted ? colors.primary : colors.border,
                        }}
                      >
                        <Ionicons name={perm.icon} size={13} color={granted ? colors.primary : colors.mutedForeground} />
                        <Text style={{ fontSize: 12, color: granted ? colors.primary : colors.mutedForeground, fontWeight: granted ? '600' : '400' }}>
                          {perm.label}
                        </Text>
                        {granted && <Ionicons name="checkmark" size={12} color={colors.primary} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── İçerikler ── */}
        {activeTab === 'icerik' && (
          <View style={{ gap: 8 }}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>PAYLAŞIMLAR ({posts.length})</Text>
            {posts.map(p => (
              <View key={p.id} style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowName, { color: colors.foreground }]} numberOfLines={1}>{p.title || p.content.slice(0, 50)}</Text>
                  <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{p.authorName} · {timeAgo(p.createdAt)}</Text>
                  <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>❤️ {p.likesCount} · 💬 {p.commentsCount}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => Alert.alert('Paylaşımı Kaldır', 'Bu paylaşım silinecek. Emin misiniz?', [
                    { text: 'İptal', style: 'cancel' },
                    { text: 'Kaldır', style: 'destructive', onPress: () => { adminRemovePost(p.id); log('Paylaşım kaldırıldı', 'post', p.id); } },
                  ])}
                  style={[styles.actionBtn, { backgroundColor: '#FEE2E2' }]}
                >
                  <Ionicons name="trash-outline" size={16} color="#DC2626" />
                </TouchableOpacity>
              </View>
            ))}

            <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginTop: 12 }]}>YORUMLAR ({postComments.length})</Text>
            {postComments.map(c => (
              <View key={c.id} style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <UserAvatar name={c.authorName} color={c.authorAvatarColor} size={32} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowName, { color: colors.foreground }]} numberOfLines={2}>{c.content}</Text>
                  <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{c.authorName} · {timeAgo(c.createdAt)}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => Alert.alert('Yorumu Sil', 'Bu yorum silinecek.', [
                    { text: 'İptal', style: 'cancel' },
                    { text: 'Sil', style: 'destructive', onPress: () => { adminRemoveComment(c.id); log('Yorum silindi', 'comment', c.id); } },
                  ])}
                  style={[styles.actionBtn, { backgroundColor: '#FEE2E2' }]}
                >
                  <Ionicons name="trash-outline" size={16} color="#DC2626" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* ── Destek ── */}
        {activeTab === 'destek' && (
          <View style={{ gap: 8 }}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>DESTEK TALEPLERİ ({supportTickets.length})</Text>
            {supportTickets.length === 0 && (
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Henüz talep yok</Text>
            )}
            {supportTickets.map(t => (
              <View key={t.id} style={[styles.ticketCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.ticketHeader}>
                  <UserAvatar name={t.userName} color={t.userAvatarColor} size={32} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowName, { color: colors.foreground }]}>{t.subject}</Text>
                    <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{t.userName} · {timeAgo(t.createdAt)}</Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: `${STATUS_COLORS[t.status]}20` }]}>
                    <Text style={[styles.statusText, { color: STATUS_COLORS[t.status] }]}>{STATUS_LABELS[t.status]}</Text>
                  </View>
                </View>
                <Text style={[styles.ticketBody, { color: colors.mutedForeground }]}>{t.description}</Text>
                {t.adminReply && (
                  <View style={[styles.replyBox, { backgroundColor: `${colors.primary}10` }]}>
                    <Text style={[styles.replyLabel, { color: colors.primary }]}>Yanıtınız:</Text>
                    <Text style={[styles.replyText, { color: colors.foreground }]}>{t.adminReply}</Text>
                  </View>
                )}
                <View style={styles.ticketActions}>
                  {(['bekliyor', 'isleniyor', 'cozuldu'] as TicketStatus[]).map(s => (
                    <TouchableOpacity key={s}
                      onPress={() => { updateTicketStatus(t.id, s); log(`Durum: ${s}`, 'ticket', t.id); }}
                      style={[styles.statusBtn, { backgroundColor: t.status === s ? STATUS_COLORS[s] : `${STATUS_COLORS[s]}20`, borderColor: STATUS_COLORS[s] }]}
                    >
                      <Text style={[styles.statusBtnText, { color: t.status === s ? '#fff' : STATUS_COLORS[s] }]}>{STATUS_LABELS[s]}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    onPress={() => setReplyTarget({ id: t.id, kind: 'ticket' })}
                    style={[styles.replyBtn, { backgroundColor: `${colors.primary}18` }]}
                  >
                    <Ionicons name="chatbubble-outline" size={14} color={colors.primary} />
                    <Text style={[styles.replyBtnText, { color: colors.primary }]}>Yanıtla</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginTop: 12 }]}>İLETİŞİM MESAJLARI ({contactMessages.length})</Text>
            {contactMessages.length === 0 && (
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Henüz mesaj yok</Text>
            )}
            {contactMessages.map(m => (
              <View key={m.id} style={[styles.ticketCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.ticketHeader}>
                  <UserAvatar name={m.userName} color={m.userAvatarColor} size={32} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowName, { color: colors.foreground }]}>{m.subject}</Text>
                    <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{m.userName} · {timeAgo(m.createdAt)}</Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: `${STATUS_COLORS[m.status]}20` }]}>
                    <Text style={[styles.statusText, { color: STATUS_COLORS[m.status] }]}>{STATUS_LABELS[m.status]}</Text>
                  </View>
                </View>
                <Text style={[styles.ticketBody, { color: colors.mutedForeground }]}>{m.message}</Text>
                {m.adminReply && (
                  <View style={[styles.replyBox, { backgroundColor: `${colors.primary}10` }]}>
                    <Text style={[styles.replyLabel, { color: colors.primary }]}>Yanıtınız:</Text>
                    <Text style={[styles.replyText, { color: colors.foreground }]}>{m.adminReply}</Text>
                  </View>
                )}
                <View style={styles.ticketActions}>
                  {(['bekliyor', 'isleniyor', 'cozuldu'] as TicketStatus[]).map(s => (
                    <TouchableOpacity key={s}
                      onPress={() => { updateContactStatus(m.id, s); log(`Durum: ${s}`, 'contact', m.id); }}
                      style={[styles.statusBtn, { backgroundColor: m.status === s ? STATUS_COLORS[s] : `${STATUS_COLORS[s]}20`, borderColor: STATUS_COLORS[s] }]}
                    >
                      <Text style={[styles.statusBtnText, { color: m.status === s ? '#fff' : STATUS_COLORS[s] }]}>{STATUS_LABELS[s]}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    onPress={() => setReplyTarget({ id: m.id, kind: 'contact' })}
                    style={[styles.replyBtn, { backgroundColor: `${colors.primary}18` }]}
                  >
                    <Ionicons name="chatbubble-outline" size={14} color={colors.primary} />
                    <Text style={[styles.replyBtnText, { color: colors.primary }]}>Yanıtla</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Filtre ── */}
        {activeTab === 'talepler' && (
          <View style={{ gap: 12 }}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
                 ÜYELİK TALEPLERİ
              </Text>
              <TouchableOpacity
                onPress={() => void loadPremiumRequests()}
                disabled={premiumRequestsLoading || !!premiumActionId}
                style={[styles.refreshBtn, { borderColor: colors.border }]}
              >
                {premiumRequestsLoading
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Ionicons name="refresh-outline" size={16} color={colors.primary} />}
                <Text style={[styles.refreshBtnText, { color: colors.primary }]}>Yenile</Text>
              </TouchableOpacity>
            </View>
            {premiumRequestsError && (
              <View style={[styles.feedback, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="alert-circle" size={18} color="#B91C1C" />
                <Text style={[styles.feedbackText, { color: '#991B1B' }]}>{premiumRequestsError}</Text>
              </View>
            )}
            {premiumRequestsLoading && serverPremiumRequests.length === 0 && (
              <ActivityIndicator color={colors.primary} />
            )}
            {adminPurchaseRequests.filter(r => r.type !== 'ozel_abonelik').length === 0 && !premiumRequestsLoading && (
              <View style={[styles.rowCard, { backgroundColor: colors.card, alignItems: 'center', padding: 24 }]}>
                <Ionicons name="diamond-outline" size={32} color={colors.mutedForeground} />
                <Text style={[styles.rowSub, { color: colors.mutedForeground, textAlign: 'center', marginTop: 8 }]}>
                   Henüz üyelik talebi yok.
                </Text>
              </View>
            )}
            {adminPurchaseRequests.filter(r => r.type !== 'ozel_abonelik').map(req => (
              <View
                key={req.id}
                style={[styles.rowCard, {
                  backgroundColor: colors.card,
                  borderColor: req.status === 'pending' ? '#F59E0B'
                    : req.status === 'approved' ? '#22C55E' : colors.border,
                  borderWidth: req.status === 'pending' ? 1.5 : 1,
                }]}
              >
                <View style={[styles.topCoverSmall, {
                  backgroundColor: req.type === 'vip' ? '#4C1D95'
                    : req.type === 'yazarlik_rozeti' ? '#1E3A5F' : '#78350F',
                }]}>
                  <Ionicons
                    name={req.type === 'vip' ? 'diamond' : req.type === 'yazarlik_rozeti' ? 'create' : 'star'}
                    size={18} color="#FFD700"
                  />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.rowName, { color: colors.foreground }]}>{req.planName}</Text>
                  <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                    {req.userName} · {req.price}
                  </Text>
                  {req.vipFrameColor && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>Çerçeve:</Text>
                      <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: req.vipFrameColor }} />
                    </View>
                  )}
                  <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                    {new Date(req.createdAt).toLocaleDateString('tr-TR')}
                  </Text>
                </View>
                <View style={{ gap: 6 }}>
                  {req.status === 'pending' ? (
                    <>
                      <TouchableOpacity
                        onPress={() => req.type === 'premium'
                          ? void handlePremiumReview(req.id, 'approve', req.userName)
                          : (() => { approvePurchase(req.id); Alert.alert('Onaylandı', `${req.userName} talebi onaylandı.`); })()}
                        disabled={req.type === 'premium' && premiumActionId !== null}
                        style={[styles.actionBtn, { backgroundColor: '#22C55E' }]}
                      >
                        <Text style={[styles.rowSub, { color: '#fff', fontFamily: 'Poppins_700Bold' }]}>Onayla</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => req.type === 'premium'
                          ? void handlePremiumReview(req.id, 'reject', req.userName)
                          : (() => { rejectPurchase(req.id); Alert.alert('Reddedildi', `${req.userName} talebi reddedildi.`); })()}
                        disabled={req.type === 'premium' && premiumActionId !== null}
                        style={[styles.actionBtn, { backgroundColor: '#EF4444' }]}
                      >
                        <Text style={[styles.rowSub, { color: '#fff', fontFamily: 'Poppins_700Bold' }]}>Reddet</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <View style={[styles.actionBtn, { backgroundColor: req.status === 'approved' ? '#22C55E33' : '#EF444433', width: 80 }]}>
                      <Text style={[styles.rowSub, { color: req.status === 'approved' ? '#22C55E' : '#EF4444', textAlign: 'center' }]}>
                        {req.status === 'approved' ? 'Onaylandı' : 'Reddedildi'}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {activeTab === 'ozel' && (
          <View style={{ gap: 16 }}>
            {/* Abonelik talepleri */}
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>ÖZEL ABONELİK TALEPLERİ</Text>
            {purchaseRequests.filter(r => r.type === 'ozel_abonelik').length === 0 && (
              <View style={[styles.rowCard, { backgroundColor: colors.card, alignItems: 'center', padding: 24 }]}>
                <Ionicons name="sparkles-outline" size={32} color={colors.mutedForeground} />
                <Text style={[styles.rowSub, { color: colors.mutedForeground, textAlign: 'center', marginTop: 8 }]}>
                  Henüz abonelik talebi yok.
                </Text>
              </View>
            )}
            {purchaseRequests.filter(r => r.type === 'ozel_abonelik').map(req => {
              const isExpired = req.status === 'approved' && req.expiresAt != null
                && new Date(req.expiresAt).getTime() <= Date.now();
              const borderColor = req.status === 'pending' ? '#F59E0B'
                : isExpired ? '#EF4444'
                : req.status === 'approved' ? '#22C55E'
                : colors.border;
              return (
                <View
                  key={req.id}
                  style={[styles.rowCard, {
                    backgroundColor: colors.card,
                    borderColor,
                    borderWidth: req.status === 'pending' || isExpired ? 1.5 : 1,
                  }]}
                >
                  <View style={[styles.topCoverSmall, { backgroundColor: isExpired ? '#3A1E1E' : '#1E3A2A' }]}>
                    <Ionicons name="sparkles" size={18} color={isExpired ? '#F87171' : '#4ADE80'} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.rowName, { color: colors.foreground }]}>{req.planName}</Text>
                    <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                      {req.userName} · {req.price}
                    </Text>
                    <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                      Talep: {new Date(req.createdAt).toLocaleDateString('tr-TR')}
                    </Text>
                    {req.expiresAt && (
                      <Text style={[styles.rowSub, { color: isExpired ? '#EF4444' : '#22C55E' }]}>
                        {isExpired
                          ? `Süresi doldu: ${new Date(req.expiresAt).toLocaleDateString('tr-TR')}`
                          : `Bitiş: ${new Date(req.expiresAt).toLocaleDateString('tr-TR')}`}
                      </Text>
                    )}
                  </View>
                  <View style={{ gap: 6 }}>
                    {req.status === 'pending' ? (
                      <>
                        <TouchableOpacity
                          onPress={() => {
                            approvePurchase(req.id);
                            log('Özel abonelik onaylandı', 'subscription', req.userId);
                            Alert.alert('Onaylandı', `${req.userName} aboneliği aktif edildi. 30 gün geçerli.`);
                          }}
                          style={[styles.actionBtn, { backgroundColor: '#22C55E' }]}
                        >
                          <Text style={[styles.rowSub, { color: '#fff', fontFamily: 'Poppins_700Bold' }]}>Onayla</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            rejectPurchase(req.id);
                            log('Özel abonelik reddedildi', 'subscription', req.userId);
                            Alert.alert('Reddedildi', `${req.userName} abonelik talebi reddedildi.`);
                          }}
                          style={[styles.actionBtn, { backgroundColor: '#EF4444' }]}
                        >
                          <Text style={[styles.rowSub, { color: '#fff', fontFamily: 'Poppins_700Bold' }]}>Reddet</Text>
                        </TouchableOpacity>
                      </>
                    ) : isExpired ? (
                      <TouchableOpacity
                        onPress={() => {
                          renewPurchase(req.id);
                          log('Özel abonelik yenilendi', 'subscription', req.userId);
                          Alert.alert('Yenilendi', `${req.userName} aboneliği 30 gün uzatıldı.`);
                        }}
                        style={[styles.actionBtn, { backgroundColor: '#3B82F6', width: 80 }]}
                      >
                        <Text style={[styles.rowSub, { color: '#fff', textAlign: 'center', fontFamily: 'Poppins_700Bold' }]}>Yenile</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={[styles.actionBtn, { backgroundColor: req.status === 'approved' ? '#22C55E33' : '#EF444433', width: 80 }]}>
                        <Text style={[styles.rowSub, { color: req.status === 'approved' ? '#22C55E' : '#EF4444', textAlign: 'center' }]}>
                          {req.status === 'approved' ? 'Aktif' : 'Reddedildi'}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}

            {/* Video yönetimi */}
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginTop: 8 }]}>
              ÖZEL VİDEOLAR ({ozelPosts.length})
            </Text>
            {ozelPosts.length === 0 && (
              <View style={[styles.rowCard, { backgroundColor: colors.card, alignItems: 'center', padding: 24 }]}>
                <Ionicons name="videocam-outline" size={32} color={colors.mutedForeground} />
                <Text style={[styles.rowSub, { color: colors.mutedForeground, textAlign: 'center', marginTop: 8 }]}>
                  Henüz özel video yok.
                </Text>
              </View>
            )}
            {ozelPosts.map(post => {
              const commentCount = ozelComments.filter(c => c.postId === post.id).length;
              const exp = post.expiresAt ? new Date(post.expiresAt) : null;
              const isExpired = exp ? exp.getTime() < Date.now() : false;
              return (
                <View key={post.id} style={[styles.rowCard, { backgroundColor: colors.card, borderColor: isExpired ? '#EF444440' : colors.border }]}>
                  <View style={[styles.topCoverSmall, { backgroundColor: '#1C1C2E' }]}>
                    <Ionicons name="videocam" size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.rowName, { color: colors.foreground }]} numberOfLines={1}>
                      {post.title ?? 'Video'}
                    </Text>
                    <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                      {post.authorName} · ❤️ {post.likesCount} · 💬 {commentCount}
                    </Text>
                    <Text style={[styles.rowSub, { color: isExpired ? '#EF4444' : colors.mutedForeground }]}>
                      {isExpired ? 'Süresi doldu' : exp ? `${exp.toLocaleDateString('tr-TR')}'de silinecek` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => Alert.alert('Videoyu Sil', `"${post.title ?? 'Video'}" silinsin mi?`, [
                      { text: 'İptal', style: 'cancel' },
                      { text: 'Sil', style: 'destructive', onPress: () => {
                        deleteOzelPost(post.id);
                        log('Özel video silindi', 'ozel_post', post.id);
                        Alert.alert('Silindi', 'Video kaldırıldı.');
                      }},
                    ])}
                    style={[styles.actionBtn, { backgroundColor: '#EF444420', width: 72 }]}
                  >
                    <Text style={[styles.rowSub, { color: '#EF4444', textAlign: 'center', fontFamily: 'Poppins_600SemiBold' }]}>Sil</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {activeTab === 'filtre' && (
          <View style={{ gap: 16 }}>
            {/* Haftanın Kitabı */}
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>HAFTANIN KİTABI</Text>
            <View style={{ gap: 8 }}>
              {books.map(book => {
                const isSelected = weeklyBookId === book.id;
                return (
                  <TouchableOpacity
                    key={book.id}
                    onPress={() => setWeeklyBookId(isSelected ? null : book.id)}
                    style={[styles.rowCard, {
                      backgroundColor: isSelected ? `${colors.primary}18` : colors.card,
                      borderColor: isSelected ? colors.primary : colors.border,
                    }]}
                  >
                    <View style={[styles.topCoverSmall, { backgroundColor: book.coverColor }]}>
                      <Text style={{ color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: 16 }}>{book.title[0]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowName, { color: colors.foreground }]}>{book.title}</Text>
                      <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{book.authorName} · {book.genre}</Text>
                    </View>
                    {isSelected ? (
                      <Ionicons name="trophy" size={20} color="#F5C842" />
                    ) : (
                      <Ionicons name="radio-button-off" size={20} color={colors.mutedForeground} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Filtre Seviyesi */}
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginTop: 8 }]}>FİLTRE SEVİYESİ</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(['kapali', 'dusuk', 'orta', 'yuksek'] as const).map(lvl => {
                const active = filterLevel === lvl;
                return (
                  <TouchableOpacity
                    key={lvl}
                    onPress={() => setFilterLevelAdmin(lvl)}
                    style={[styles.filterLvlBtn, {
                      backgroundColor: active ? FILTER_LEVEL_COLORS[lvl] : `${FILTER_LEVEL_COLORS[lvl]}20`,
                      borderColor: FILTER_LEVEL_COLORS[lvl],
                    }]}
                  >
                    <Text style={[styles.filterLvlTxt, { color: active ? '#fff' : FILTER_LEVEL_COLORS[lvl] }]}>
                      {FILTER_LEVEL_LABELS[lvl]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
              Kapalı: filtre yok · Düşük: yalnızca ağır küfür · Orta: küfür+hakaret · Yüksek: tüm kurallar + URL + spam
            </Text>

            {/* Yasaklı Kelimeler */}
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginTop: 8 }]}>YASAKLI KELİMELER ({bannedWords.length})</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                value={newBannedWord}
                onChangeText={setNewBannedWord}
                placeholder="Yeni kelime ekle..."
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                style={[styles.replyInput, {
                  backgroundColor: colors.card, borderColor: colors.border,
                  color: colors.foreground, flex: 1, minHeight: 0, padding: 10,
                }]}
              />
              <TouchableOpacity
                onPress={() => {
                  if (newBannedWord.trim()) {
                    addBannedWord(newBannedWord.trim());
                    setNewBannedWord('');
                  }
                }}
                style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              >
                <Ionicons name="add" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {bannedWords.map(w => (
                <TouchableOpacity
                  key={w}
                  onPress={() => {
                    Alert.alert('Kelimeyi Kaldır', `"${w}" listeden çıkarılsın mı?`, [
                      { text: 'İptal', style: 'cancel' },
                      { text: 'Kaldır', style: 'destructive', onPress: () => removeBannedWord(w) },
                    ]);
                  }}
                  style={[styles.bannedChip, { backgroundColor: '#7F1D1D20', borderColor: '#EF444440' }]}
                >
                  <Text style={[styles.bannedChipTxt, { color: '#EF4444' }]}>{w}</Text>
                  <Ionicons name="close" size={11} color="#EF4444" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Log ── */}
        {activeTab === 'log' && (
          <View style={{ gap: 8 }}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>İŞLEM KAYITLARI ({adminLogs.length})</Text>
            {adminLogs.length === 0 && (
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Henüz kayıt yok</Text>
            )}
            {adminLogs.map(l => (
              <View key={l.id} style={[styles.logRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.logDot, { backgroundColor: colors.primary }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.logAction, { color: colors.foreground }]}>{l.action}</Text>
                  <Text style={[styles.logMeta, { color: colors.mutedForeground }]}>{l.targetType} #{l.targetId.slice(0, 8)} · {timeAgo(l.createdAt)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

      </ScrollView>

      {/* Reply modal overlay */}
      {replyTarget && (
        <View style={[styles.replyOverlay, { backgroundColor: colors.background + 'F0' }]}>
          <View style={[styles.replyModal, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.replyModalTitle, { color: colors.foreground }]}>Yanıt Yaz</Text>
            <TextInput
              value={replyText}
              onChangeText={setReplyText}
              placeholder="Yanıtınızı yazın..."
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              style={[styles.replyInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              autoFocus
            />
            <View style={styles.replyModalActions}>
              <TouchableOpacity onPress={() => { setReplyTarget(null); setReplyText(''); }}
                style={[styles.replyModalBtn, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[{ fontFamily: 'Poppins_600SemiBold', fontSize: 14 }, { color: colors.foreground }]}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSendReply}
                style={[styles.replyModalBtn, { backgroundColor: colors.primary, borderColor: colors.primary, flex: 1 }]}>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#fff' }}>Gönder ve Kapat</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  adminBadge: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Poppins_700Bold', fontSize: 16 },
  tabBar: { borderBottomWidth: 1, maxHeight: 56 },
  tabBarContent: { paddingHorizontal: 12, gap: 4 },
  tabItem: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10, position: 'relative' },
  tabLabel: { fontFamily: 'Poppins_500Medium', fontSize: 11, marginTop: 2 },
  badge: { position: 'absolute', top: 6, right: 4, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: 9 },
  tabIndicator: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  content: { padding: 16, gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  refreshBtnText: { fontFamily: 'Poppins_600SemiBold', fontSize: 12 },
  feedback: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, padding: 12 },
  feedbackText: { flex: 1, fontSize: 12, fontFamily: 'Poppins_500Medium', lineHeight: 18 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { width: '47%', padding: 14, borderRadius: 14, borderWidth: 1, gap: 6 },
  statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statVal: { fontFamily: 'Poppins_700Bold', fontSize: 22 },
  statLabel: { fontFamily: 'Poppins_400Regular', fontSize: 11 },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowName: { fontFamily: 'Poppins_600SemiBold', fontSize: 13 },
  rowSub: { fontFamily: 'Poppins_400Regular', fontSize: 11, marginTop: 1 },
  actionCol: { flexDirection: 'row', gap: 6 },
  actionBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  adminPill: { backgroundColor: '#7F1D1D', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  adminPillText: { color: '#FCA5A5', fontFamily: 'Poppins_600SemiBold', fontSize: 9 },
  superAdminPill: { backgroundColor: '#312E81', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  superAdminPillText: { color: '#C7D2FE', fontFamily: 'Poppins_600SemiBold', fontSize: 9 },
  userRolePill: { backgroundColor: '#374151', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  userRolePillText: { color: '#D1D5DB', fontFamily: 'Poppins_600SemiBold', fontSize: 9 },
  roleManagementSection: { gap: 8, paddingBottom: 12, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: '#D1D5DB' },
  roleActionCol: { alignItems: 'flex-end', gap: 6 },
  roleActionBtn: { minWidth: 94, minHeight: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  roleActionText: { fontFamily: 'Poppins_600SemiBold', fontSize: 10, textAlign: 'center' },
  suspendPill: { backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  suspendPillText: { color: '#D97706', fontFamily: 'Poppins_600SemiBold', fontSize: 9 },
  sectionTitle: { fontFamily: 'Poppins_600SemiBold', fontSize: 10, letterSpacing: 1, marginTop: 4 },
  emptyText: { fontFamily: 'Poppins_400Regular', fontSize: 13, textAlign: 'center', paddingVertical: 16 },
  ticketCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  ticketHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  ticketBody: { fontFamily: 'Poppins_400Regular', fontSize: 13, lineHeight: 20 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontFamily: 'Poppins_600SemiBold', fontSize: 10 },
  ticketActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  statusBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  statusBtnText: { fontFamily: 'Poppins_600SemiBold', fontSize: 10 },
  replyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  replyBtnText: { fontFamily: 'Poppins_600SemiBold', fontSize: 10 },
  replyBox: { padding: 10, borderRadius: 10 },
  replyLabel: { fontFamily: 'Poppins_600SemiBold', fontSize: 11 },
  replyText: { fontFamily: 'Poppins_400Regular', fontSize: 13, lineHeight: 20 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  logDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  logAction: { fontFamily: 'Poppins_500Medium', fontSize: 13 },
  logMeta: { fontFamily: 'Poppins_400Regular', fontSize: 11, marginTop: 2 },
  replyOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', padding: 20 },
  replyModal: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  replyModalTitle: { fontFamily: 'Poppins_700Bold', fontSize: 16 },
  replyInput: { borderWidth: 1, borderRadius: 12, padding: 12, fontFamily: 'Poppins_400Regular', fontSize: 14, minHeight: 100 },
  replyModalActions: { flexDirection: 'row', gap: 10 },
  replyModalBtn: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  backPill: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  backPillText: { fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
  topCoverSmall: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  filterLvlBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  filterLvlTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 13 },
  bannedChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, borderWidth: 1,
  },
  bannedChipTxt: { fontFamily: 'Poppins_400Regular', fontSize: 12 },
});
