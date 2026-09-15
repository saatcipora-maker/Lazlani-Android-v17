import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';

const CARD_EMOJIS = ['🦅', '🦋', '🦚', '🦜', '🦩', '🐦', '🦆', '🦉'];
const TOTAL_PAIRS = 8;
const GAME_DURATION = 60;

type CardState = 'hidden' | 'flipped' | 'matched';

interface Card {
  id: number;
  emoji: string;
  pairId: number;
  state: CardState;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeCards(): Card[] {
  const cards = CARD_EMOJIS.flatMap((emoji, idx) => [
    { id: idx * 2, emoji, pairId: idx, state: 'hidden' as CardState },
    { id: idx * 2 + 1, emoji, pairId: idx, state: 'hidden' as CardState },
  ]);
  return shuffle(cards);
}

export default function GameScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const [cards, setCards] = useState<Card[]>(makeCards);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [moves, setMoves] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [phase, setPhase] = useState<'playing' | 'won' | 'lost'>('playing');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scaleAnims = useRef(cards.map(() => new Animated.Value(1))).current;

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          setPhase('lost');
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => { startTimer(); return () => { if (timerRef.current) clearInterval(timerRef.current); }; }, []);

  const flipCard = (idx: number) => {
    if (phase !== 'playing') return;
    if (cards[idx].state !== 'hidden') return;
    if (flipped.length >= 2) return;
    if (flipped.includes(idx)) return;

    Animated.sequence([
      Animated.timing(scaleAnims[idx], { toValue: 0.9, duration: 80, useNativeDriver: true }),
      Animated.spring(scaleAnims[idx], { toValue: 1, useNativeDriver: true }),
    ]).start();

    const newFlipped = [...flipped, idx];
    setFlipped(newFlipped);
    setCards(prev => prev.map((c, i) => i === idx ? { ...c, state: 'flipped' } : c));
    setMoves(m => m + 1);

    if (newFlipped.length === 2) {
      const [a, b] = newFlipped;
      setTimeout(() => {
        setCards(prev => {
          const c = prev[a];
          const d = prev[b];
          if (c.pairId === d.pairId) {
            const newCombo = combo + 1;
            const points = 100 + newCombo * 50;
            setCombo(newCombo);
            setBestCombo(bc => Math.max(bc, newCombo));
            setScore(s => s + points);
            const next = prev.map((card, i) =>
              i === a || i === b ? { ...card, state: 'matched' as CardState } : card
            );
            if (next.every(card => card.state === 'matched')) {
              clearInterval(timerRef.current!);
              setPhase('won');
            }
            return next;
          } else {
            setCombo(0);
            return prev.map((card, i) =>
              i === a || i === b ? { ...card, state: 'hidden' as CardState } : card
            );
          }
        });
        setFlipped([]);
      }, 700);
    }
  };

  const restart = () => {
    setCards(makeCards());
    setFlipped([]);
    setScore(0);
    setCombo(0);
    setBestCombo(0);
    setMoves(0);
    setTimeLeft(GAME_DURATION);
    setPhase('playing');
    startTimer();
  };

  const matched = cards.filter(c => c.state === 'matched').length / 2;
  const progress = matched / TOTAL_PAIRS;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient colors={[colors.primary, colors.accent]} style={[styles.header, { paddingTop: topPad }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Kuş Eşleştirme</Text>
        <TouchableOpacity onPress={restart} style={styles.restartBtn}>
          <Ionicons name="refresh" size={22} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

      {/* Stats */}
      <View style={[styles.stats, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.primary }]}>{score}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Puan</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: timeLeft < 15 ? colors.destructive : colors.foreground }]}>{timeLeft}s</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Süre</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.accent }]}>{combo > 0 ? `x${combo}` : '-'}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Kombo</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.foreground }]}>{matched}/{TOTAL_PAIRS}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Eşleşen</Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={[styles.progressBar, { backgroundColor: colors.muted }]}>
        <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: colors.success }]} />
      </View>

      {/* Game grid */}
      <View style={styles.grid}>
        {cards.map((card, idx) => (
          <Animated.View key={card.id} style={[styles.cardWrap, { transform: [{ scale: scaleAnims[idx] }] }]}>
            <Pressable
              onPress={() => flipCard(idx)}
              style={[
                styles.card,
                {
                  backgroundColor: card.state === 'matched' ? colors.success + '33'
                    : card.state === 'flipped' ? colors.card
                    : colors.secondary,
                  borderColor: card.state === 'matched' ? colors.success
                    : card.state === 'flipped' ? colors.primary
                    : colors.border,
                },
              ]}
            >
              {card.state !== 'hidden' ? (
                <Text style={styles.emoji}>{card.emoji}</Text>
              ) : (
                <Text style={styles.hidden}>?</Text>
              )}
            </Pressable>
          </Animated.View>
        ))}
      </View>

      {/* End overlay */}
      {phase !== 'playing' && (
        <View style={styles.overlay}>
          <View style={[styles.resultCard, { backgroundColor: colors.card }]}>
            <Text style={styles.resultEmoji}>{phase === 'won' ? '🏆' : '⏰'}</Text>
            <Text style={[styles.resultTitle, { color: colors.foreground }]}>
              {phase === 'won' ? 'Tebrikler!' : 'Süre Doldu!'}
            </Text>
            <Text style={[styles.resultScore, { color: colors.primary }]}>{score} Puan</Text>
            <View style={styles.resultStats}>
              <View style={styles.resultStat}>
                <Text style={[styles.resultStatVal, { color: colors.foreground }]}>{moves}</Text>
                <Text style={[styles.resultStatLab, { color: colors.mutedForeground }]}>Hamle</Text>
              </View>
              <View style={styles.resultStat}>
                <Text style={[styles.resultStatVal, { color: colors.foreground }]}>{bestCombo}</Text>
                <Text style={[styles.resultStatLab, { color: colors.mutedForeground }]}>En İyi Kombo</Text>
              </View>
              <View style={styles.resultStat}>
                <Text style={[styles.resultStatVal, { color: colors.foreground }]}>{matched}/{TOTAL_PAIRS}</Text>
                <Text style={[styles.resultStatLab, { color: colors.mutedForeground }]}>Eşleşen</Text>
              </View>
            </View>
            <TouchableOpacity onPress={restart} style={[styles.playAgainBtn, { backgroundColor: colors.primary }]}>
              <Ionicons name="refresh" size={18} color={colors.primaryForeground} />
              <Text style={[styles.playAgainText, { color: colors.primaryForeground }]}>Tekrar Oyna</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.back()} style={styles.quitBtn}>
              <Text style={[styles.quitText, { color: colors.mutedForeground }]}>Çık</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 16 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontFamily: 'Poppins_600SemiBold', color: '#fff' },
  restartBtn: { padding: 4 },
  stats: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 18, fontFamily: 'Poppins_700Bold' },
  statLabel: { fontSize: 10, fontFamily: 'Poppins_400Regular' },
  progressBar: { height: 4 },
  progressFill: { height: 4 },
  grid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 10, justifyContent: 'center', alignContent: 'center' },
  cardWrap: { width: '22%' },
  card: { aspectRatio: 1, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 32 },
  hidden: { fontSize: 28, color: 'rgba(255,255,255,0.3)' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  resultCard: { borderRadius: 24, padding: 32, alignItems: 'center', width: '80%', gap: 12 },
  resultEmoji: { fontSize: 56 },
  resultTitle: { fontSize: 24, fontFamily: 'Poppins_700Bold' },
  resultScore: { fontSize: 36, fontFamily: 'Poppins_700Bold' },
  resultStats: { flexDirection: 'row', gap: 24, marginVertical: 8 },
  resultStat: { alignItems: 'center' },
  resultStatVal: { fontSize: 20, fontFamily: 'Poppins_700Bold' },
  resultStatLab: { fontSize: 11, fontFamily: 'Poppins_400Regular' },
  playAgainBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 14, width: '100%', justifyContent: 'center' },
  playAgainText: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
  quitBtn: { paddingVertical: 8 },
  quitText: { fontSize: 14, fontFamily: 'Poppins_400Regular' },
});
