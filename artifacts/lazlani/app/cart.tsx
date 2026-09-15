import React, { useState } from 'react';
import {
  Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { Book } from '@/data/types';

const BOOK_PRICE = 12.99;

export default function CartScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { books, savedIds, toggleSave } = useData();
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  // Kaydedilen kitaplar sepet olarak kullanılıyor
  const cartBooks: Book[] = books.filter(b => savedIds.has(b.id));

  const toggleCheck = (id: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const removeItem = (id: string, title: string) => {
    Alert.alert('Sepetten Kaldır', `"${title}" sepetten kaldırılsın mı?`, [
      { text: 'İptal', style: 'cancel' },
      { text: 'Kaldır', style: 'destructive', onPress: () => toggleSave(id) },
    ]);
  };

  const checkedBooks = cartBooks.filter(b => checkedIds.has(b.id));
  const total = checkedBooks.length * BOOK_PRICE;

  const handleCheckout = () => {
    if (checkedBooks.length === 0) {
      Alert.alert('Seçim Yapılmadı', 'Satın almak istediğiniz kitapları seçin.');
      return;
    }
    Alert.alert(
      'Satın Alma',
      `${checkedBooks.length} kitap — ₺${total.toFixed(2)}\n\nÖdeme sistemi yakında aktif olacak.`,
      [{ text: 'Tamam' }]
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Sepetim</Text>
        <View style={[styles.countBadge, { backgroundColor: colors.primary }]}>
          <Text style={styles.countText}>{cartBooks.length}</Text>
        </View>
      </View>

      {cartBooks.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="cart-outline" size={64} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Sepetiniz boş</Text>
          <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
            Kitapları kaydederek sepete ekleyebilirsiniz
          </Text>
          <TouchableOpacity onPress={() => router.push('/' as any)}
            style={[styles.browseBtn, { backgroundColor: colors.primary }]}>
            <Text style={[styles.browseBtnText, { color: colors.primaryForeground }]}>Kitaplara Gözat</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              Satın almak istediklerinizi seçin
            </Text>
            {cartBooks.map(book => (
              <View key={book.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Pressable onPress={() => toggleCheck(book.id)} style={styles.checkWrap}>
                  <View style={[
                    styles.checkbox,
                    { borderColor: checkedIds.has(book.id) ? colors.primary : colors.border },
                    checkedIds.has(book.id) && { backgroundColor: colors.primary },
                  ]}>
                    {checkedIds.has(book.id) && <Ionicons name="checkmark" size={12} color="#fff" />}
                  </View>
                </Pressable>
                <View style={[styles.coverBlock, { backgroundColor: book.coverColor }]}>
                  <Ionicons name="book-outline" size={22} color="rgba(255,255,255,0.8)" />
                </View>
                <View style={styles.cardInfo}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>{book.title}</Text>
                  <Text style={[styles.cardAuthor, { color: colors.mutedForeground }]} numberOfLines={1}>{book.authorName}</Text>
                  <Text style={[styles.cardGenre, { color: colors.primary }]}>{book.genre}</Text>
                </View>
                <View style={styles.cardRight}>
                  <Text style={[styles.price, { color: colors.foreground }]}>₺{BOOK_PRICE.toFixed(2)}</Text>
                  <TouchableOpacity onPress={() => removeItem(book.id, book.title)} style={styles.removeBtn}>
                    <Ionicons name="trash-outline" size={18} color={colors.destructive} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            <View style={{ height: 120 }} />
          </ScrollView>

          {/* Bottom checkout bar */}
          <View style={[styles.checkout, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 8 }]}>
            <View>
              <Text style={[styles.checkoutLabel, { color: colors.mutedForeground }]}>
                {checkedBooks.length > 0 ? `${checkedBooks.length} kitap seçildi` : 'Seçim yapılmadı'}
              </Text>
              {checkedBooks.length > 0 && (
                <Text style={[styles.checkoutTotal, { color: colors.foreground }]}>₺{total.toFixed(2)}</Text>
              )}
            </View>
            <TouchableOpacity onPress={handleCheckout} style={{ borderRadius: 14, overflow: 'hidden' }}>
              <LinearGradient colors={[colors.primary, colors.accent]} style={styles.checkoutBtn}>
                <Ionicons name="card-outline" size={18} color="#fff" />
                <Text style={styles.checkoutBtnText}>Satın Al</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { flex: 1, fontSize: 18, fontFamily: 'Poppins_600SemiBold' },
  countBadge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  countText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', color: '#fff' },
  hint: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginBottom: 12 },
  list: { padding: 16 },
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, marginBottom: 10, padding: 10, gap: 10 },
  checkWrap: { padding: 4 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  coverBlock: { width: 48, height: 62, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
  cardAuthor: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 2 },
  cardGenre: { fontSize: 11, fontFamily: 'Poppins_500Medium', marginTop: 4 },
  cardRight: { alignItems: 'flex-end', gap: 8 },
  price: { fontSize: 15, fontFamily: 'Poppins_700Bold' },
  removeBtn: { padding: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyTitle: { fontSize: 20, fontFamily: 'Poppins_600SemiBold' },
  emptyDesc: { fontSize: 13, fontFamily: 'Poppins_400Regular', textAlign: 'center' },
  browseBtn: { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  browseBtnText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
  checkout: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
  checkoutLabel: { fontSize: 12, fontFamily: 'Poppins_400Regular' },
  checkoutTotal: { fontSize: 22, fontFamily: 'Poppins_700Bold' },
  checkoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
  checkoutBtnText: { fontSize: 15, fontFamily: 'Poppins_600SemiBold', color: '#fff' },
});
