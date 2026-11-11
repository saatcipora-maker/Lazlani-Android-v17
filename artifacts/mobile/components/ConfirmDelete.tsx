import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Action } from '@/components/FavoriUI';
import { useColors } from '@/hooks/useColors';

export function ConfirmDelete({ onConfirm, busy = false, label = 'İçeriği sil', description = 'Bu işlem geri alınamaz. İçerik ve ona bağlı yorumlar silinir.' }: { onConfirm: () => void; busy?: boolean; label?: string; description?: string }) {
  const colors = useColors();
  const [confirming, setConfirming] = useState(false);
  return confirming ? <View style={{ gap: 10 }}>
    <Text style={{ color: colors.destructive, lineHeight: 22 }}>{description}</Text>
    <Action label={busy ? 'Siliniyor…' : 'Evet, kalıcı olarak sil'} disabled={busy} onPress={onConfirm} icon="trash-2" />
    <Action label="Vazgeç" quiet disabled={busy} onPress={() => setConfirming(false)} />
  </View> : <Action label={label} quiet disabled={busy} icon="trash-2" onPress={() => setConfirming(true)} />;
}
