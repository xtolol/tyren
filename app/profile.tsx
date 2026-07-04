import Crest from '@/app/components/sigil/Crest';
import DustIcon from '@/assets/images/dust-16px.svg';
import ShardIcon from '@/assets/images/shard-16px.svg';
import { SEAL_LABELS } from '@/src/core/relics';
import { useCurrentLevelAccent } from '@/src/hooks/useLevelAccent';
import { useAuthStore } from '@/src/stores/useAuthStore';
import { useMapStore } from '@/src/stores/useMapStore';
import { usePlayerStore } from '@/src/stores/usePlayerStore';
import { equippedRelics, useRelicStore } from '@/src/stores/useRelicStore';
import { fonts, levelAccent, palette } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
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
    totalFocusTimeMs,
    totalItemsBought,
    totalBossesDefeated,
    currentStreak,
    longestStreak,
    streakFreezes,
    weeklyRecap,
  } = usePlayerStore();

  const locations = useMapStore((s) => s.locations);
  const mapProgress = useMapStore((s) => s.progress);
  const relics = useRelicStore((s) => s.relics);
  const current = locations.find((l) => mapProgress[l.id]?.status === 'current');
  // Screen chrome follows the current level, like Home; the crest keeps
  // the equipped relic's home-level identity.
  const theme = useCurrentLevelAccent();

  // The profile crest wears the primary equipped relic in its home level's
  // colors; before the first relic it shows the current location's crest.
  const primary = equippedRelics(relics)[0] ?? null;
  const primaryLocation = primary ? locations.find((l) => l.id === primary[0]) : null;
  const crestIndex = primaryLocation?.sort_order ?? current?.sort_order ?? 0;
  const crestAccent = levelAccent(crestIndex);
  const relicCount = Object.keys(relics).length;

  const username = (user?.user_metadata?.username as string | undefined) ?? user?.email ?? 'Seeker';

  const handleSignOut = async () => {
    await signOut();
    router.replace('/auth' as never);
  };

  const handleShare = async () => {
    const message = [
      'My Tyren Profile',
      '',
      `Level: ${level}`,
      `Focus streak: ${currentStreak} day${currentStreak === 1 ? '' : 's'}`,
      `Time focused: ${formatFocusTime(totalFocusTimeMs)}`,
      `Relics claimed: ${relicCount}`,
      `Dust earned: ${formatCurrency(dust)}`,
      `Shards collected: ${formatCurrency(shards)}`,
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
            <Ionicons name="chevron-back" size={28} color={palette.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.accent }]}>TYREN</Text>
          <View style={{ width: 28 }} />
        </View>

        <Text style={styles.resultsTitle}>Your Results</Text>

        {/* Seeker card: the equipped relic crest as the avatar */}
        <View style={[styles.characterCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Crest
            size={140}
            color={crestAccent.accent}
            dimColor={crestAccent.faint}
            glyphIndex={crestIndex}
          />
          <Text style={styles.characterName}>{username}</Text>
          <Text style={[styles.characterLevel, { color: theme.dim }]}>
            {primary && primaryLocation
              ? `${primaryLocation.relic_name.toUpperCase()} · ${SEAL_LABELS[primary[1].seal].toUpperCase()}`
              : current
                ? `LVL ${current.sort_order + 1} · ${current.name.toUpperCase()}`
                : 'THE REALM LIES QUIET'}
          </Text>
          <TouchableOpacity onPress={() => router.push('/codex' as never)} hitSlop={8}>
            <Text style={styles.codexLink}>
              {relicCount} relic{relicCount === 1 ? '' : 's'} claimed · open the Codex →
            </Text>
          </TouchableOpacity>
        </View>

        {/* Share + Sign Out */}
        <TouchableOpacity
          style={[styles.shareButton, { borderColor: theme.border }]}
          onPress={handleShare}
        >
          <Text style={styles.shareButtonText}>Share profile</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>

        {/* This Week recap */}
        {weeklyRecap && weeklyRecap.sessions > 0 && (
          <View style={[styles.recapCard, { backgroundColor: theme.card, borderColor: theme.faint }]}>
            <Text style={[styles.recapTitle, { color: theme.dim }]}>THIS WEEK</Text>
            <Text style={styles.recapHeadline}>
              You reclaimed {formatFocusTime(weeklyRecap.focus_ms)}
            </Text>
            <View style={styles.recapRow}>
              <View style={styles.recapStat}>
                <Text style={styles.recapValue}>{weeklyRecap.sessions}</Text>
                <Text style={styles.recapStatLabel}>sessions</Text>
              </View>
              <View style={styles.recapStat}>
                <Text style={styles.recapValue}>{weeklyRecap.damage}</Text>
                <Text style={styles.recapStatLabel}>damage dealt</Text>
              </View>
              <View style={styles.recapStat}>
                <Text style={[styles.recapValue, styles.dustColor]}>
                  {formatCurrency(weeklyRecap.dust)}
                </Text>
                <Text style={styles.recapStatLabel}>dust</Text>
              </View>
            </View>
          </View>
        )}

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
            <Text style={styles.statLabel}>Streak freezes</Text>
            <Text style={styles.statValue}>
              {streakFreezes} banked
            </Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Time spent focused</Text>
            <Text style={styles.statValue}>{formatFocusTime(totalFocusTimeMs)}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Relics claimed</Text>
            <Text style={styles.statValue}>{relicCount}</Text>
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
    backgroundColor: palette.bg,
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
    fontSize: 18,
    fontFamily: fonts.pixelBold,
    letterSpacing: 4,
  },
  resultsTitle: {
    fontSize: 32,
    fontFamily: fonts.serif,
    color: palette.text,
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
  characterCard: {
    borderWidth: 1,
    borderRadius: 20,
    marginHorizontal: 16,
    padding: 24,
    alignItems: 'center',
    gap: 6,
  },
  characterName: {
    fontSize: 26,
    fontFamily: fonts.serif,
    color: palette.text,
    marginTop: 8,
  },
  characterLevel: {
    fontSize: 8,
    fontFamily: fonts.pixel,
    letterSpacing: 2,
    textAlign: 'center',
  },
  codexLink: {
    fontSize: 12,
    fontFamily: fonts.ui,
    color: palette.textDim,
    marginTop: 6,
  },
  shareButton: {
    backgroundColor: palette.bgRaised,
    borderWidth: 1,
    borderRadius: 100,
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  shareButtonText: {
    fontSize: 16,
    fontFamily: fonts.ui,
    color: palette.text,
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
    fontFamily: fonts.ui,
    color: palette.textFaint,
  },
  recapCard: {
    borderWidth: 1,
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 24,
    padding: 20,
  },
  recapTitle: {
    fontSize: 8,
    fontFamily: fonts.pixel,
    letterSpacing: 2,
    marginBottom: 6,
  },
  recapHeadline: {
    fontSize: 24,
    fontFamily: fonts.serif,
    color: palette.text,
    marginBottom: 16,
  },
  recapRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  recapStat: {
    alignItems: 'center',
    flex: 1,
  },
  recapValue: {
    fontSize: 18,
    fontFamily: fonts.pixelBold,
    color: palette.text,
  },
  recapStatLabel: {
    fontSize: 11,
    fontFamily: fonts.ui,
    color: palette.textFaint,
    marginTop: 4,
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
    fontFamily: fonts.ui,
    color: palette.textDim,
  },
  statValue: {
    fontSize: 14,
    fontFamily: fonts.ui,
    color: palette.text,
  },
  dustColor: {
    color: palette.dust,
  },
  shardColor: {
    color: palette.shards,
  },
});
