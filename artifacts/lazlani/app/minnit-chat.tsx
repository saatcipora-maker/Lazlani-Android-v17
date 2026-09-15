import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, Platform, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

const CHAT_URL = 'https://organizations.minnit.chat/178740399438712/c/lazlani?embedmobile&app';

const FULL_SCREEN_CHAT_SCRIPT = `
  (function () {
    var styleId = 'lazlani-fullscreen-chat';
    var resizeTimer;

    function getViewportHeight() {
      var visualHeight = window.visualViewport && window.visualViewport.height;
      return Math.max(1, Math.round(visualHeight || window.innerHeight || document.documentElement.clientHeight));
    }

    function applyViewportHeight() {
      var viewportHeight = getViewportHeight();
      document.documentElement.style.setProperty('--lazlani-chat-height', viewportHeight + 'px');
      document.documentElement.style.height = viewportHeight + 'px';
      document.body.style.height = viewportHeight + 'px';

      var frame = document.getElementById('chat-iframe');
      if (frame) {
        frame.style.height = viewportHeight + 'px';
        frame.style.maxHeight = viewportHeight + 'px';
        frame.setAttribute('scrolling', 'no');
      }
    }

    function scheduleViewportUpdate() {
      applyViewportHeight();
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(applyViewportHeight, 80);
      setTimeout(applyViewportHeight, 240);
    }

    function installStyles() {
      if (!document.getElementById(styleId)) {
        var viewport = document.querySelector('meta[name="viewport"]');
        if (!viewport) {
          viewport = document.createElement('meta');
          viewport.name = 'viewport';
          document.head.appendChild(viewport);
        }
        viewport.content = 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover';

        var style = document.createElement('style');
        style.id = styleId;
        style.textContent =
          'html,body,#containerDiv,#chat-iframe-landing-zone{' +
          'margin:0!important;padding:0!important;width:100%!important;' +
          'height:var(--lazlani-chat-height,100%)!important;max-width:none!important;overflow:hidden!important;' +
          'background:#0D0B24!important;}' +
          '#minnit-navbar-nav,#minnit-navbar-placeholder,#minnit-footer,#org-footer,' +
          '.chatPageInfo{display:none!important;}' +
          '#chat-iframe{position:absolute!important;inset:0!important;width:100%!important;' +
          'height:var(--lazlani-chat-height,100%)!important;max-width:100%!important;border:0!important;' +
          'display:block!important;overflow:hidden!important;}';
        document.head.appendChild(style);
      }
      applyViewportHeight();
    }

    installStyles();
    new MutationObserver(installStyles).observe(document.documentElement, {
      childList: true,
      subtree: true
    });
    window.addEventListener('resize', scheduleViewportUpdate);
    window.addEventListener('orientationchange', scheduleViewportUpdate);
    document.addEventListener('focusin', scheduleViewportUpdate);
    document.addEventListener('focusout', scheduleViewportUpdate);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', scheduleViewportUpdate);
      window.visualViewport.addEventListener('scroll', scheduleViewportUpdate);
    }
  })();
  true;
`;

/* Web uses <iframe>, native uses WebView */
let WebView: any = null;
if (Platform.OS !== 'web') {
  try {
    WebView = require('react-native-webview').WebView;
  } catch (_) {}
}

