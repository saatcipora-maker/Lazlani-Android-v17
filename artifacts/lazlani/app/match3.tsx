import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet, Text, TouchableOpacity, View, Platform, Vibration,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

const BOARD_SIZE = 7;
const TILE_EMOJIS = ['📖', '✍️', '🖋️', '📝', '🔖', '🌙', '⭐'];
const MOVE_LIMIT = 20;
const LEVEL_TARGET = 300;

type Tile = { emoji: string; id: string } | null;

const makeBoard = (): Tile[][] =>
  Array.from({ length: BOARD_SIZE }, (_, r) =>
    Array.from({ length: BOARD_SIZE }, (_, c) => ({
      emoji: TILE_EMOJIS[Math.floor(Math.random() * TILE_EMOJIS.length)],
      id: `${r}-${c}-${Date.now()}-${Math.random()}`,
    }))
  );

const findMatches = (board: Tile[][]): Set<string> => {
  const matched = new Set<string>();
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE - 2; c++) {
      const a = board[r][c], b = board[r][c + 1], cc = board[r][c + 2];
      if (a && b && cc && a.emoji === b.emoji && b.emoji === cc.emoji) {
        matched.add(a.id); matched.add(b.id); matched.add(cc.id);
      }
    }
  }
  for (let c = 0; c < BOARD_SIZE; c++) {
    for (let r = 0; r < BOARD_SIZE - 2; r++) {
      const a = board[r][c], b = board[r + 1][c], cc = board[r + 2][c];
      if (a && b && cc && a.emoji === b.emoji && b.emoji === cc.emoji) {
        matched.add(a.id); matched.add(b.id); matched.add(cc.id);
      }
    }
  }
  return matched;
};

const applyGravity = (board: Tile[][]): Tile[][] => {
  return board[0].map((_, c) => {
    const col = board.map(r => r[c]).filter(Boolean);
    const fill = Array.from({ length: BOARD_SIZE - col.length }, () => ({
      emoji: TILE_EMOJIS[Math.floor(Math.random() * TILE_EMOJIS.length)],
      id: `new-${Date.now()}-${Math.random()}`,
    }));
    return [...fill, ...col];
  }).reduce((acc, col, c) => {
    col.forEach((tile, r) => { acc[r] = acc[r] || []; acc[r][c] = tile; });
    return acc;
  }, [] as Tile[][]);
};

