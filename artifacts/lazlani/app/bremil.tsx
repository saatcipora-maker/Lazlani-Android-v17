import React, { useState } from 'react';
import {
  Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useData } from '@/context/DataContext';
import UserAvatar from '@/components/UserAvatar';

const GOLD    = '#F5C842';
const GOLD_DIM = 'rgba(245,200,66,0.18)';
const GOLD_DIM2 = 'rgba(245,200,66,0.07)';

const BREMIL_BADGES = [
  { icon: 'star'          as const, label: 'Seçkin Eserler'   },
  { icon: 'flash'         as const, label: 'Premium İçerik'   },
  { icon: 'ribbon'        as const, label: 'Editoryal Seçki'  },
  { icon: 'diamond'       as const, label: 'Özel Yazarlar'    },
];

const FEATURED_STORIES = [
  { id: 's-b1', title: 'Gece Yarısı Mektupları', author: 'Zeynep Masalcı', color: '#1E3A5F', reads: '42K', stars: 4.9 },
  { id: 's-b2', title: 'Kayıp Sahil',           author: 'Can Yıldız',    color: '#2D1B5E', reads: '28K', stars: 4.8 },
  { id: 's-b3', title: 'Çiçek Güncesi',         author: 'Selin Deniz',   color: '#1A3A2A', reads: '19K', stars: 4.7 },
];

const TOP_AUTHORS = [
  { id: 'ta1', name: 'Zeynep Masalcı', color: '#3B82F6', followers: '14K', badge: 'Yazar'  },
  { id: 'ta2', name: 'Can Yıldız',    color: '#8B5CF6', followers: '9K',  badge: 'Şair'   },
  { id: 'ta3', name: 'Selin Deniz',   color: '#EC4899', followers: '7K',  badge: 'Romancı' },
];

