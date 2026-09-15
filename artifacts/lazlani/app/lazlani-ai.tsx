import React, { useRef, useState } from 'react';
import {
  FlatList, Platform, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';

interface Msg { id: string; role: 'user' | 'bot'; text: string; ts: number; }

/* ── Rule-based recommendation engine ─────────────────────── */
function buildReply(text: string, books: any[], stories: any[], poems: any[]): string {
  const t = text.toLowerCase();

  const greetings = ['merhaba', 'selam', 'hey', 'hi', 'hello'];
  if (greetings.some(g => t.includes(g))) {
    return 'Merhaba! 👋 Ben Lazlani, senin kişisel edebiyat asistanınım. Kitap, hikâye veya şiir önerisi ister misin? İlgi alanlarını söylersen en uygun eserleri sana bulabilirim.';
  }

  if (t.includes('teşekkür') || t.includes('sagol') || t.includes('sağol')) {
    return 'Rica ederim! 🌸 Başka bir öneri ya da soru için her zaman burdayım.';
  }

  // Genre keywords
  const genreMap: Record<string, string[]> = {
    'Roman':       ['roman', 'romans'],
    'Romantik':    ['romantik', 'aşk', 'ask', 'sevgi', 'duygu'],
    'Macera':      ['macera', 'aksiyon', 'serüven', 'yolculuk'],
    'Bilim Kurgu': ['bilim kurgu', 'bilimkurgu', 'uzay', 'gelecek', 'robot', 'yapay zeka'],
    'Aile Draması':['aile', 'drama', 'aile draması'],
    'Kısa Hikâye': ['kısa hikaye', 'kisa hikaye', 'kısa hikâye', 'hikaye', 'hikâye'],
    'Şiir':        ['şiir', 'siir', 'dize', 'nazım'],
  };

  let matchedGenre: string | null = null;
  for (const [genre, keywords] of Object.entries(genreMap)) {
    if (keywords.some(k => t.includes(k))) { matchedGenre = genre; break; }
  }

  if (matchedGenre === 'Şiir' || t.includes('şiir')) {
    const picks = poems.slice(0, 3);
    if (picks.length === 0) return 'Henüz şiir bulunmuyor, ama yakında harika şiirler eklenecek! 🌿';
    return `Şiir ruhun gıdasıdır 🌿\n\nSana önerdiğim şiirler:\n${picks.map((p,i) => `${i+1}. "${p.title}" — ${p.authorName} (❤️ ${p.likesCount})`).join('\n')}\n\nHangisini okumak istersin?`;
  }

  if (matchedGenre === 'Kısa Hikâye' || t.includes('hikaye') || t.includes('hikâye')) {
    const picks = stories.sort((a,b) => b.likesCount - a.likesCount).slice(0, 3);
    return `İşte sana özel hikâye önerileri 📖\n\n${picks.map((s,i) => `${i+1}. "${s.title}" — ${s.authorName} (❤️ ${s.likesCount} · ⭐ ${s.rating.toFixed(1)})`).join('\n')}\n\nHangisi seni çekiyor?`;
  }

  if (matchedGenre) {
    const genreBooks = books.filter(b => b.genre === matchedGenre);
    const picks = genreBooks.length > 0 ? genreBooks.slice(0, 3) : books.sort((a,b) => b.likesCount - a.likesCount).slice(0, 3);
    return `${matchedGenre} kategorisinde sana özel seçimler 📚\n\n${picks.map((b,i) => `${i+1}. "${b.title}" — ${b.authorName}\n   ${b.description.slice(0, 70)}...\n   ❤️ ${b.likesCount} · ⭐ ${b.rating.toFixed(1)}`).join('\n\n')}\n\nBu eserlerden biri hakkında daha fazla bilgi ister misin?`;
  }

  // Reading goal
  if (t.includes('hedef') || t.includes('okuma hedef') || t.includes('kaç kitap')) {
    return `📊 Okuma hedefin için bir öneri:\n\nGünde yalnızca 15-20 dakika okuyarak yılda 12-15 kitap bitirebilirsin. Küçük başla, büyük kazan!\n\nSenin için önerdiğim başlangıç kitabı:\n"${books[0]?.title ?? 'Saatçi'}" — ${books[0]?.authorName ?? 'Elif Yazan'}\n\nKısa bölümleri olan, akıcı bir roman.`;
  }

  // Similar books
  if (t.includes('benzer') || t.includes('gibi') || t.includes('öneri')) {
    const top = books.sort((a,b) => b.rating - a.rating).slice(0, 4);
    return `En beğenilen eserlerden oluşan bir liste hazırladım 🌟\n\n${top.map((b,i) => `${i+1}. "${b.title}" — ${b.authorName} (⭐ ${b.rating.toFixed(1)})`).join('\n')}\n\nHangisini okudun, hangisini okumak istiyorsun?`;
  }

  // Author discovery
  if (t.includes('yazar') || t.includes('kimden')) {
    return `Platformumuzdaki öne çıkan yazarlar ✍️\n\n1. Elif Yazan — Roman & Bilim Kurgu ustası\n2. Ayşe Kalem — Romantik & duygu yüklü eserler\n3. Zeynep Masalcı — Macera & fantastik dünyalar\n4. Mehmet Derin — Felsefi derinlikte aile romanları\n\nBir yazarın tüm eserlerini keşfetmek ister misin?`;
  }

  // Default helpful response
  const allContent = [
    ...books.slice(0, 2).map(b => `📚 "${b.title}" (${b.genre})`),
    ...stories.slice(0, 1).map(s => `📖 "${s.title}" (Hikâye)`),
    ...poems.slice(0, 1).map(p => `🌿 "${p.title}" (Şiir)`),
  ];
  return `Sana yardımcı olmak isterim! Şu konularda öneri verebilirim:\n\n• Roman, hikâye veya şiir türü\n• Belirli bir yazara göre öneri\n• Okuma hedefin için plan\n• Benzer kitap önerileri\n\nBugün ne okumak istersin? İşte hızlı birkaç öneri:\n${allContent.join('\n')}`;
}

const QUICK_PROMPTS = [
  'Roman öner 📚',
  'Şiir öner 🌿',
  'Macera kitabı 🗺️',
  'Okuma hedefi 🎯',
  'Popüler hikayeler 📖',
];

export default function LazlaniAIScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { books, stories, poems } = useData();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 16 : insets.bottom;
  const listRef = useRef<FlatList>(null);

  const [messages, setMessages] = useState<Msg[]>([
    {
      id: 'welcome',
      role: 'bot',
      text: `Merhaba ${user?.displayName?.split(' ')[0] ?? 'okuyucu'}! 👋 Ben **Lazlani** — senin kişisel edebiyat asistanınım.\n\nİlgi alanlarına göre kitap, hikâye ve şiir önerebilir, okuma hedeflerine göre plan yapabilirim. Ne okumak istersin?`,
      ts: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;
    setInput('');

    const userMsg: Msg = { id: Date.now().toString(), role: 'user', text: trimmed, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setThinking(true);

    setTimeout(() => {
      const reply = buildReply(trimmed, books, stories, poems);
      const botMsg: Msg = { id: (Date.now() + 1).toString(), role: 'bot', text: reply, ts: Date.now() };
      setMessages(prev => [...prev, botMsg]);
      setThinking(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }, 600 + Math.random() * 500);
  };

  const renderMsg = ({ item }: { item: Msg }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.msgRow, isUser && styles.msgRowUser]}>
        {!isUser && (
          <LinearGradient colors={['#9B59F5', '#EC4899']} style={styles.botAvatar}>
            <Ionicons name="sparkles" size={14} color="#fff" />
          </LinearGradient>
        )}
        <View style={[
          styles.bubble,
          isUser
            ? { backgroundColor: colors.primary, borderBottomRightRadius: 4 }
            : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderBottomLeftRadius: 4 },
          { maxWidth: '80%' },
        ]}>
          <Text style={[styles.bubbleTxt, { color: isUser ? '#fff' : colors.foreground }]}>{item.text}</Text>
          <Text style={[styles.bubbleTime, { color: isUser ? 'rgba(255,255,255,0.6)' : colors.mutedForeground }]}>
            {new Date(item.ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient
        colors={['#1A0A3A', '#0D0B24']}
        style={[styles.header, { paddingTop: topPad + 8 }]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#E0D8FF" />
        </TouchableOpacity>
        <LinearGradient colors={['#9B59F5', '#EC4899']} style={styles.headerAvatar}>
          <Ionicons name="sparkles" size={18} color="#fff" />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName}>Lazlani</Text>
          <Text style={styles.headerSub}>✨ Edebiyat Asistanın</Text>
        </View>
        <View style={[styles.onlineDot, { backgroundColor: '#22C55E' }]} />
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? topPad + 62 : 0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={renderMsg}
          contentContainerStyle={[styles.list, { paddingBottom: 16 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListFooterComponent={thinking ? (
            <View style={styles.msgRow}>
              <LinearGradient colors={['#9B59F5', '#EC4899']} style={styles.botAvatar}>
                <Ionicons name="sparkles" size={14} color="#fff" />
              </LinearGradient>
              <View style={[styles.bubble, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderBottomLeftRadius: 4 }]}>
                <Text style={[styles.bubbleTxt, { color: colors.mutedForeground }]}>Yazıyor...</Text>
              </View>
            </View>
          ) : null}
        />

        {/* Quick prompts */}
        <View style={[styles.quickWrap, { borderTopColor: colors.border }]}>
          <FlatList
            horizontal
            data={QUICK_PROMPTS}
            keyExtractor={q => q}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => send(item)} style={[styles.quickChip, { backgroundColor: `${colors.primary}18`, borderColor: `${colors.primary}40` }]}>
                <Text style={[styles.quickTxt, { color: colors.primary }]}>{item}</Text>
              </TouchableOpacity>
            )}
          />
        </View>

        {/* Input */}
        <View style={[styles.inputRow, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: botPad + 8 }]}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            placeholder="Bir şey sor veya öneri iste..."
            placeholderTextColor={colors.mutedForeground}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={500}
            onSubmitEditing={() => send(input)}
            returnKeyType="send"
          />
          <TouchableOpacity
            onPress={() => send(input)}
            disabled={!input.trim() || thinking}
            style={[styles.sendBtn, { opacity: input.trim() && !thinking ? 1 : 0.4 }]}
          >
            <LinearGradient colors={['#9B59F5', '#EC4899']} style={styles.sendGrad}>
              <Ionicons name="send" size={17} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingBottom: 14,
  },
  backBtn: { padding: 4 },
  headerAvatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  headerName: { fontFamily: 'Poppins_700Bold', fontSize: 16, color: '#E0D8FF' },
  headerSub: { fontFamily: 'Poppins_400Regular', fontSize: 11, color: '#A394CC' },
  onlineDot: { width: 10, height: 10, borderRadius: 5 },
  list: { paddingHorizontal: 14, paddingTop: 14, gap: 12 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  msgRowUser: { justifyContent: 'flex-end' },
  botAvatar: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  bubble: { borderRadius: 18, padding: 12, gap: 4 },
  bubbleTxt: { fontFamily: 'Poppins_400Regular', fontSize: 13, lineHeight: 20 },
  bubbleTime: { fontFamily: 'Poppins_400Regular', fontSize: 10, alignSelf: 'flex-end' },
  quickWrap: { paddingVertical: 8, borderTopWidth: 1 },
  quickChip: {
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20, borderWidth: 1,
  },
  quickTxt: { fontFamily: 'Poppins_500Medium', fontSize: 12 },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1,
  },
  input: {
    flex: 1, borderRadius: 22, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 10,
    fontFamily: 'Poppins_400Regular', fontSize: 13,
    maxHeight: 100,
  },
  sendBtn: { flexShrink: 0 },
  sendGrad: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },
});
