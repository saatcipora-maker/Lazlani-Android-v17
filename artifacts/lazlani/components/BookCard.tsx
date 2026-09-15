import React from 'react';
import { Image, ImageSourcePropType, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Book } from '@/data/types';

interface Props {
  book: Book;
  onPress: () => void;
  imageSource?: ImageSourcePropType;
  width?: number;
}

export default function BookCard({ book, onPress, imageSource, width = 140 }: Props) {
  const colors = useColors();
  const h = width * 1.4;

  return (
    <TouchableOpacity onPress={onPress} style={[styles.container, { width }]} activeOpacity={0.85}>
      <View style={[styles.cover, { width, height: h, borderRadius: colors.radius }]}>
        {/* Kapak fotoğrafı — yüklendiyse göster */}
        {(imageSource || book.coverUrl) ? (
          <Image
            source={imageSource ?? { uri: book.coverUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <LinearGradient
            colors={[book.coverColor, '#0D0B24']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        )}

        {/* Sadece yazar adı kapak üzerinde */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.78)']}
          style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', padding: 10 }]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 0, y: 1 }}
        >
          <Text style={styles.authorOnCover} numberOfLines={1}>{book.authorName}</Text>
        </LinearGradient>

        {/* Editör seçimi rozeti */}
        {book.isEditorChoice && (
          <View style={[styles.badge, { backgroundColor: colors.accent }]}>
            <Ionicons name="star" size={9} color="#fff" />
          </View>
        )}
      </View>

      {/* Başlık kapak altında */}
      <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
        {book.title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  cover: { overflow: 'hidden' },
  authorOnCover: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'Poppins_400Regular',
    fontSize: 10,
  },
  title: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 12,
    lineHeight: 16,
  },
  badge: {
    position: 'absolute', top: 8, right: 8,
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
});
