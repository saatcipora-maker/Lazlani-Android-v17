import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';

const CATEGORIES = ['Mağaza', 'Özel', 'Dergi', 'Bülten', 'Roman', 'Şiir'];

interface Props {
  categories?: string[];
  onSelect?: (cat: string) => void;
  selected?: string;
}

export default function CategoryTabs({ categories = CATEGORIES, onSelect, selected }: Props) {
  const colors = useColors();
  const [active, setActive] = useState(selected ?? categories[0]);

  const handlePress = (cat: string) => {
    setActive(cat);
    onSelect?.(cat);
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.container}>
      {categories.map(cat => {
        const isActive = cat === active;
        return isActive ? (
          <LinearGradient
            key={cat}
            colors={['#9B59F5', '#EC4899']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.tab}
          >
            <TouchableOpacity onPress={() => handlePress(cat)} style={styles.tabInner}>
              <Text style={[styles.tabText, { color: '#FFFFFF' }]}>{cat}</Text>
            </TouchableOpacity>
          </LinearGradient>
        ) : (
          <TouchableOpacity
            key={cat}
            onPress={() => handlePress(cat)}
            style={[styles.tab, styles.tabInactive, { borderColor: colors.border }]}
          >
            <Text style={[styles.tabText, { color: colors.mutedForeground }]}>{cat}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, gap: 8, paddingBottom: 4 },
  tab: { borderRadius: 20, overflow: 'hidden' },
  tabInactive: { borderWidth: 1 },
  tabInner: { paddingHorizontal: 18, paddingVertical: 8 },
  tabText: { fontFamily: 'Poppins_500Medium', fontSize: 13 },
});
