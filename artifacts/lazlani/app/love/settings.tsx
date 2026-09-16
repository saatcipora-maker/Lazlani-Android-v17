import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useGetLoveSettings, useUpdateLoveSettings, useAuthLogout } from '@workspace/api-client-react';
import LoveHeader from '@/components/LoveHeader';
import { useAuth } from '@/context/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';

export default function LoveSettingsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { data, isLoading } = useGetLoveSettings();
  const updateMutation = useUpdateLoveSettings();

  const [settings, setSettings] = useState({
    notifications: true,
    sound: true,
    vibration: true,
  });

  useEffect(() => {
    if (data?.settings) {
      setSettings({
        notifications: (data.settings.notifications as boolean) ?? true,
        sound: (data.settings.sound as boolean) ?? true,
        vibration: (data.settings.vibration as boolean) ?? true,
      });
    }
  }, [data]);

  const toggleSetting = (key: keyof typeof settings) => {
    const newVal = !settings[key];
    setSettings(prev => ({ ...prev, [key]: newVal }));
    updateMutation.mutate({ data: { [key]: newVal } });
  };

  const rightAction = user?.isAdmin || user?.isSuperAdmin ? (
    <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/love/admin')}>
      <Ionicons name="shield-checkmark" size={22} color="#D946EF" />
    </TouchableOpacity>
  ) : undefined;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#FFF0F5', '#FCE7F3', '#FDF2F8']}
        style={StyleSheet.absoluteFill}
      />
      <LoveHeader title="Ayarlar" rightAction={rightAction} />
      
      {isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#D946EF" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sectionTitle}>Bildirimler</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowIcon}><Ionicons name="notifications" size={20} color="#F472B6" /></View>
              <Text style={styles.rowText}>Mesaj Bildirimleri</Text>
              <Switch 
                value={settings.notifications} 
                onValueChange={() => toggleSetting('notifications')} 
                trackColor={{ false: '#FBCFE8', true: '#F472B6' }}
              />
            </View>
            <View style={styles.divider} />
            <View style={styles.row}>
              <View style={styles.rowIcon}><Ionicons name="volume-medium" size={20} color="#F472B6" /></View>
              <Text style={styles.rowText}>Uygulama İçi Ses</Text>
              <Switch 
                value={settings.sound} 
                onValueChange={() => toggleSetting('sound')} 
                trackColor={{ false: '#FBCFE8', true: '#F472B6' }}
              />
            </View>
            <View style={styles.divider} />
            <View style={styles.row}>
              <View style={styles.rowIcon}><Ionicons name="phone-portrait" size={20} color="#F472B6" /></View>
              <Text style={styles.rowText}>Titreşim</Text>
              <Switch 
                value={settings.vibration} 
                onValueChange={() => toggleSetting('vibration')} 
                trackColor={{ false: '#FBCFE8', true: '#F472B6' }}
              />
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FDF2F8',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtn: {
    padding: 8,
  },
  content: {
    padding: 16,
  },
  sectionTitle: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 14,
    color: '#D946EF',
    marginLeft: 8,
    marginBottom: 8,
    marginTop: 16,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(244,114,182,0.2)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  rowIcon: {
    width: 32,
    alignItems: 'center',
  },
  rowText: {
    flex: 1,
    fontFamily: 'Poppins_500Medium',
    fontSize: 15,
    color: '#9D174D',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(244,114,182,0.1)',
    marginLeft: 48,
  },
});
