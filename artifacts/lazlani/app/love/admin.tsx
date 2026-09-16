import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useListLoveReports, useReviewLoveReport } from '@workspace/api-client-react';
import LoveHeader from '@/components/LoveHeader';
import { useAuth } from '@/context/AuthContext';

export default function LoveAdminScreen() {
  const router = useRouter();
  const { user } = useAuth();
  
  const { data, isLoading, refetch } = useListLoveReports();
  const reviewMutation = useReviewLoveReport();

  if (!user?.isAdmin && !user?.isSuperAdmin) {
    return (
      <View style={styles.container}>
        <LoveHeader title="Yönetim" />
        <View style={styles.center}><Text style={styles.errorText}>Yetkisiz erişim.</Text></View>
      </View>
    );
  }

  const handleReview = (id: string, status: 'resolved' | 'dismissed') => {
    reviewMutation.mutate({ id, data: { status } }, {
      onSuccess: () => refetch()
    });
  };

  const reports = data?.reports || [];

  return (
    <View style={styles.container}>
      <LoveHeader title="Raporlar & Yönetim" />
      
      {isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#D946EF" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {reports.length === 0 ? (
            <Text style={styles.emptyText}>Bekleyen rapor yok.</Text>
          ) : (
            reports.map((report: any) => (
              <View key={report.id} style={styles.card}>
                <Text style={styles.reason}>Neden: {report.reason}</Text>
                <Text style={styles.meta}>Durum: {report.status}</Text>
                {report.messageId && <Text style={styles.meta}>Mesaj ID: {report.messageId}</Text>}
                {report.reportedUserId && <Text style={styles.meta}>Şikayet Edilen: {report.reportedUserId}</Text>}
                
                {report.status === 'open' && (
                  <View style={styles.actions}>
                    <TouchableOpacity 
                      style={[styles.btn, { backgroundColor: '#22C55E' }]}
                      onPress={() => handleReview(report.id, 'resolved')}
                    >
                      <Text style={styles.btnText}>Haklı (İşlem Yapıldı)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.btn, { backgroundColor: '#6B7280' }]}
                      onPress={() => handleReview(report.id, 'dismissed')}
                    >
                      <Text style={styles.btnText}>Reddet</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))
          )}
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
  errorText: {
    fontFamily: 'Poppins_500Medium',
    color: '#BE185D',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    fontFamily: 'Poppins_400Regular',
    color: '#D946EF',
  },
  content: {
    padding: 16,
    gap: 16,
  },
  card: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(244,114,182,0.3)',
  },
  reason: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 14,
    color: '#9D174D',
    marginBottom: 8,
  },
  meta: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  btn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnText: {
    fontFamily: 'Poppins_500Medium',
    color: '#FFF',
    fontSize: 12,
  }
});
