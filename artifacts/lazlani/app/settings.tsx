import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Linking, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import {
  listAuthSessions,
  revokeAuthSession,
  revokeOtherAuthSessions,
  type AuthSession,
} from '@workspace/api-client-react';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function apiErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback;
  const data = (error as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return fallback;
  const candidate = (data as { error?: unknown; message?: unknown }).error
    ?? (data as { error?: unknown; message?: unknown }).message;
  return typeof candidate === 'string' && candidate.trim() ? candidate : fallback;
}

function formatSessionDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Bilinmiyor';
  return date.toLocaleString('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout, clearLocalSession, changePassword } = useAuth();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState('');
  const [sessionNotice, setSessionNotice] = useState('');
  const [sessionAction, setSessionAction] = useState<string | null>(null);
  const sessionActionRef = useRef<string | null>(null);

  const [notifLikes, setNotifLikes] = useState(true);
  const [notifComments, setNotifComments] = useState(true);
  const [notifFollows, setNotifFollows] = useState(true);
  const [notifMessages, setNotifMessages] = useState(true);
  const [dataSaver, setDataSaver] = useState(false);

  // Change password modal
  const [showPwModal, setShowPwModal] = useState(false);
  const [currentPw, setCurrentPw]   = useState('');
  const [newPw,     setNewPw]       = useState('');
  const [confirmPw, setConfirmPw]   = useState('');
  const [pwError,   setPwError]     = useState('');
  const [showCur,   setShowCur]     = useState(false);
  const [showNew,   setShowNew]     = useState(false);
  const [showConf,  setShowConf]    = useState(false);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError('');
    try {
      const response = await listAuthSessions();
      setSessions(response.sessions);
    } catch (error) {
      setSessionsError(apiErrorMessage(error, 'Aktif oturumlar yüklenemedi. Lütfen tekrar deneyin.'));
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadSessions();
  }, [loadSessions]));

  const finishSessionAction = () => {
    sessionActionRef.current = null;
    setSessionAction(null);
  };

  const revokeSession = async (session: AuthSession) => {
    if (sessionActionRef.current) return;
    sessionActionRef.current = session.id;
    setSessionAction(session.id);
    setSessionNotice('');
    try {
      const response = await revokeAuthSession(session.id);
      if (response.currentRevoked) {
        // The token is already invalid. Do not call DELETE /session again.
        await clearLocalSession();
        router.replace('/auth/login');
        return;
      }
      setSessionNotice('Oturum kapatıldı.');
      await loadSessions();
    } catch (error) {
      setSessionsError(apiErrorMessage(error, 'Oturum kapatılamadı. Lütfen tekrar deneyin.'));
    } finally {
      finishSessionAction();
    }
  };

  const revokeOtherSessions = async () => {
    if (sessionActionRef.current) return;
    sessionActionRef.current = 'others';
    setSessionAction('others');
    setSessionNotice('');
    try {
      const response = await revokeOtherAuthSessions();
      if (response.currentRevoked) {
        // Be defensive if the server ever reports that the current token was revoked.
        await clearLocalSession();
        router.replace('/auth/login');
        return;
      }
      const count = response.revokedCount;
      setSessionNotice(count === 0
        ? 'Kapatılacak başka aktif oturum yoktu.'
        : `${count} diğer oturum kapatıldı.`);
      await loadSessions();
    } catch (error) {
      setSessionsError(apiErrorMessage(error, 'Diğer oturumlar kapatılamadı. Lütfen tekrar deneyin.'));
    } finally {
      finishSessionAction();
    }
  };

  const confirmRevokeSession = (session: AuthSession) => {
    Alert.alert(
      'Oturumu Kapat',
      `${session.deviceLabel} oturumunu kapatmak istediğine emin misin?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Oturumu Kapat',
          style: 'destructive',
          onPress: () => { void revokeSession(session); },
        },
      ],
    );
  };

  const confirmRevokeOtherSessions = () => {
    Alert.alert(
      'Diğer Oturumları Kapat',
      'Bu cihaz dışındaki tüm aktif oturumlar kapatılacak. Devam etmek istiyor musun?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Tümünü Kapat',
          style: 'destructive',
          onPress: () => { void revokeOtherSessions(); },
        },
      ],
    );
  };

  const handleChangePassword = async () => {
    setPwError('');
    if (!currentPw) { setPwError('Mevcut şifrenizi girin.'); return; }
    if (newPw.length < 8) { setPwError('Yeni şifre en az 8 karakter olmalı.'); return; }
    if (newPw !== confirmPw) { setPwError('Yeni şifreler eşleşmiyor.'); return; }
    const result = await changePassword(currentPw, newPw);
    if (!result.ok) { setPwError(result.message); return; }
    setShowPwModal(false);
    setCurrentPw(''); setNewPw(''); setConfirmPw(''); setPwError('');
    Alert.alert('Başarılı', result.message);
  };

  const closePwModal = () => {
    setShowPwModal(false);
    setCurrentPw(''); setNewPw(''); setConfirmPw(''); setPwError('');
  };

  const handleLogout = () => {
    Alert.alert('Çıkış Yap', 'Hesabından çıkmak istediğine emin misin?', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Çıkış Yap', style: 'destructive', onPress: logout },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Hesabı Sil',
      'Hesabını ve tüm verilerini kalıcı olarak silmek mi istiyorsun? Bu işlem geri alınamaz.',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Devam Et',
          style: 'destructive',
          onPress: () => {
            const url = 'https://a45bcb60-3dbf-452f-b413-d55d62733f2f-00-mn12yh0cpx6a.pike.replit.dev/api-server/delete-account';
            Linking.openURL(url).catch(() =>
              Alert.alert('Hata', 'Sayfa açılamadı. Lütfen daha sonra tekrar deneyin.')
            );
          },
        },
      ]
    );
  };

  const Section = ({ title }: { title: string }) => (
    <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{title}</Text>
  );

  const Row = ({
    icon, label, value, onPress, danger = false,
  }: {
    icon: IoniconsName; label: string; value?: string; onPress?: () => void; danger?: boolean;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.row, { backgroundColor: colors.card }]}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={[styles.rowIcon, { backgroundColor: danger ? '#7F1D1D' : colors.secondary }]}>
        <Ionicons name={icon} size={18} color={danger ? '#EF4444' : colors.primary} />
      </View>
      <Text style={[styles.rowLabel, { color: danger ? '#EF4444' : colors.foreground }]}>{label}</Text>
      {value && <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>{value}</Text>}
      {onPress && !value && (
        <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
      )}
    </TouchableOpacity>
  );

  const ToggleRow = ({
    icon, label, value, onChange,
  }: {
    icon: IoniconsName; label: string; value: boolean; onChange: (v: boolean) => void;
  }) => (
    <View style={[styles.row, { backgroundColor: colors.card }]}>
      <View style={[styles.rowIcon, { backgroundColor: colors.secondary }]}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <Text style={[styles.rowLabel, { color: colors.foreground, flex: 1 }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: '#9B59F5' }}
        thumbColor="#fff"
      />
    </View>
  );

  const SessionRow = ({ session }: { session: AuthSession }) => {
    const isBusy = sessionAction === session.id;
    return (
      <View style={[styles.sessionRow, { borderBottomColor: colors.border }]}>
        <View style={[styles.sessionIcon, { backgroundColor: colors.secondary }]}>
          <Ionicons
            name={session.isCurrent ? 'phone-portrait-outline' : 'desktop-outline'}
            size={19}
            color={colors.primary}
          />
        </View>
        <View style={styles.sessionDetails}>
          <View style={styles.sessionTitleRow}>
            <Text style={[styles.sessionLabel, { color: colors.foreground }]} numberOfLines={1}>
              {session.deviceLabel}
            </Text>
            {session.isCurrent && (
              <View style={[styles.currentBadge, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.currentBadgeText, { color: colors.primary }]}>Bu cihaz</Text>
              </View>
            )}
          </View>
          <Text style={[styles.sessionMeta, { color: colors.mutedForeground }]}>
            Açılış: {formatSessionDate(session.createdAt)}
          </Text>
          <Text style={[styles.sessionMeta, { color: colors.mutedForeground }]}>
            Bitiş: {formatSessionDate(session.expiresAt)}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => confirmRevokeSession(session)}
          disabled={sessionAction !== null}
          accessibilityRole="button"
          accessibilityLabel={`${session.deviceLabel} oturumunu kapat`}
          accessibilityHint="Bu cihazdaki oturumdan çıkış yapar"
          style={[styles.revokeButton, { borderColor: colors.border }, sessionAction !== null && styles.disabledButton]}
        >
          {isBusy
            ? <ActivityIndicator size="small" color="#EF4444" />
            : <Ionicons name="close-circle-outline" size={20} color="#EF4444" />}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Ayarlar</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Account */}
        <Section title="HESAP" />
        <View style={[styles.card, { borderRadius: colors.radius }]}>
          <Row icon="person-outline" label="Profili Düzenle" onPress={() => router.push('/edit-profile' as any)} />
          <View style={[styles.sep, { backgroundColor: colors.border }]} />
          <Row icon="mail-outline" label="E-posta" value={user?.email ?? ''} />
          <View style={[styles.sep, { backgroundColor: colors.border }]} />
          <Row icon="shield-checkmark-outline" label="Şifre Değiştir" onPress={() => setShowPwModal(true)} />
        </View>

        {/* Security / active sessions */}
        <Section title="GÜVENLİK" />
        <View style={[styles.card, { borderRadius: colors.radius, backgroundColor: colors.card }]}>
          <View style={styles.sessionsHeader}>
            <View style={styles.sessionsHeaderText}>
              <Text style={[styles.sessionsTitle, { color: colors.foreground }]}>Aktif Oturumlar</Text>
              <Text style={[styles.sessionsDescription, { color: colors.mutedForeground }]}>
                Hesabının açık olduğu cihazları yönet.
              </Text>
            </View>
            <Ionicons name="shield-checkmark-outline" size={22} color={colors.primary} />
          </View>
          {sessionsLoading ? (
            <View style={styles.sessionState}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.sessionStateText, { color: colors.mutedForeground }]}>Oturumlar yükleniyor...</Text>
            </View>
          ) : sessionsError ? (
            <View style={styles.sessionState}>
              <Ionicons name="alert-circle-outline" size={20} color="#EF4444" />
              <Text style={styles.sessionError}>{sessionsError}</Text>
              <TouchableOpacity
                onPress={() => { void loadSessions(); }}
                accessibilityRole="button"
                accessibilityLabel="Aktif oturumları yeniden yükle"
                style={[styles.retryButton, { borderColor: colors.border }]}
              >
                <Text style={[styles.retryButtonText, { color: colors.primary }]}>Tekrar Dene</Text>
              </TouchableOpacity>
            </View>
          ) : sessions.length === 0 ? (
            <View style={styles.sessionState}>
              <Ionicons name="checkmark-circle-outline" size={21} color={colors.primary} />
              <Text style={[styles.sessionStateText, { color: colors.mutedForeground }]}>Aktif oturum bulunamadı.</Text>
            </View>
          ) : (
            <>
              {sessions.map((session, index) => (
                <React.Fragment key={session.id}>
                  {index > 0 && <View style={[styles.sep, { backgroundColor: colors.border }]} />}
                  <SessionRow session={session} />
                </React.Fragment>
              ))}
              <View style={[styles.sep, { backgroundColor: colors.border }]} />
              <TouchableOpacity
                onPress={confirmRevokeOtherSessions}
                disabled={sessionAction !== null}
                accessibilityRole="button"
                accessibilityLabel="Bu cihaz dışındaki tüm oturumları kapat"
                style={[styles.revokeAllButton, sessionAction !== null && styles.disabledButton]}
              >
                {sessionAction === 'others'
                  ? <ActivityIndicator size="small" color="#EF4444" />
                  : <Ionicons name="log-out-outline" size={18} color="#EF4444" />}
                <Text style={styles.revokeAllText}>Diğer tüm oturumları kapat</Text>
              </TouchableOpacity>
            </>
          )}
          {!!sessionNotice && (
            <View style={styles.noticeRow}>
              <Ionicons name="checkmark-circle-outline" size={16} color="#22C55E" />
              <Text style={styles.noticeText}>{sessionNotice}</Text>
            </View>
          )}
        </View>

        {/* Notifications */}
        <Section title="BİLDİRİMLER" />
        <View style={[styles.card, { borderRadius: colors.radius }]}>
          <ToggleRow icon="heart-outline" label="Beğeniler" value={notifLikes} onChange={setNotifLikes} />
          <View style={[styles.sep, { backgroundColor: colors.border }]} />
          <ToggleRow icon="chatbubble-outline" label="Yorumlar" value={notifComments} onChange={setNotifComments} />
          <View style={[styles.sep, { backgroundColor: colors.border }]} />
          <ToggleRow icon="person-add-outline" label="Takipçiler" value={notifFollows} onChange={setNotifFollows} />
          <View style={[styles.sep, { backgroundColor: colors.border }]} />
          <ToggleRow icon="mail-outline" label="Mesajlar" value={notifMessages} onChange={setNotifMessages} />
        </View>

        {/* Premium & Mağaza */}
        <Section title="MAĞAZA" />
        <View style={[styles.card, { borderRadius: colors.radius }]}>
          <Row icon="diamond-outline" label="Premium Üyelik" onPress={() => router.push('/premium' as any)} />
          <View style={[styles.sep, { backgroundColor: colors.border }]} />
          <Row icon="cart-outline" label="Sepetim" onPress={() => router.push('/cart' as any)} />
        </View>

        {/* İçeriklerim */}
        <Section title="İÇERİKLERİM" />
        <View style={[styles.card, { borderRadius: colors.radius }]}>
          <Row icon="document-outline" label="Taslaklar" onPress={() => router.push('/drafts' as any)} />
          <View style={[styles.sep, { backgroundColor: colors.border }]} />
          <Row icon="bookmark-outline" label="Yer İmleri" onPress={() => router.push('/bookmarks' as any)} />
          <View style={[styles.sep, { backgroundColor: colors.border }]} />
          <Row icon="heart-outline" label="Favorilerim" onPress={() => router.push('/favorites' as any)} />
          <View style={[styles.sep, { backgroundColor: colors.border }]} />
          <Row icon="star-outline" label="Önerilerim" onPress={() => router.push('/my-recommendations' as any)} />
        </View>

        {/* Oyun */}
        <Section title="EĞLENCE" />
        <View style={[styles.card, { borderRadius: colors.radius }]}>
          <Row icon="game-controller-outline" label="Kuş Eşleştirme Oyunu" onPress={() => router.push('/game' as any)} />
          <View style={[styles.sep, { backgroundColor: colors.border }]} />
          <Row icon="grid-outline" label="Edebi Eşleştir (Match-3)" onPress={() => router.push('/match3' as any)} />
        </View>

        {/* Preferences */}
        <Section title="TERCİHLER" />
        <View style={[styles.card, { borderRadius: colors.radius }]}>
          <Row icon="color-palette-outline" label="Tema Seç" onPress={() => router.push('/theme' as any)} />
          <View style={[styles.sep, { backgroundColor: colors.border }]} />
          <ToggleRow icon="cellular-outline" label="Veri Tasarrufu" value={dataSaver} onChange={setDataSaver} />
          <View style={[styles.sep, { backgroundColor: colors.border }]} />
          <Row icon="language-outline" label="Dil" value="Türkçe" />
        </View>

        {/* About */}
        <Section title="HAKKINDA" />
        <View style={[styles.card, { borderRadius: colors.radius }]}>
          <Row icon="information-circle-outline" label="Uygulama Versiyonu" value="1.0.0" />
          <View style={[styles.sep, { backgroundColor: colors.border }]} />
          <Row icon="document-text-outline" label="Kullanım Koşulları" onPress={() => router.push('/terms' as any)} />
          <View style={[styles.sep, { backgroundColor: colors.border }]} />
          <Row icon="lock-closed-outline" label="Gizlilik Politikası" onPress={() => router.push('/privacy' as any)} />
          <View style={[styles.sep, { backgroundColor: colors.border }]} />
          <Row icon="ribbon-outline" label="Telif Hakkı" onPress={() => router.push('/copyright' as any)} />
        </View>

        {/* Support */}
        <Section title="DESTEK" />
        <View style={[styles.card, { borderRadius: colors.radius }]}>
          <Row icon="headset-outline" label="Destek ve Şikâyet" onPress={() => router.push('/support' as any)} />
          <View style={[styles.sep, { backgroundColor: colors.border }]} />
          <Row icon="chatbox-ellipses-outline" label="İletişim" onPress={() => router.push('/contact' as any)} />
        </View>

        {/* Logout */}
        <Section title="" />
        <View style={[styles.card, { borderRadius: colors.radius }]}>
          <Row icon="log-out-outline" label="Çıkış Yap" onPress={handleLogout} danger />
        </View>

        {/* Danger zone */}
        <Section title="TEHLİKELİ BÖLGE" />
        <View style={[styles.card, { borderRadius: colors.radius }]}>
          <Row icon="trash-outline" label="Hesabımı ve Verilerimi Sil" onPress={handleDeleteAccount} danger />
        </View>

        <View style={{ height: Platform.OS === 'web' ? 80 : 60 }} />
      </ScrollView>

      {/* ── Change Password Modal ── */}
      <Modal visible={showPwModal} transparent animationType="slide" onRequestClose={closePwModal}>
        <KeyboardAvoidingView style={styles.modalKeyboardRoot} behavior="padding" keyboardVerticalOffset={0}>
          <Pressable style={styles.overlay} onPress={closePwModal} />
          <ScrollView
            style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}
            contentContainerStyle={styles.sheetContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            bounces={false}
          >
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Şifre Değiştir</Text>

          {/* Current password */}
          <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Mevcut Şifre</Text>
          <View style={[styles.inputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              secureTextEntry={!showCur}
              value={currentPw}
              onChangeText={setCurrentPw}
              placeholder="••••••••"
              placeholderTextColor={colors.mutedForeground}
            />
            <TouchableOpacity onPress={() => setShowCur(v => !v)}>
              <Ionicons name={showCur ? 'eye-off-outline' : 'eye-outline'} size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* New password */}
          <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Yeni Şifre</Text>
          <View style={[styles.inputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Ionicons name="key-outline" size={16} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              secureTextEntry={!showNew}
              value={newPw}
              onChangeText={setNewPw}
              placeholder="En az 8 karakter"
              placeholderTextColor={colors.mutedForeground}
            />
            <TouchableOpacity onPress={() => setShowNew(v => !v)}>
              <Ionicons name={showNew ? 'eye-off-outline' : 'eye-outline'} size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* Confirm password */}
          <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Yeni Şifre (Tekrar)</Text>
          <View style={[styles.inputWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Ionicons name="key-outline" size={16} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              secureTextEntry={!showConf}
              value={confirmPw}
              onChangeText={setConfirmPw}
              placeholder="••••••••"
              placeholderTextColor={colors.mutedForeground}
            />
            <TouchableOpacity onPress={() => setShowConf(v => !v)}>
              <Ionicons name={showConf ? 'eye-off-outline' : 'eye-outline'} size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {!!pwError && (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle-outline" size={14} color="#EF4444" />
              <Text style={styles.errorTxt}>{pwError}</Text>
            </View>
          )}

          <View style={styles.sheetBtns}>
            <TouchableOpacity onPress={closePwModal} style={[styles.sheetBtn, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.sheetBtnTxt, { color: colors.foreground }]}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleChangePassword} style={[styles.sheetBtn, { backgroundColor: colors.primary }]}>
              <Text style={[styles.sheetBtnTxt, { color: '#fff' }]}>Güncelle</Text>
            </TouchableOpacity>
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  title: { fontFamily: 'Poppins_700Bold', fontSize: 20 },
  content: { padding: 16, gap: 6 },
  sectionLabel: {
    fontFamily: 'Poppins_600SemiBold', fontSize: 11,
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginTop: 10, marginBottom: 4, paddingHorizontal: 4,
  },
  card: { overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rowIcon: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontFamily: 'Poppins_500Medium', fontSize: 14 },
  rowValue: { fontFamily: 'Poppins_400Regular', fontSize: 13 },
  sep: { height: 1, marginLeft: 62 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalKeyboardRoot: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, maxHeight: '90%',
  },
  sheetContent: { paddingHorizontal: 20, paddingBottom: 36 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 16 },
  sheetTitle: { fontFamily: 'Poppins_700Bold', fontSize: 18, marginBottom: 14 },
  inputLabel: { fontFamily: 'Poppins_500Medium', fontSize: 12, marginBottom: 6, marginTop: 8 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1,
  },
  input: { flex: 1, fontFamily: 'Poppins_400Regular', fontSize: 14 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  errorTxt: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#EF4444', flex: 1 },
  sheetBtns: { flexDirection: 'row', gap: 10, marginTop: 20 },
  sheetBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  sheetBtnTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
  sessionsHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
  },
  sessionsHeaderText: { flex: 1 },
  sessionsTitle: { fontFamily: 'Poppins_600SemiBold', fontSize: 15 },
  sessionsDescription: { fontFamily: 'Poppins_400Regular', fontSize: 12, marginTop: 2 },
  sessionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0,
  },
  sessionIcon: {
    width: 36, height: 36, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  sessionDetails: { flex: 1, minWidth: 0 },
  sessionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sessionLabel: { flexShrink: 1, fontFamily: 'Poppins_500Medium', fontSize: 14 },
  currentBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  currentBadgeText: { fontFamily: 'Poppins_600SemiBold', fontSize: 10 },
  sessionMeta: { fontFamily: 'Poppins_400Regular', fontSize: 11, marginTop: 2 },
  revokeButton: {
    width: 34, height: 34, borderRadius: 9, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  disabledButton: { opacity: 0.55 },
  revokeAllButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingHorizontal: 16, paddingVertical: 15,
  },
  revokeAllText: { color: '#EF4444', fontFamily: 'Poppins_600SemiBold', fontSize: 13 },
  sessionState: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingVertical: 22,
  },
  sessionStateText: { fontFamily: 'Poppins_400Regular', fontSize: 12 },
  sessionError: { color: '#EF4444', fontFamily: 'Poppins_400Regular', fontSize: 12, flex: 1 },
  retryButton: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  retryButtonText: { fontFamily: 'Poppins_600SemiBold', fontSize: 11 },
  noticeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingBottom: 14,
  },
  noticeText: { color: '#22C55E', fontFamily: 'Poppins_400Regular', fontSize: 12, flex: 1 },
});
