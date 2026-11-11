import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { useAuth } from '@clerk/expo';
import * as Clipboard from 'expo-clipboard';
import { Panel, SectionTitle, ui } from '@/components/FavoriUI';
import { useColors } from '@/hooks/useColors';

export function AccountAccessCard() {
  const colors = useColors();
  const { userId, isSignedIn } = useAuth();
  const [message, setMessage] = useState('');
  if (!isSignedIn || !userId) return null;
  const copy = async () => {
    try {
      const copied = await Clipboard.setStringAsync(userId);
      setMessage(copied ? 'Kullanıcı kodun kopyalandı.' : 'Kopyalanamadı. Kodun üzerine basılı tutup kopyalayabilirsin.');
    } catch {
      setMessage('Kopyalanamadı. Kodun üzerine basılı tutup kopyalayabilirsin.');
    }
  };
  return <Panel>
    <SectionTitle title="Shopify Mağaza Erişimi" />
    <Text style={[ui.body, { color: colors.mutedForeground }]}>Kendi hesabına ait kullanıcı kodun aşağıda. Yönetici ve mağaza sahibi yetkileri kayıt olduktan sonra ayrıca tanımlanır.</Text>
    <Text selectable testID="account-user-id" style={{ color: colors.deep, fontWeight: '700', marginTop: 12 }}>{userId}</Text>
    <Pressable accessibilityRole="button" testID="copy-user-id" onPress={() => void copy()} style={{ backgroundColor: colors.primary, borderRadius: 16, padding: 14, marginTop: 14 }}><Text style={{ color: colors.primaryForeground, textAlign: 'center', fontWeight: '700' }}>Kullanıcı kodunu kopyala</Text></Pressable>
    {message ? <Text accessibilityLiveRegion="polite" style={[ui.caption, { color: colors.deep, marginTop: 8 }]}>{message}</Text> : null}
    <Text style={[ui.caption, { color: colors.mutedForeground, marginTop: 8 }]}>Kodunu paylaşman otomatik yetki vermez. Sahip hesabı tanımlanana kadar ürün oluşturma kapalı kalır.</Text>
  </Panel>;
}
