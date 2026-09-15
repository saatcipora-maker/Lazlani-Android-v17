import React, { useState } from 'react';
import {
  Alert, Image, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import UserAvatar from '@/components/UserAvatar';

const AVATAR_COLORS = [
  '#9B59F5','#EC4899','#3B82F6','#10B981','#F59E0B',
  '#EF4444','#8B5CF6','#06B6D4','#84CC16','#F97316',
];
const COVER_COLORS = [
  '#4C1D95','#831843','#1E3A5F','#064E3B','#78350F',
  '#7F1D1D','#2D1B69','#0E4D6B','#3F6212','#7C2D12',
];

async function pickPhoto(aspect: [number, number]): Promise<string | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('İzin gerekli', 'Galeriye erişmek için izin vermeniz gerekiyor.');
    return null;
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect,
    quality: 0.88,
  });
  if (!res.canceled && res.assets[0]) return res.assets[0].uri;
  return null;
}

async function takePhoto(aspect: [number, number]): Promise<string | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('İzin gerekli', 'Kameraya erişmek için izin vermeniz gerekiyor.');
    return null;
  }
  const res = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect, quality: 0.88 });
  if (!res.canceled && res.assets[0]) return res.assets[0].uri;
  return null;
}

function showPhotoOptions(aspect: [number, number], onPick: (uri: string) => void) {
  Alert.alert('Fotoğraf Seç', '', [
    { text: 'Galeriden Seç',  onPress: async () => { const u = await pickPhoto(aspect); if (u) onPick(u); } },
    { text: 'Kamera ile Çek', onPress: async () => { const u = await takePhoto(aspect);  if (u) onPick(u); } },
    { text: 'İptal', style: 'cancel' },
  ]);
}

