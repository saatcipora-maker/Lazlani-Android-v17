import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface Props {
  title: string;
  subtitle?: string;
  onSeeAll?: () => void;
}

export default function SectionHeader({ title, subtitle, onSeeAll }: Props) {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <View>
        {subtitle && <Text style={[styles.subtitle, { color: colors.primary }]}>{subtitle}</Text>}
        <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      </View>
      {onSeeAll && (
        <TouchableOpacity onPress={onSeeAll}>
          <Text style={[styles.seeAll, { color: colors.primary }]}>Tümünü Gör</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 20, marginBottom: 12 },
  subtitle: { fontSize: 11, fontFamily: 'Poppins_500Medium', textTransform: 'uppercase', letterSpacing: 1 },
  title: { fontSize: 20, fontFamily: 'Poppins_700Bold' },
  seeAll: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
});