export default function MinnitChatScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const topPad  = Platform.OS === 'web' ? 67 : insets.top;

  const [loading,  setLoading]  = useState(true);
  const [offline,  setOffline]  = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const webRef = useRef<any>(null);

   const handleRetry = useCallback(() => {
    setOffline(false);
    setLoading(true);
    setRetryKey(k => k + 1);
   }, []);

   const handleReload = useCallback(() => {
     setOffline(false);
     setLoading(true);
     if (Platform.OS === 'web') {
       setRetryKey(k => k + 1);
       return;
     }
     webRef.current?.reload?.();
   }, []);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <LinearGradient
        colors={['#3D3468', colors.background]}
        style={[
          styles.header,
          Platform.OS === 'web'
            ? styles.webHeader
            : { paddingTop: topPad + 8 },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#E0D8FF" />
        </TouchableOpacity>

        <View style={styles.titleRow}>
          <View style={[styles.liveDot, { backgroundColor: offline ? '#EF4444' : '#22C55E' }]} />
          <Text style={styles.titleTxt}>LAZLANI Sohbet</Text>
        </View>

        <TouchableOpacity
           onPress={handleReload}
          style={styles.reloadBtn}
           accessibilityRole="button"
           accessibilityLabel="Sohbeti yenile"
        >
          <Ionicons name="refresh-outline" size={20} color="#C8B8FF" />
        </TouchableOpacity>
      </LinearGradient>

      {/* ── Content ── */}
       <KeyboardAvoidingView
         style={styles.chatContainer}
         behavior="padding"
         keyboardVerticalOffset={0}
         enabled={Platform.OS === 'ios'}
       >

        {/* Loading overlay */}
        {loading && !offline && (
          <View style={[styles.overlay, { backgroundColor: colors.background }]}>
            <LinearGradient
              colors={['#9B59F5', '#EC4899']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.loaderIcon}
            >
              <Ionicons name="chatbubbles" size={30} color="#fff" />
            </LinearGradient>
            <ActivityIndicator size="large" color="#9B59F5" style={{ marginTop: 20 }} />
            <Text style={[styles.loadingTxt, { color: colors.mutedForeground }]}>
              Sohbet yükleniyor…
            </Text>
          </View>
        )}

        {/* Offline state */}
        {offline && (
          <View style={[styles.overlay, { backgroundColor: colors.background }]}>
            <View style={[styles.offlineIcon, { backgroundColor: '#3D3468' }]}>
              <Ionicons name="wifi-outline" size={38} color="#EF4444" />
            </View>
            <Text style={[styles.offlineTitle, { color: colors.foreground }]}>
              Bağlantı Yok
            </Text>
            <Text style={[styles.offlineSub, { color: colors.mutedForeground }]}>
              İnternet bağlantını kontrol et ve tekrar dene.
            </Text>
            <TouchableOpacity onPress={handleRetry} style={styles.retryBtnWrap}>
              <LinearGradient
                colors={['#9B59F5', '#EC4899']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.retryBtn}
              >
                <Ionicons name="refresh" size={16} color="#fff" />
                <Text style={styles.retryTxt}>Tekrar Dene</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {/* WebView — native */}
        {Platform.OS !== 'web' && WebView && (
          <WebView
            key={retryKey}
            ref={webRef}
            source={{ uri: CHAT_URL }}
             style={[styles.webView, { backgroundColor: colors.background }]}
             containerStyle={styles.webView}
            onLoadStart={() => { setLoading(true); setOffline(false); }}
            onLoadEnd={() => setLoading(false)}
            onError={() => { setLoading(false); setOffline(true); }}
            onHttpError={() => { setLoading(false); setOffline(true); }}
             injectedJavaScriptBeforeContentLoaded={FULL_SCREEN_CHAT_SCRIPT}
             injectedJavaScript={FULL_SCREEN_CHAT_SCRIPT}
            javaScriptEnabled
            domStorageEnabled
             automaticallyAdjustContentInsets={false}
             contentInsetAdjustmentBehavior="never"
             overScrollMode="never"
             setSupportMultipleWindows={false}
             keyboardDisplayRequiresUserAction={false}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            mixedContentMode="compatibility"
            userAgent="Mozilla/5.0 (Linux; Android 11; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
          />
        )}

         {Platform.OS !== 'web' && !WebView && (
           <View style={[styles.overlay, { backgroundColor: colors.background }]}>
             <View style={[styles.offlineIcon, { backgroundColor: '#3D3468' }]}>
               <Ionicons name="alert-circle-outline" size={38} color="#EF4444" />
             </View>
             <Text style={[styles.offlineTitle, { color: colors.foreground }]}>
               Sohbet açılamadı
             </Text>
             <Text style={[styles.offlineSub, { color: colors.mutedForeground }]}>
               Sohbet bileşeni bu cihazda kullanılamıyor.
             </Text>
           </View>
         )}

        {/* Iframe — web */}
        {Platform.OS === 'web' && !offline && (
          <iframe
            key={retryKey}
            src={CHAT_URL}
            style={{
               position: 'absolute', inset: 0,
               width: '100%', height: '100%',
               minWidth: 0, maxWidth: '100%',
               border: 'none', display: 'block',
               overflow: 'hidden',
            } as any}
            allow="microphone; camera"
            onLoad={() => setLoading(false)}
            onError={() => { setLoading(false); setOffline(true); }}
            title="LAZLANI Sohbet"
          />
        )}
       </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
   root: { flex: 1, overflow: 'hidden' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 0,
  },
  webHeader: { paddingTop: 75, textAlign: 'justify' } as any,
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(155,89,245,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  titleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  titleTxt: {
    color: '#E0D8FF', fontFamily: 'Poppins_700Bold', fontSize: 17,
  },
  reloadBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(155,89,245,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
   chatContainer: {
     flex: 1,
     minWidth: 0,
     overflow: 'hidden',
     position: 'relative',
   },
   webView: {
     flex: 1,
     width: '100%',
     minWidth: 0,
   },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 10, gap: 12,
  },
  loaderIcon: {
    width: 72, height: 72, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  loadingTxt: {
    fontFamily: 'Poppins_500Medium', fontSize: 15, marginTop: 4,
  },
  offlineIcon: {
    width: 80, height: 80, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  offlineTitle: { fontFamily: 'Poppins_700Bold', fontSize: 20 },
  offlineSub: {
    fontFamily: 'Poppins_400Regular', fontSize: 14,
    textAlign: 'center', paddingHorizontal: 40, lineHeight: 22,
  },
  retryBtnWrap: { marginTop: 8, borderRadius: 24, overflow: 'hidden' },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 28, paddingVertical: 14,
  },
  retryTxt: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: 15 },
});
