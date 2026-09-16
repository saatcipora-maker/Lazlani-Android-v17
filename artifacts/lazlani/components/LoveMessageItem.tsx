import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActionSheetIOS, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import UserAvatar from '@/components/UserAvatar';
import { LoveMessage } from '@workspace/api-client-react';
import { getCurrentAuthToken } from '@/context/AuthContext';
import { apiUrl } from '@/services/apiOrigin';

interface Props {
  message: LoveMessage;
  isOwn: boolean;
  onEdit?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onReport?: (messageId: string) => void;
}

export default function LoveMessageItem({ message, isOwn, onEdit, onDelete, onReport }: Props) {
  const [showActions, setShowActions] = useState(false);
  const token = getCurrentAuthToken();

  const handleLongPress = () => {
    if (Platform.OS === 'ios') {
      const options = isOwn 
        ? ['İptal', 'Düzenle', 'Sil'] 
        : ['İptal', 'Şikayet Et'];
      const destructiveButtonIndex = isOwn ? 2 : 1;
      
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 0, destructiveButtonIndex },
        (buttonIndex) => {
          if (isOwn) {
            if (buttonIndex === 1 && onEdit) onEdit(message.id);
            if (buttonIndex === 2 && onDelete) onDelete(message.id);
          } else {
            if (buttonIndex === 1 && onReport) onReport(message.id);
          }
        }
      );
    } else {
      setShowActions(!showActions);
    }
  };

  const time = new Date(message.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const hasMedia = !!message.mediaObjectPath; // Gerçek api'de mediaObjectPath ya da payload.mediaObjectPath

  return (
    <View style={[styles.container, isOwn ? styles.ownContainer : styles.otherContainer]}>
      {!isOwn && (
        <View style={styles.avatarWrapper}>
          <UserAvatar name={(message.senderName as string) || 'K'} color={(message.senderAvatarColor as string) || '#F472B6'} size={32} />
        </View>
      )}
      
      <View style={styles.messageContent}>
        {!isOwn && <Text style={styles.senderName}>{(message.senderName as string) || 'Kullanıcı'}</Text>}
        
        <TouchableOpacity 
          onLongPress={handleLongPress} 
          activeOpacity={0.8}
          style={[styles.bubble, isOwn ? styles.ownBubble : styles.otherBubble]}
        >
          {hasMedia && typeof message.mediaObjectPath === 'string' && (
            <Image 
              source={{ 
                uri: apiUrl(`/api/love/media/${encodeURIComponent(message.mediaObjectPath)}`),
                headers: { Authorization: `Bearer ${token}` }
              }} 
              style={styles.media}
              resizeMode="cover"
            />
          )}
          
          {!!message.body && (
            <Text style={[styles.text, isOwn ? styles.ownText : styles.otherText]}>
              {message.body}
            </Text>
          )}

          <View style={styles.footer}>
            {message.version > 1 && <Text style={styles.editedText}>(düzenlendi)</Text>}
            <Text style={[styles.time, isOwn ? styles.ownTime : styles.otherTime]}>{time}</Text>
          </View>
        </TouchableOpacity>

        {showActions && (
          <View style={styles.androidActions}>
            {isOwn ? (
              <>
                <TouchableOpacity onPress={() => { setShowActions(false); onEdit?.(message.id); }} style={styles.actionBtn}>
                  <Text style={styles.actionText}>Düzenle</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setShowActions(false); onDelete?.(message.id); }} style={styles.actionBtn}>
                  <Text style={[styles.actionText, { color: '#EF4444' }]}>Sil</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity onPress={() => { setShowActions(false); onReport?.(message.id); }} style={styles.actionBtn}>
                <Text style={[styles.actionText, { color: '#EF4444' }]}>Şikayet Et</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginBottom: 8,
    alignItems: 'flex-end',
  },
  ownContainer: {
    justifyContent: 'flex-end',
  },
  otherContainer: {
    justifyContent: 'flex-start',
  },
  avatarWrapper: {
    marginRight: 8,
    marginBottom: 2,
  },
  messageContent: {
    maxWidth: '75%',
  },
  senderName: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 11,
    color: '#D946EF',
    marginLeft: 4,
    marginBottom: 4,
  },
  bubble: {
    padding: 12,
    borderRadius: 20,
  },
  ownBubble: {
    backgroundColor: '#F472B6', // Pink 400
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(244,114,182,0.15)',
  },
  text: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  ownText: {
    color: '#FFFFFF',
  },
  otherText: {
    color: '#4C1D95', // Pink 900
  },
  media: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 8,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 4,
  },
  time: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 10,
  },
  ownTime: {
    color: 'rgba(255,255,255,0.7)',
  },
  otherTime: {
    color: 'rgba(157,23,77,0.5)',
  },
  editedText: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
  },
  androidActions: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    padding: 8,
    borderRadius: 12,
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    gap: 12,
  },
  actionBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  actionText: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 12,
    color: '#D946EF',
  }
});