export default function EditProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, updateProfile } = useAuth();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [username,    setUsername]    = useState(user?.username ?? '');
  const [bio,         setBio]         = useState(user?.bio ?? '');
  const [avatarColor, setAvatarColor] = useState(user?.avatarColor ?? '#9B59F5');
  const [coverColor,  setCoverColor]  = useState(user?.coverColor ?? '#4C1D95');
  const [avatarUri,   setAvatarUri]   = useState<string | null>(user?.avatarUrl ?? null);
  const [coverUri,    setCoverUri]    = useState<string | null>(user?.coverUrl ?? null);
  const [saving,      setSaving]      = useState(false);

  if (!user) return null;

  const handleSave = async () => {
    if (!displayName.trim()) { Alert.alert('Hata', 'Ad Soyad boş olamaz.'); return; }
    if (!username.trim())    { Alert.alert('Hata', 'Kullanıcı adı boş olamaz.'); return; }
    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await updateProfile({
      displayName: displayName.trim(),
      username: username.trim(),
      bio: bio.trim(),
      avatarColor,
      coverColor,
      avatarUrl: avatarUri ?? undefined,
      coverUrl:  coverUri  ?? undefined,
    });
    setSaving(false);
    router.back();
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <View style={[styles.root, { backgroundColor: colors.background }]}>

        {/* Header */}
        <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Profili Düzenle</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            <LinearGradient colors={['#9B59F5','#EC4899']} start={{ x: 0,y:0 }} end={{ x:1,y:0 }} style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Cover photo */}
          <TouchableOpacity
            onPress={() => showPhotoOptions([16, 9], setCoverUri)}
            activeOpacity={0.85}
            style={styles.coverWrap}
          >
            {coverUri ? (
              <Image source={{ uri: coverUri }} style={styles.coverImg} />
            ) : (
              <LinearGradient colors={[coverColor, coverColor + '66']} style={styles.coverImg} />
            )}
            <View style={styles.coverEditBtn}>
              <Ionicons name="camera-outline" size={16} color="#fff" />
              <Text style={styles.coverEditText}>Kapak Fotoğrafı</Text>
            </View>
          </TouchableOpacity>

          {/* Avatar */}
          <View style={styles.avatarSection}>
            <TouchableOpacity
              onPress={() => showPhotoOptions([1, 1], setAvatarUri)}
              activeOpacity={0.85}
              style={styles.avatarWrap}
            >
              <UserAvatar name={displayName || user.displayName} color={avatarColor} size={90} imageUri={avatarUri ?? undefined} />
              <View style={styles.avatarEditBadge}>
                <Ionicons name="camera" size={14} color="#fff" />
              </View>
            </TouchableOpacity>
            <View>
              <Text style={[styles.previewName, { color: colors.foreground }]}>{displayName || user.displayName}</Text>
              <Text style={[styles.previewUsername, { color: colors.mutedForeground }]}>@{username || user.username}</Text>
            </View>
          </View>

          {/* Name */}
          <View style={[styles.fieldCard, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Ad Soyad</Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              style={[styles.fieldInput, { color: colors.foreground, borderBottomColor: colors.border }]}
              placeholder="Adınız"
              placeholderTextColor={colors.mutedForeground}
            />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 14 }]}>Kullanıcı Adı</Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              style={[styles.fieldInput, { color: colors.foreground, borderBottomColor: colors.border }]}
              placeholder="@kullaniciadi"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
            />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 14 }]}>Bio</Text>
            <TextInput
              value={bio}
              onChangeText={setBio}
              style={[styles.fieldInput, { color: colors.foreground, borderBottomColor: 'transparent' }]}
              placeholder="Kendini tanıt…"
              placeholderTextColor={colors.mutedForeground}
              multiline
              maxLength={200}
            />
            <Text style={[styles.charCount, { color: colors.mutedForeground }]}>{bio.length}/200</Text>
          </View>

          {/* Avatar color */}
          <View style={[styles.fieldCard, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Avatar Rengi</Text>
            <View style={styles.swatchRow}>
              {AVATAR_COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setAvatarColor(c)}
                  style={[styles.swatch, { backgroundColor: c },
                    avatarColor === c && styles.swatchSel]}
                >
                  {avatarColor === c && <Ionicons name="checkmark" size={14} color="#fff" />}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Cover color */}
          <View style={[styles.fieldCard, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Kapak Rengi</Text>
            <View style={styles.swatchRow}>
              {COVER_COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setCoverColor(c)}
                  style={[styles.swatch, { backgroundColor: c },
                    coverColor === c && styles.swatchSel]}
                >
                  {coverColor === c && <Ionicons name="checkmark" size={14} color="#fff" />}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={{ height: 60 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  iconBtn: { padding: 4 },
  headerTitle: { flex: 1, fontFamily: 'Poppins_700Bold', fontSize: 18 },
  saveBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20 },
  saveBtnText: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: 13 },
  content: { gap: 16, paddingBottom: 40 },
  coverWrap: { height: 180, width: '100%', justifyContent: 'flex-end' },
  coverImg: { ...StyleSheet.absoluteFillObject },
  coverEditBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'center', marginBottom: 16,
    backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
  },
  coverEditText: { color: '#fff', fontFamily: 'Poppins_600SemiBold', fontSize: 13 },
  avatarSection: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    paddingHorizontal: 20, marginTop: -40,
  },
  avatarWrap: { position: 'relative' },
  avatarEditBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#9B59F5', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#0D0B24',
  },
  previewName:     { fontFamily: 'Poppins_700Bold', fontSize: 18 },
  previewUsername: { fontFamily: 'Poppins_400Regular', fontSize: 13 },
  fieldCard: { marginHorizontal: 16, padding: 16 },
  fieldLabel: { fontFamily: 'Poppins_600SemiBold', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  fieldInput: { fontFamily: 'Poppins_400Regular', fontSize: 15, borderBottomWidth: 1, paddingBottom: 8 },
  charCount: { fontFamily: 'Poppins_400Regular', fontSize: 11, textAlign: 'right', marginTop: 4 },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  swatch: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  swatchSel: { borderWidth: 3, borderColor: '#fff' },
});