export default function BremilScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { books, poems } = useData();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 32  : insets.bottom + 16;

  const premiumBooks = books.filter(b => b.isFeatured).slice(0, 5);

  return (
    <View style={[styles.root, { backgroundColor: '#0A0710' }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={GOLD} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Ionicons name="star" size={16} color={GOLD} />
          <Text style={styles.headerTitle}>BREMİL</Text>
          <Ionicons name="star" size={16} color={GOLD} />
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: botPad }]}>

        {/* Hero banner */}
        <LinearGradient
          colors={['#1C1508', '#2A1E04', '#1C1508']}
          style={styles.hero}
        >
          <LinearGradient
            colors={[GOLD + '30', 'transparent']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroCrown}>
            <Ionicons name="star" size={28} color={GOLD} />
          </View>
          <Text style={styles.heroTitle}>Bremil Koleksiyonu</Text>
          <Text style={styles.heroSub}>
            Platformumuzun en seçkin eserlerini ve yazarlarını burada bulabilirsin.
            Editoryal ekibimiz tarafından özenle seçildi.
          </Text>
          <View style={styles.heroBadges}>
            {BREMIL_BADGES.map(b => (
              <View key={b.label} style={[styles.heroBadge, { backgroundColor: GOLD_DIM }]}>
                <Ionicons name={b.icon} size={12} color={GOLD} />
                <Text style={styles.heroBadgeTxt}>{b.label}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>

        {/* Premium Books */}
        {premiumBooks.length > 0 && (
          <>
            <View style={styles.sectionRow}>
              <Ionicons name="book" size={15} color={GOLD} />
              <Text style={styles.sectionTitle}>Seçkin Kitaplar</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
              {premiumBooks.map(book => (
                <TouchableOpacity
                  key={book.id}
                  onPress={() => router.push(`/book/${book.id}` as any)}
                  style={styles.bookCard}
                >
                  <LinearGradient colors={[book.coverColor, book.coverColor + '88', '#0A0710']} style={styles.bookCover}>
                    <Text style={styles.bookInitial}>{book.title[0]}</Text>
                    <View style={styles.premiumDot}>
                      <Ionicons name="star" size={9} color="#0A0710" />
                    </View>
                  </LinearGradient>
                  <Text style={styles.bookTitle} numberOfLines={2}>{book.title}</Text>
                  <Text style={styles.bookAuthor} numberOfLines={1}>{book.authorName}</Text>
                  <View style={styles.bookMeta}>
                    <Ionicons name="eye-outline" size={11} color={colors.mutedForeground} />
                    <Text style={styles.bookMetaTxt}>{(book.readCount / 1000).toFixed(1)}K</Text>
                    <Ionicons name="heart" size={11} color="#EC4899" />
                    <Text style={styles.bookMetaTxt}>{book.likesCount}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {/* Featured Stories */}
        <View style={styles.sectionRow}>
          <Ionicons name="document-text" size={15} color={GOLD} />
          <Text style={styles.sectionTitle}>Öne Çıkan Hikayeler</Text>
        </View>
        <View style={{ gap: 10, paddingHorizontal: 16 }}>
          {FEATURED_STORIES.map((s, i) => (
            <TouchableOpacity key={s.id} style={[styles.storyRow, { backgroundColor: GOLD_DIM2, borderColor: GOLD + '25' }]}>
              <View style={styles.storyRank}>
                <Text style={styles.storyRankTxt}>#{i + 1}</Text>
              </View>
              <LinearGradient colors={[s.color, s.color + '55']} style={styles.storyCover} />
              <View style={{ flex: 1 }}>
                <Text style={styles.storyTitle}>{s.title}</Text>
                <Text style={styles.storyAuthor}>{s.author}</Text>
                <View style={styles.storyMeta}>
                  <Ionicons name="eye-outline" size={11} color={colors.mutedForeground} />
                  <Text style={styles.storyMetaTxt}>{s.reads}</Text>
                  <Ionicons name="star" size={11} color={GOLD} />
                  <Text style={styles.storyMetaTxt}>{s.stars}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={GOLD + '80'} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Top Authors */}
        <View style={styles.sectionRow}>
          <Ionicons name="people" size={15} color={GOLD} />
          <Text style={styles.sectionTitle}>Bremil Yazarları</Text>
        </View>
        <View style={{ gap: 10, paddingHorizontal: 16 }}>
          {TOP_AUTHORS.map(a => (
            <TouchableOpacity
              key={a.id}
              onPress={() => router.push(`/user/${a.id}` as any)}
              style={[styles.authorRow, { backgroundColor: GOLD_DIM2, borderColor: GOLD + '25' }]}
            >
              <View style={[styles.authorBadgeWrap, { backgroundColor: GOLD_DIM }]}>
                <Ionicons name="star" size={14} color={GOLD} />
              </View>
              <UserAvatar name={a.name} color={a.color} size={46} />
              <View style={{ flex: 1 }}>
                <Text style={styles.authorName}>{a.name}</Text>
                <Text style={styles.authorBadge}>{a.badge} · {a.followers} takipçi</Text>
              </View>
              <TouchableOpacity style={styles.followBtn}>
                <Text style={styles.followBtnTxt}>Takip Et</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>

        {/* Selected Poems */}
        <View style={styles.sectionRow}>
          <Ionicons name="leaf" size={15} color={GOLD} />
          <Text style={styles.sectionTitle}>Seçki Şiirler</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.poemList}>
          {poems.slice(0, 4).map(p => (
            <TouchableOpacity
              key={p.id}
              onPress={() => router.push(`/poem/${p.id}` as any)}
              style={[styles.poemCard, { backgroundColor: GOLD_DIM2, borderColor: GOLD + '20' }]}
            >
              <LinearGradient colors={[p.coverColor, p.coverColor + '44']} style={styles.poemAccent} />
              <Ionicons name="leaf-outline" size={18} color={GOLD + 'AA'} style={{ marginBottom: 8 }} />
              <Text style={styles.poemTitle} numberOfLines={2}>{p.title}</Text>
              <Text style={styles.poemAuthor}>{p.authorName}</Text>
              <View style={styles.poemMeta}>
                <Ionicons name="heart" size={11} color="#EC4899" />
                <Text style={styles.poemMetaTxt}>{p.likesCount}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* CTA */}
        <View style={[styles.ctaBox, { backgroundColor: GOLD_DIM2, borderColor: GOLD + '30' }]}>
          <Ionicons name="flash" size={22} color={GOLD} />
          <Text style={styles.ctaTitle}>Premium Ol</Text>
          <Text style={styles.ctaSub}>Tüm Bremil içeriklerine sınırsız erişim için Premium üyeliğe geç.</Text>
          <TouchableOpacity style={styles.ctaBtn}>
            <LinearGradient colors={['#B8961E', '#F5C842', '#B8961E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ctaBtnGrad}>
              <Text style={styles.ctaBtnTxt}>Premium'a Geç</Text>
              <Ionicons name="arrow-forward" size={15} color="#0A0710" />
            </LinearGradient>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
  },
  backBtn: { width: 40, padding: 4 },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  headerTitle: { fontFamily: 'Poppins_700Bold', fontSize: 18, color: GOLD, letterSpacing: 3 },
  content: { paddingBottom: 40, gap: 20 },
  // Hero
  hero: { marginHorizontal: 16, borderRadius: 16, padding: 24, gap: 10, overflow: 'hidden', borderWidth: 1, borderColor: GOLD + '30' },
  heroCrown: { alignItems: 'center', marginBottom: 4 },
  heroTitle: { fontFamily: 'Poppins_700Bold', fontSize: 22, color: GOLD, textAlign: 'center' },
  heroSub: { fontFamily: 'Poppins_400Regular', fontSize: 13, color: 'rgba(245,200,66,0.7)', textAlign: 'center', lineHeight: 20 },
  heroBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 6 },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: GOLD + '30' },
  heroBadgeTxt: { fontFamily: 'Poppins_500Medium', fontSize: 11, color: GOLD },
  // Section
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginBottom: -8 },
  sectionTitle: { fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: GOLD },
  // Books
  hList: { paddingHorizontal: 16, gap: 14 },
  bookCard: { width: 110, gap: 6 },
  bookCover: { width: 110, height: 146, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  bookInitial: { fontFamily: 'Poppins_700Bold', fontSize: 36, color: '#fff' },
  premiumDot: { position: 'absolute', top: 7, right: 7, width: 18, height: 18, borderRadius: 9, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' },
  bookTitle: { fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: '#F5F0E0' },
  bookAuthor: { fontFamily: 'Poppins_400Regular', fontSize: 11, color: 'rgba(245,240,224,0.6)' },
  bookMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  bookMetaTxt: { fontFamily: 'Poppins_400Regular', fontSize: 11, color: 'rgba(245,240,224,0.5)' },
  // Stories
  storyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1 },
  storyRank: { width: 26, alignItems: 'center' },
  storyRankTxt: { fontFamily: 'Poppins_700Bold', fontSize: 16, color: GOLD },
  storyCover: { width: 44, height: 58, borderRadius: 6 },
  storyTitle: { fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: '#F5F0E0' },
  storyAuthor: { fontFamily: 'Poppins_400Regular', fontSize: 11, color: 'rgba(245,240,224,0.55)', marginTop: 2 },
  storyMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  storyMetaTxt: { fontFamily: 'Poppins_400Regular', fontSize: 11, color: 'rgba(245,240,224,0.5)' },
  // Authors
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  authorBadgeWrap: { position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  authorName: { fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#F5F0E0' },
  authorBadge: { fontFamily: 'Poppins_400Regular', fontSize: 12, color: 'rgba(245,240,224,0.55)' },
  followBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: GOLD },
  followBtnTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: GOLD },
  // Poems
  poemList: { paddingHorizontal: 16, gap: 12 },
  poemCard: { width: 140, borderRadius: 12, borderWidth: 1, padding: 14, gap: 4, overflow: 'hidden' },
  poemAccent: { position: 'absolute', top: 0, left: 0, width: 4, height: '100%' },
  poemTitle: { fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: '#F5F0E0' },
  poemAuthor: { fontFamily: 'Poppins_400Regular', fontSize: 11, color: 'rgba(245,240,224,0.55)' },
  poemMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  poemMetaTxt: { fontFamily: 'Poppins_400Regular', fontSize: 11, color: 'rgba(245,240,224,0.5)' },
  // CTA
  ctaBox: { marginHorizontal: 16, borderRadius: 16, padding: 24, alignItems: 'center', gap: 8, borderWidth: 1 },
  ctaTitle: { fontFamily: 'Poppins_700Bold', fontSize: 18, color: GOLD },
  ctaSub: { fontFamily: 'Poppins_400Regular', fontSize: 13, color: 'rgba(245,200,66,0.65)', textAlign: 'center' },
  ctaBtn: { marginTop: 8, borderRadius: 24, overflow: 'hidden' },
  ctaBtnGrad: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24 },
  ctaBtnTxt: { fontFamily: 'Poppins_700Bold', fontSize: 14, color: '#0A0710' },
});
