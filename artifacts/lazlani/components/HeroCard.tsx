import React from 'react';
import { Image, ImageSourcePropType, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { Book } from '@/data/types';

interface Props {
  book: Book;
  label?: string;
  onPress: () => void;
  onSave: () => void;
  isSaved: boolean;
  imageSource?: ImageSourcePropType;
}

export default function HeroCard({ book, label = 'GÜNÜN KİTABI', onPress, onSave, isSaved, imageSource }: Props) {
  const colors = useColors();

  const handleSave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSave();
  };

  return (
    <View style={[styles.container, { borderRadius: colors.radius }]}>
      {imageSource ? (
        <Image source={imageSource} style={[StyleSheet.absoluteFill, { borderRadius: colors.radius }]} resizeMode="cover" />
      ) : (
        <LinearGradient
          colors={[book.coverColor, '#1A0B3B']}
          style={[StyleSheet.absoluteFill, { borderRadius: colors.radius }]}
        />
      )}
      <LinearGradient
        colors={['rgba(13,11,36,0.1)', 'rgba(13,11,36,0.88)']}
        style={[StyleSheet.absoluteFill, { borderRadius: colors.radius }]}
        start={{ x: 0, y: 0.2 }}
        end={{ x: 0, y: 1 }}
      />
      <View style={styles.content}>
        <View style={styles.badge}>
          <Ionicons name="sparkles" size={12} color="#EC4899" />
          <Text style={styles.badgeText}>{label}</Text>
        </View>
        <Text style={styles.title}>{book.title}</Text>
        <Text style={styles.author}>{book.authorName}</Text>
        <View style={styles.actions}>
          <TouchableOpacity onPress={onPress} style={styles.readBtn} activeOpacity={0.85}>
            <LinearGradient
              colors={['#9B59F5', '#EC4899']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.readBtnGrad}
            >
              <Ionicons name="book-outline" size={16} color="#fff" />
              <Text style={styles.readBtnText}>Hemen Oku</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSave} style={[styles.saveBtn, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
            <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginHorizontal: 20, height: 220, overflow: 'hidden', justifyContent: 'flex-end' },
  content: { padding: 16 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 12, marginBottom: 8,
  },
  badgeText: { color: '#FFFFFF', fontFamily: 'Poppins_600SemiBold', fontSize: 11, letterSpacing: 0.5 },
  title: { color: '#FFFFFF', fontFamily: 'Poppins_700Bold', fontSize: 24, lineHeight: 30 },
  author: { color: 'rgba(255,255,255,0.75)', fontFamily: 'Poppins_400Regular', fontSize: 13, marginBottom: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  readBtn: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  readBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  readBtnText: { color: '#FFFFFF', fontFamily: 'Poppins_700Bold', fontSize: 14 },
  saveBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
