import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

interface Props {
  type: 'goal' | 'ai';
  progress?: number;
  count?: number;
}

export default function StatCard({ type, progress = 75, count = 8 }: Props) {
  const colors = useColors();

  if (type === 'goal') {
    const circ = 2 * Math.PI * 22;
    const dash = (progress / 100) * circ;
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
        <View style={styles.goalHeader}>
          <Ionicons name="book-outline" size={18} color={colors.accent} />
          <Text style={[styles.label, { color: colors.primary }]}>OKUMA HEDEFİN</Text>
        </View>
        <View style={styles.goalBody}>
          <View style={styles.progressCircle}>
            <Text style={[styles.progressText, { color: colors.foreground }]}>{progress}%</Text>
          </View>
          <Text style={[styles.goalDesc, { color: colors.foreground }]}>
            Sana özel{'\n'}20 kitap hedefi{'\n'}hazırlandı!
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
      <View style={styles.goalHeader}>
        <Ionicons name="flash-outline" size={18} color="#F59E0B" />
        <Text style={[styles.label, { color: '#F59E0B' }]}>AI ÖNERİLERİ</Text>
      </View>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={[styles.aiCount, { color: colors.foreground }]}>Sana özel {count} yeni öneri hazırlandı</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, padding: 14, minHeight: 110 },
  goalHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  label: { fontFamily: 'Poppins_700Bold', fontSize: 10, letterSpacing: 0.5 },
  goalBody: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressCircle: {
    width: 56, height: 56, borderRadius: 28, borderWidth: 4, borderColor: '#9B59F5',
    alignItems: 'center', justifyContent: 'center', borderStyle: 'solid',
  },
  progressText: { fontFamily: 'Poppins_700Bold', fontSize: 13 },
  goalDesc: { fontFamily: 'Poppins_500Medium', fontSize: 11, lineHeight: 16 },
  aiCount: { fontFamily: 'Poppins_600SemiBold', fontSize: 13, lineHeight: 18 },
});
