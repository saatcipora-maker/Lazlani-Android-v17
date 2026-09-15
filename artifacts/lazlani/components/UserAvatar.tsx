import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

interface Props {
  name: string;
  color: string;
  size?: number;
  imageUri?: string;
  showOnline?: boolean;
  vipFrameColor?: string;
}

export default function UserAvatar({ name, color, size = 40, imageUri, showOnline, vipFrameColor }: Props) {
  const initials = name
    .split(' ')
    .map(w => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');

  const fontSize  = size * 0.38;
  const radius    = size * 0.28;
  const dotSize   = Math.max(8, size * 0.22);
  const framePad  = vipFrameColor ? 2 : 0;
  const outerSize = size + framePad * 2;

  const innerAvatar = imageUri ? (
    <Image
      source={{ uri: imageUri }}
      style={{ width: size, height: size, borderRadius: radius }}
    />
  ) : (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: radius, backgroundColor: color }]}>
      <Text style={[styles.initials, { fontSize }]}>{initials}</Text>
    </View>
  );

  // VIP çerçevesi
  const avatar = vipFrameColor ? (
    <View
      style={{
        width: outerSize,
        height: outerSize,
        borderRadius: radius + framePad,
        borderWidth: 2,
        borderColor: vipFrameColor,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {innerAvatar}
    </View>
  ) : innerAvatar;

  if (showOnline !== undefined) {
    return (
      <View style={{ width: outerSize, height: outerSize }}>
        {avatar}
        <View
          style={[
            styles.onlineDot,
            {
              width: dotSize, height: dotSize, borderRadius: dotSize / 2,
              backgroundColor: showOnline ? '#22C55E' : '#6B7280',
              bottom: 0, right: 0,
            },
          ]}
        />
      </View>
    );
  }

  return avatar;
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  initials: { color: '#fff', fontFamily: 'Poppins_700Bold', lineHeight: undefined },
  onlineDot: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#0D0B24',
  },
});
