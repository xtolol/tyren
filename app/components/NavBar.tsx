import DustIcon from '@/assets/images/dust-16px.svg';
import ShardIcon from '@/assets/images/shard-16px.svg';
import { usePlayerStore } from '@/src/stores/usePlayerStore';
import { fonts, palette } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toString();
}

// The pixel top bar (design 1B): map · dust · TYREN · shards · stats.
// The ember variant recolors the wordmark during a boss fight.
export default function NavBar({ variant = 'gold' }: { variant?: 'gold' | 'ember' }) {
  const { dust, shards } = usePlayerStore();
  const router = useRouter();
  const accent = variant === 'ember' ? palette.ember : palette.gold;

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.push('/map' as never)} hitSlop={8}>
        <Ionicons name="map-outline" size={22} color={palette.textDim} />
      </TouchableOpacity>
      <View style={styles.currency}>
        <DustIcon width={16} height={16} />
        <Text style={styles.dust}>{formatCurrency(dust)}</Text>
      </View>
      <Text style={[styles.title, { color: accent }]}>TYREN</Text>
      <View style={styles.currency}>
        <ShardIcon width={16} height={16} />
        <Text style={styles.shard}>{formatCurrency(shards)}</Text>
      </View>
      <TouchableOpacity onPress={() => router.push('/profile')} hitSlop={8}>
        <Ionicons name="stats-chart-outline" size={20} color={palette.textDim} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 65,
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 20,
    fontFamily: fonts.pixelBold,
    letterSpacing: 4,
  },
  currency: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  dust: {
    fontSize: 10,
    color: palette.dust,
    fontFamily: fonts.pixel,
  },
  shard: {
    fontSize: 10,
    color: palette.shards,
    fontFamily: fonts.pixel,
  },
});
