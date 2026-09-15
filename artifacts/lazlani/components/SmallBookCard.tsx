import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Book } from '@/data/types';

interface Props {
  book: Book;
  onPress: () => void;
}

export default function SmallBookCard({ book, onPress }: Props) {
  const colors = useColors();
  return (
    <TouchableOpacity onPress={onPress} style={styles.container} activeOpacity={0.8}>
      <LinearGradient
        colors={[book.coverColor, '#0D0B24']}
        style={[styles.cover, { borderRadius: colors.radius / 2 }]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={styles.coverTitle} numberOfLines={2}>{book.title}</Text>
      </LinearGradient>
      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>{book.title}</Text>
        <Text style={[styles.author, { color: colors.mutedForeground }]} numberOfLines={1}>{book.authorName}</Text>
        <View style={styles.meta}>
          <Ionicons name="eye-outline" size={12} color={colors.mutedForeground} />
          <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{(book.readCount / 1000).toFixed(1)}K</Text>
          <View style={[styles.dot, { backgroundColor: colors.border }]} />
          <Ionicons name="star" size={12} color="#F59E0B" />
          <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{book.rating.toFixed(1)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  cover: { width: 60, height: 80, justifyContent: 'flex-end', padding: 6, overflow: 'hidden' },
  coverTitle: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: 9, lineHeight: 12 },
  info: { flex: 1 },
  title: { fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
  author: { fontFamily: 'Poppins_400Regular', fontSize: 12, marginBottom: 4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontFamily: 'Poppins_400Regular', fontSize: 11 },
  dot: { width: 3, height: 3, borderRadius: 2 },
});
