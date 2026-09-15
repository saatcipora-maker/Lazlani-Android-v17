import React, { useEffect, useState } from 'react';
import {
  Alert, FlatList, Keyboard, Platform, StyleSheet, Text, TextInput,
  TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { Message } from '@/data/types';
import UserAvatar from '@/components/UserAvatar';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const router = useRouter();
  const { user } = useAuth();
  const { conversations, messagesByConv, sendMessage, markConversationRead, toggleMessageLike } = useData();
  const [text, setText] = useState('');
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = insets.bottom;
  const restingComposerLift = Math.min(72, Math.max(48, screenHeight * 0.07));

  const conversation = conversations.find(c => c.id === id);
  const messages = messagesByConv[id] ?? [];

  useEffect(() => {
    markConversationRead(id);
  }, [id]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, () => setIsKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setIsKeyboardVisible(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  if (!user) return null;
  if (!conversation) {
    return (
      <View style={[styles.root, styles.notFound, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <Ionicons name="chatbubble-ellipses-outline" size={48} color={colors.mutedForeground} />
        <Text style={[styles.notFoundTitle, { color: colors.foreground }]}>Sohbet bulunamadı</Text>
        <Text style={[styles.notFoundText, { color: colors.mutedForeground }]}>
          Konuşma kaldırılmış veya bağlantı artık geçerli olmayabilir.
        </Text>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/messages' as any)} style={[styles.notFoundButton, { backgroundColor: colors.primary }]}>
          <Text style={[styles.notFoundButtonText, { color: colors.primaryForeground }]}>Mesajlara Dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleSend = () => {
    if (!text.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sendMessage(id, user.id, text.trim());
    setText('');
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.senderId === user.id || item.senderId === 'current';
    return (
      <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem]}>
        {!isMe && (
          <UserAvatar
            name={conversation.participantName}
            color={conversation.participantAvatarColor}
            size={30}
          />
        )}
        <View style={[
          styles.bubble,
          isMe
            ? { backgroundColor: colors.primary, borderBottomRightRadius: 4 }
            : { backgroundColor: colors.card, borderBottomLeftRadius: 4 },
        ]}>
          <Text style={[styles.msgText, { color: isMe ? '#fff' : colors.foreground }]}>
            {item.content}
          </Text>
          <Text style={[styles.msgTime, { color: isMe ? 'rgba(255,255,255,0.6)' : colors.mutedForeground }]}>
            {new Date(item.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={item.likedBy?.includes(user.id) ? 'Mesaj beğenisini kaldır' : 'Mesajı beğen'}
            onPress={() => toggleMessageLike(id, item.id, user.id)}
            style={styles.messageLike}
          >
            <Ionicons
              name={item.likedBy?.includes(user.id) ? 'heart' : 'heart-outline'}
              size={14}
              color={item.likedBy?.includes(user.id) ? '#EC4899' : (isMe ? 'rgba(255,255,255,0.7)' : colors.mutedForeground)}
            />
            {!!item.likedBy?.length && (
              <Text style={[styles.messageLikeCount, { color: isMe ? '#fff' : colors.mutedForeground }]}>
                {item.likedBy.length}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header — sabit üstte */}
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <UserAvatar
          name={conversation.participantName}
          color={conversation.participantAvatarColor}
          size={38}
          showOnline={conversation.isOnline}
        />
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerName, { color: colors.foreground }]}>
            {conversation.participantName}
          </Text>
          <Text style={[styles.headerStatus, { color: conversation.isOnline ? '#22C55E' : colors.mutedForeground }]}>
            {conversation.isOnline ? 'Çevrimiçi' : 'Son görülme dün'}
          </Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Sohbet seçenekleri"
          onPress={() => Alert.alert('Sohbet Seçenekleri', 'Bu konuşma için ek seçenekler yakında kullanıma açılacak.')}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {/* Mesaj listesi + input kutusu */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <FlatList
          data={[...messages].reverse()}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          inverted
          contentContainerStyle={styles.messageList}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        />

        {/* Input bar — her zaman altta görünür */}
        <View style={[
          styles.inputBar,
          {
            borderTopColor: colors.border,
            backgroundColor: colors.background,
            paddingBottom: isKeyboardVisible
              ? Math.max(bottomPad, 10)
              : Math.max(bottomPad + restingComposerLift, 56),
          },
        ]}>
          <TouchableOpacity
            style={styles.attachBtn}
            accessibilityRole="button"
            accessibilityLabel="Fotoğraf ekle"
            onPress={() => Alert.alert('Fotoğraf Ekleme', 'Mesajlara fotoğraf ekleme özelliği hazırlanıyor.')}
          >
            <Ionicons name="image-outline" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.attachBtn}
            accessibilityRole="button"
            accessibilityLabel="Dosya ekle"
            onPress={() => Alert.alert('Dosya Ekleme', 'Mesajlara dosya ekleme özelliği hazırlanıyor.')}
          >
            <Ionicons name="attach-outline" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
          <View style={[
            styles.inputWrap,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}>
            <TextInput
              style={[styles.input, { color: colors.foreground, fontFamily: 'Poppins_400Regular' }]}
              placeholder="Mesaj yaz..."
              placeholderTextColor={colors.mutedForeground}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={1000}
              returnKeyType="default"
              blurOnSubmit={false}
            />
          </View>
          <TouchableOpacity
            onPress={handleSend}
            disabled={!text.trim()}
            style={[styles.sendBtn, { opacity: text.trim() ? 1 : 0.4 }]}
          >
            <LinearGradient
              colors={['#9B59F5', '#EC4899']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sendBtnGrad}
            >
              <Ionicons name="send" size={16} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  notFound: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10 },
  notFoundTitle: { fontFamily: 'Poppins_700Bold', fontSize: 20 },
  notFoundText: { fontFamily: 'Poppins_400Regular', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  notFoundButton: { marginTop: 8, borderRadius: 18, paddingHorizontal: 20, paddingVertical: 10 },
  notFoundButtonText: { fontFamily: 'Poppins_600SemiBold', fontSize: 14 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  headerName: { fontFamily: 'Poppins_600SemiBold', fontSize: 15 },
  headerStatus: { fontFamily: 'Poppins_400Regular', fontSize: 12 },
  messageList: { padding: 16, gap: 4 },
  msgRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginBottom: 6 },
  msgRowMe: { justifyContent: 'flex-end' },
  msgRowThem: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '72%', borderRadius: 18,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  msgText: { fontFamily: 'Poppins_400Regular', fontSize: 14, lineHeight: 20 },
  msgTime: { fontFamily: 'Poppins_400Regular', fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  messageLike: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: 3, marginTop: 4, paddingVertical: 2 },
  messageLikeCount: { fontFamily: 'Poppins_500Medium', fontSize: 10 },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1,
  },
  attachBtn: { padding: 4, paddingBottom: 8 },
  inputWrap: {
    flex: 1, borderWidth: 1, borderRadius: 24,
    paddingHorizontal: 14, paddingVertical: 8,
    minHeight: 42, justifyContent: 'center',
  },
  input: { fontSize: 14, maxHeight: 120 },
  sendBtn: { width: 42, height: 42, marginBottom: 2 },
  sendBtnGrad: { flex: 1, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});
