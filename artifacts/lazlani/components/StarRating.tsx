import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  rating: number;
  size?: number;
  showNumber?: boolean;
  color?: string;
}

export default function StarRating({ rating, size = 12, showNumber = true, color = '#F59E0B' }: Props) {
  return (
    <View style={styles.row}>
      <Ionicons name="star" size={size} color={color} />
      {showNumber && <Text style={[styles.text, { fontSize: size }]}>{rating.toFixed(1)}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  text: { color: '#F59E0B', fontFamily: 'Poppins_600SemiBold' },
});