export default function Match3Screen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const [board, setBoard] = useState<Tile[][]>(makeBoard);
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [exploding, setExploding] = useState<Set<string>>(new Set());
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(MOVE_LIMIT);
  const [phase, setPhase] = useState<'play' | 'won' | 'lost'>('play');
  const [combo, setCombo] = useState(0);
  const busy = useRef(false);

  const processBoard = useCallback(async (b: Tile[][], comboMulti = 1) => {
    const matches = findMatches(b);
    if (matches.size === 0) { busy.current = false; return; }

    setExploding(matches);
    await new Promise(r => setTimeout(r, 250));

    const pts = matches.size * 10 * comboMulti;
    setScore(prev => {
      const next = prev + pts;
      return next;
    });
    setCombo(comboMulti);

    const cleared = b.map(row => row.map(t => (t && matches.has(t.id) ? null : t)));
    const fallen = applyGravity(cleared);
    setBoard(fallen);
    setExploding(new Set());

    await new Promise(r => setTimeout(r, 100));
    processBoard(fallen, comboMulti + 1);
  }, []);

  useEffect(() => {
    if (score >= LEVEL_TARGET && phase === 'play') setPhase('won');
  }, [score]);

  useEffect(() => {
    if (moves <= 0 && phase === 'play') setPhase('lost');
  }, [moves]);

  const handleTile = (r: number, c: number) => {
    if (busy.current || phase !== 'play') return;
    if (!selected) { setSelected([r, c]); return; }
    const [sr, sc] = selected;
    if (sr === r && sc === c) { setSelected(null); return; }
    const adjacent = (Math.abs(sr - r) + Math.abs(sc - c)) === 1;
    if (!adjacent) { setSelected([r, c]); return; }

    setSelected(null);
    busy.current = true;
    setMoves(m => m - 1);

    const nb = board.map(row => [...row]);
    const tmp = nb[sr][sc];
    nb[sr][sc] = nb[r][c];
    nb[r][c] = tmp;
    setBoard(nb);
    setCombo(0);
    setTimeout(() => processBoard(nb), 150);
  };

  const restart = () => {
    setBoard(makeBoard());
    setScore(0);
    setMoves(MOVE_LIMIT);
    setPhase('play');
    setSelected(null);
    setExploding(new Set());
    setCombo(0);
    busy.current = false;
  };

  const TILE_SIZE = Math.floor((Math.min(380, 440) - 32) / BOARD_SIZE);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>📚 Eşleştir</Text>
        <TouchableOpacity onPress={restart}>
          <Ionicons name="refresh" size={22} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={[styles.stats, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.stat}>
          <Text style={[styles.statVal, { color: colors.primary }]}>{score}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Puan</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.stat}>
          <Text style={[styles.statVal, { color: moves <= 5 ? '#EF4444' : colors.foreground }]}>{moves}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Hamle</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.stat}>
          <Text style={[styles.statVal, { color: colors.foreground }]}>{LEVEL_TARGET}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Hedef</Text>
        </View>
        {combo > 1 && (
          <>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.stat}>
              <Text style={[styles.statVal, { color: '#F59E0B' }]}>x{combo}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Kombo</Text>
            </View>
          </>
        )}
      </View>

      {/* Progress bar */}
      <View style={[styles.progressBar, { backgroundColor: colors.card }]}>
        <View style={[styles.progressFill, { width: `${Math.min(100, (score / LEVEL_TARGET) * 100)}%` as any, backgroundColor: colors.primary }]} />
      </View>

      {/* Board */}
      <View style={styles.boardWrap}>
        {board.map((row, r) => (
          <View key={r} style={styles.boardRow}>
            {row.map((tile, c) => {
              const isSel = selected && selected[0] === r && selected[1] === c;
              const isExp = tile && exploding.has(tile.id);
              return (
                <TouchableOpacity
                  key={tile?.id ?? `${r}-${c}`}
                  onPress={() => handleTile(r, c)}
                  style={[
                    styles.tile,
                    { width: TILE_SIZE, height: TILE_SIZE, borderRadius: 10, backgroundColor: colors.card, borderColor: isSel ? colors.primary : colors.border },
                    isSel && { borderWidth: 2, backgroundColor: colors.primary + '30' },
                    isExp && { opacity: 0.1, transform: [{ scale: 1.3 }] },
                  ]}
                >
                  <Text style={{ fontSize: TILE_SIZE * 0.45 }}>{tile?.emoji ?? ''}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      {/* Overlay */}
      {phase !== 'play' && (
        <View style={styles.overlay}>
          <View style={[styles.overlayCard, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
            <Text style={styles.overlayEmoji}>{phase === 'won' ? '🎉' : '😔'}</Text>
            <Text style={[styles.overlayTitle, { color: colors.foreground }]}>
              {phase === 'won' ? 'Tebrikler!' : 'Oyun Bitti'}
            </Text>
            <Text style={[styles.overlayScore, { color: colors.primary }]}>{score} puan</Text>
            <Text style={[styles.overlaySub, { color: colors.mutedForeground }]}>
              {phase === 'won' ? 'Hedefi geçtin!' : `Hedefe ${LEVEL_TARGET - score} puan kaldı`}
            </Text>
            <TouchableOpacity onPress={restart} style={[styles.restartBtn, { backgroundColor: colors.primary }]}>
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={styles.restartBtnText}>Tekrar Oyna</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  title: { fontSize: 18, fontWeight: '800' },
  stats: { flexDirection: 'row', marginHorizontal: 16, marginVertical: 10, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  statVal: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 11, marginTop: 2 },
  statDivider: { width: 1, marginVertical: 8 },
  progressBar: { height: 6, marginHorizontal: 16, borderRadius: 3, overflow: 'hidden', marginBottom: 14 },
  progressFill: { height: '100%', borderRadius: 3 },
  boardWrap: { alignItems: 'center', paddingHorizontal: 16, gap: 4 },
  boardRow: { flexDirection: 'row', gap: 4 },
  tile: { justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#00000088', justifyContent: 'center', alignItems: 'center' },
  overlayCard: { padding: 32, alignItems: 'center', width: 280, gap: 10 },
  overlayEmoji: { fontSize: 52 },
  overlayTitle: { fontSize: 26, fontWeight: '900' },
  overlayScore: { fontSize: 32, fontWeight: '900' },
  overlaySub: { fontSize: 14, textAlign: 'center' },
  restartBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, marginTop: 8 },
  restartBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
