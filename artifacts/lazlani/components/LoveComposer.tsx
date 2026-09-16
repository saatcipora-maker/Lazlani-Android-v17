import React, { useState, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Image, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { fetch as expoFetch } from 'expo/fetch';
import { requestLoveMediaUpload, finalizeLoveMediaUpload, LoveMessage } from '@workspace/api-client-react';
import { getCurrentAuthToken } from '@/context/AuthContext';
import { apiUrl } from '@/services/apiOrigin';

interface Props {
  onSend: (text: string, mediaPath?: string, mediaType?: string) => Promise<void>;
  disabled?: boolean;
  editingMessage?: LoveMessage | null;
  onCancelEdit?: () => void;
}

export default function LoveComposer({ onSend, disabled, editingMessage, onCancelEdit }: Props) {
  const [text, setText] = useState('');
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const token = getCurrentAuthToken();

  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.body || '');
      setMediaUri(null); // Düzenlemede media ekleme/değiştirme backend desteklemiyor
    } else {
      setText('');
      setMediaUri(null);
    }
  }, [editingMessage]);

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });
    
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      setMediaUri(uri);
      // Let's guess type from extension
      if (uri.toLowerCase().endsWith('.gif')) {
        setMediaType('image/gif');
      } else if (uri.toLowerCase().endsWith('.png')) {
        setMediaType('image/png');
      } else {
        setMediaType('image/jpeg');
      }
    }
  };

  const uploadMedia = async (uri: string): Promise<{ objectPath: string, type: string }> => {
    const localResponse = await expoFetch(uri);
    if (!localResponse.ok) throw new Error('Fotoğraf okunamadı.');
    const blob = await localResponse.blob();
    const type = blob.type || 'image/jpeg';
    
    const req = await requestLoveMediaUpload({ size: blob.size, contentType: type });
    
    const uploadResponse = await expoFetch(req.uploadURL!, {
      method: 'PUT',
      headers: { 'Content-Type': type },
      body: blob,
    });
    
    if (!uploadResponse.ok) throw new Error('Fotoğraf yüklenemedi.');
    
    const finalized = await finalizeLoveMediaUpload({
      objectPath: req.objectPath,
      size: blob.size,
      contentType: type,
    });
    
    return { objectPath: finalized.objectPath, type: type };
  };

  const handlePressSend = async () => {
    if ((!text.trim() && !mediaUri) || isUploading || disabled) return;
    
    setIsUploading(true);
    try {
      let uploadedPath: string | undefined;
      let uploadedType: string | undefined;
      
      if (mediaUri && !editingMessage) {
        const res = await uploadMedia(mediaUri);
        uploadedPath = res.objectPath;
        uploadedType = res.type;
      }
      
      await onSend(text, uploadedPath, uploadedType);
      
      setText('');
      setMediaUri(null);
      setMediaType(null);
    } catch (e) {
      console.error(e);
      // Hata bildirimi gösterilebilir
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      {editingMessage && (
        <View style={styles.editHeader}>
          <Text style={styles.editHeaderText}>Mesajı Düzenle</Text>
          <TouchableOpacity onPress={onCancelEdit}>
            <Ionicons name="close" size={20} color="#9D174D" />
          </TouchableOpacity>
        </View>
      )}

      {mediaUri && !editingMessage && (
        <View style={styles.previewContainer}>
          <Image source={{ uri: mediaUri }} style={styles.previewImage} />
          <TouchableOpacity 
            style={styles.removePreviewBtn} 
            onPress={() => { setMediaUri(null); setMediaType(null); }}
          >
            <Ionicons name="close-circle" size={24} color="#EF4444" />
          </TouchableOpacity>
        </View>
      )}
      
      <View style={styles.inputRow}>
        <TouchableOpacity style={styles.iconBtn} onPress={handlePickImage} disabled={isUploading || disabled || !!editingMessage}>
          <Ionicons name="image-outline" size={24} color={!!editingMessage ? "#FBCFE8" : "#D946EF"} />
        </TouchableOpacity>
        
        <TextInput
          style={styles.input}
          placeholder="Aşkla yaz..."
          placeholderTextColor="#F472B6"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={4000}
          editable={!isUploading && !disabled}
        />
        
        <TouchableOpacity 
          style={[styles.sendBtn, (!text.trim() && !mediaUri) ? styles.sendBtnDisabled : null]} 
          onPress={handlePressSend}
          disabled={(!text.trim() && !mediaUri) || isUploading || disabled}
        >
          {isUploading ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Ionicons name="send" size={20} color="#FFF" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(217,70,239,0.1)',
  },
  editHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FCE7F3',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  editHeaderText: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 12,
    color: '#9D174D',
  },
  previewContainer: {
    marginBottom: 8,
    position: 'relative',
    width: 100,
  },
  previewImage: {
    width: 100,
    height: 100,
    borderRadius: 12,
  },
  removePreviewBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#FFF',
    borderRadius: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(244,114,182,0.3)',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  iconBtn: {
    padding: 8,
    paddingBottom: 10,
  },
  input: {
    flex: 1,
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
    color: '#9D174D',
    minHeight: 40,
    maxHeight: 120,
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 8,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#D946EF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    marginLeft: 4,
  },
  sendBtnDisabled: {
    backgroundColor: '#FBCFE8',
  }
});
