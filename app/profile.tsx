import DustIcon from '@/assets/images/dust-16px.svg';
import ShardIcon from '@/assets/images/shard-16px.svg';
import { usePlayerStore } from '@/src/stores/usePlayerStore';
import { useAuthStore } from '@/src/stores/useAuthStore';
import { Ionicons } from '@expo/vector-icons';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import React, { useEffect } from 'react';
import {
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

function formatFocusTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return parts.join(' ');
}

function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toString();
}

export default function ProfileScreen() {
  const router = useRouter();
  const { signOut, user } = useAuthStore();
  const {
    dust,
    shards,
    level,
    progressPercent,
    totalFocusTimeMs,
    totalItemsBought,
    totalBossesDefeated,
    currentStreak,
    longestStreak,
  } = usePlayerStore();

  const username = (user?.user_metadata?.username as string | undefined) ?? user?.email ?? 'Player';

  const handleSignOut = async () => {
    await signOut();
    router.replace('/auth' as never);
  };

  const player = useVideoPlayer(
    require('@/assets/images/videos/1.mp4'),
    (player) => {
      player.loop = true;
      player.muted = true;
    },
  );

  useEffect(() => {
    player.play();
    return () => {
      try {
        if (player) {
          player.pause();
        }
      } catch {
        // Player may have already been cleaned up
      }
    };
  }, [player]);

  const handleShare = async () => {
    const message = [
      'My Tyren Profile',
      '',
      `Level: ${level}`,
      `Focus streak: ${currentStreak} day${currentStreak === 1 ? '' : 's'}`,
      `Time focused: ${formatFocusTime(totalFocusTimeMs)}`,
      `Dust earned: ${formatCurrency(dust)}`,
      `Shards collected: ${formatCurrency(shards)}`,
      `Items bought: ${totalItemsBought}`,
      `Bosses defeated: ${totalBossesDefeated}`,
    ].join('\n');

    try {
      await Share.share({ message });
    } catch {
      // Share cancelled or failed
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={28} color="white" />
          </TouchableOpacity>
          <MaskedView
            maskElement={<Text style={styles.headerTitle}>TYREN</Text>}
            style={styles.maskedView}
          >
            <LinearGradient
              colors={['#C7E3ED', '#39A5C9']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.gradient}
            >
              <Text style={[styles.headerTitle, { opacity: 0 }]}>TYREN</Text>
            </LinearGradient>
          </MaskedView>
          <View style={{ width: 28 }} />
        </View>

        {/* Your Results Title */}
        <Text style={styles.resultsTitle}>Your Results</Text>

        {/* Character Card */}
        <View style={styles.characterCard}>
          <View style={styles.videoContainer}>
            <VideoView
              style={styles.characterVideo}
              player={player}
              contentFit="cover"
              nativeControls={false}
            />
          </View>
          <Text style={styles.characterName}>Zalthar&apos;s Chains</Text>
          <Text style={styles.characterLevel}>LVL{level} - {progressPercent}%</Text>
          <Text style={styles.usernameText}>{username}</Text>
        </View>

        {/* Share + Sign Out */}
        <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
          <Text style={styles.shareButtonText}>Share profile</Text>
        </TouchableOpacity>

        {/* Sign Out */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>

        {/* Stats List */}
        <View style={styles.statsList}>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Focus streak</Text>
            <Text style={styles.statValue}>
              {currentStreak} day{currentStreak === 1 ? '' : 's'}
            </Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Longest streak</Text>
            <Text style={styles.statValue}>
              {longestStreak} day{longestStreak === 1 ? '' : 's'}
            </Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Time spent focused</Text>
            <Text style={styles.statValue}>{formatFocusTime(totalFocusTimeMs)}</Text>
          </View>
          <View style={styles.statRow}>
            <View style={styles.statLabelRow}>
              <DustIcon width={16} height={16} />
              <Text style={styles.statLabel}>Time dust earned</Text>
            </View>
            <Text style={[styles.statValue, styles.dustColor]}>{formatCurrency(dust)}</Text>
          </View>
          <View style={styles.statRow}>
            <View style={styles.statLabelRow}>
              <ShardIcon width={16} height={16} />
              <Text style={styles.statLabel}>Time shards collected</Text>
            </View>
            <Text style={[styles.statValue, styles.shardColor]}>{formatCurrency(shards)}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Items bought</Text>
            <Text style={styles.statValue}>{totalItemsBought}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Bosses defeated</Text>
            <Text style={styles.statValue}>{totalBossesDefeated}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  scrollContent: {
    paddingBottom: 48,
  },
  header: {
    paddingTop: 65,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'regular',
    fontFamily: 'OpenSans',
  },
  maskedView: {
    height: 40,
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
  },
  resultsTitle: {
    fontSize: 32,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'white',
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
  characterCard: {
    backgroundColor: '#0A1A1F',
    borderRadius: 16,
    marginHorizontal: 16,
    padding: 16,
    alignItems: 'center',
  },
  videoContainer: {
    width: 180,
    height: 240,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  characterVideo: {
    width: '100%',
    height: '100%',
  },
  characterName: {
    fontSize: 24,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'white',
    marginBottom: 4,
  },
  characterLevel: {
    fontSize: 14,
    fontFamily: 'OpenSans',
    color: 'white',
    opacity: 0.7,
  },
  usernameText: {
    fontSize: 12,
    fontFamily: 'OpenSans',
    color: 'rgba(255,255,255,0.45)',
    marginTop: 2,
  },
  shareButton: {
    backgroundColor: '#1A1A1A',
    borderRadius: 100,
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  shareButtonText: {
    fontSize: 16,
    fontFamily: 'OpenSans',
    color: 'white',
  },
  signOutButton: {
    borderRadius: 100,
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  signOutText: {
    fontSize: 16,
    fontFamily: 'OpenSans',
    color: 'rgba(255,255,255,0.4)',
  },
  statsList: {
    marginTop: 24,
    marginHorizontal: 16,
    gap: 20,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statLabel: {
    fontSize: 14,
    fontFamily: 'OpenSans',
    color: 'white',
    opacity: 0.7,
  },
  statValue: {
    fontSize: 14,
    fontFamily: 'OpenSans',
    color: 'white',
  },
  dustColor: {
    color: '#FBC647',
  },
  shardColor: {
    color: '#C34DB0',
  },
});
