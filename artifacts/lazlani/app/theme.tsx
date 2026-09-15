import React from 'react';
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { THEME_META, THEME_ORDER, ThemeName } from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';

function ThemeCard({ name, isSelected, onPress }: { name: ThemeName; isSelected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const meta = THEME_META[name];
  const scale = React.useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.96, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={handlePress}
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: isSelected ? colors.primary : colors.border,
            borderWidth: isSelected ? 2 : 1,
            shadowColor: isSelected ? colors.primary : '#000',
            shadowOpacity: isSelected ? 0.3 : 0.08,
          },
        ]}
      >
        {/* Color swatches */}
        <View style={styles.swatchRow}>
          {meta.swatch.map((c, i) => (
            <View
              key={i}
              style={[
                styles.swatch,
                { backgroundColor: c, borderRadius: i === 0 ? 8 : 8 },
              ]}
            />
          ))}
        </View>

        {/* Label */}
        <Text style={[styles.label, { color: colors.foreground }]}>{meta.label}</Text>

        {/* Selection circle */}
        <View
          style={[
            styles.circle,
            {
              borderColor: isSelected ? colors.primary : colors.mutedForeground,
              backgroundColor: isSelected ? colors.primary : 'transparent',
            },
          ]}
        >
          {isSelected && (
            <Ionicons name="checkmark" size={14} color={colors.primaryForeground} />
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function ThemeScreen() {
  const { colors, themeName, setTheme } = useTheme();
  const { user, updateProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Tema Seç</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Uygulamanın görünümünü kişiselleştir
        </Text>

        {THEME_ORDER.map(name => (
          <ThemeCard
            key={name}
            name={name}
            isSelected={themeName === name}
            onPress={() => {
              setTheme(name);
              if (user) updateProfile({ theme: name });
            }}
          />
        ))}

        <View style={{ height: insets.bottom + 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { fontSize: 18, fontFamily: 'Poppins_600SemiBold' },
  subtitle: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
    marginBottom: 20,
    marginTop: 8,
  },
  list: { padding: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 3,
  },
  swatchRow: { flexDirection: 'row', gap: 6, marginRight: 14 },
  swatch: { width: 28, height: 28 },
  label: { flex: 1, fontSize: 16, fontFamily: 'Poppins_500Medium' },
  circle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
