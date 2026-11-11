import { Share, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as Clipboard from 'expo-clipboard';

export async function shareContent(path: string, title: string) {
  const url = Linking.createURL(path);
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && !navigator.share) {
    await Clipboard.setStringAsync(url);
    return 'Bağlantı kopyalandı.';
  }
  await Share.share({ title, message: `${title}\n${url}`, url });
  return '';
}
