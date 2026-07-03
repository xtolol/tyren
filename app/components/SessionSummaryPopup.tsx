import DustIcon from "@/assets/images/dust-16px.svg";
import ShardIcon from "@/assets/images/shard-16px.svg";
import type { SessionRewards } from "@/src/core/rewards/types";
import { SEAL_LABELS } from "@/src/core/relics";
import type { MapResult, RelicResult } from "@/src/lib/api";
import { fonts, palette, sealColors } from "@/src/theme";
import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface SessionSummaryPopupProps {
  visible: boolean;
  elapsedMs: number;
  rewards: SessionRewards;
  onContinue: () => void;
  variant?: 'complete' | 'forfeited';
  map?: MapResult | null;
  relics?: RelicResult[];
  freezesEarned?: number;
  freezesConsumed?: number;
}

function formatSessionTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export default function SessionSummaryPopup({
  visible,
  elapsedMs,
  rewards,
  onContinue,
  variant = 'complete',
  map,
  relics = [],
  freezesEarned = 0,
  freezesConsumed = 0,
}: SessionSummaryPopupProps) {
  const forfeited = variant === 'forfeited';
  const gained = !forfeited && map != null && map.stage === 'gate' && map.fragments_gained > 0;
  const struck = !forfeited && map != null && map.stage === 'boss' && map.damage_dealt > 0;
  const rankUps = forfeited ? [] : relics.filter((r) => r.ranked_up);

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onContinue}
    >
      <View style={styles.overlay}>
        <View style={[styles.card, forfeited && styles.cardForfeited]}>
          <Text style={styles.title}>
            {forfeited ? 'SESSION BROKEN' : 'SESSION COMPLETE'}
          </Text>
          <Text style={styles.time}>{formatSessionTime(elapsedMs)}</Text>

          <View style={styles.divider} />

          {forfeited ? (
            <Text style={styles.forfeitMessage}>
              You left Tyren for too long and Zalthar reclaimed this
              session. Your streak is safe — but the time earned nothing.
            </Text>
          ) : (
            <View style={styles.rewards}>
              <View style={styles.rewardRow}>
                <DustIcon width={16} height={16} />
                <Text style={styles.rewardLabel}>Time Dust</Text>
                <Text style={[styles.rewardValue, styles.dustColor]}>
                  +{rewards.dust}
                </Text>
              </View>
              <View style={styles.rewardRow}>
                <ShardIcon width={16} height={16} />
                <Text style={styles.rewardLabel}>Time Shards</Text>
                <Text style={[styles.rewardValue, styles.shardColor]}>
                  +{rewards.shards}
                </Text>
              </View>
              <View style={styles.rewardRow}>
                <Text style={styles.rewardLabel}>XP</Text>
                <Text style={styles.rewardValue}>+{rewards.xp}</Text>
              </View>
            </View>
          )}

          {gained && map && (
            <View style={styles.bossSection}>
              <Text style={styles.bossStrike}>
                You collected {map.fragments_gained}{' '}
                {map.fragment_name}
                {map.fragments_gained === 1 ? '' : 's'}
              </Text>
              <Text style={styles.bossDetail}>
                {map.gate_ready
                  ? `The gate is ready — ${map.gate_label} on the map`
                  : `${map.fragments_collected} / ${map.fragments_required} collected`}
              </Text>
            </View>
          )}

          {struck && map && (
            <View style={styles.bossSection}>
              {map.defeated ? (
                <>
                  <Text style={styles.bossDefeated}>
                    {map.boss_name} has fallen!
                  </Text>
                  <Text style={styles.bossDetail}>
                    +{map.rewards.dust} dust, +{map.rewards.shards} shards,{' '}
                    +{map.rewards.xp} XP claimed from the victory
                  </Text>
                  {map.relic_earned ? (
                    <Text style={styles.relicNote}>
                      It leaves behind {map.relic_earned.relic_name}.
                    </Text>
                  ) : null}
                  {map.advanced_to ? (
                    <Text style={styles.bossDetail}>The path opens onward.</Text>
                  ) : null}
                </>
              ) : (
                <>
                  <Text style={styles.bossStrike}>
                    You struck {map.boss_name} for {map.damage_dealt} damage
                  </Text>
                  <Text style={styles.bossDetail}>
                    {map.hp_remaining} HP remaining
                    {map.perk_multiplier > 1
                      ? ` · perks ${map.perk_multiplier.toFixed(2)}×`
                      : ''}
                  </Text>
                </>
              )}
            </View>
          )}

          {rankUps.length > 0 && (
            <View style={styles.bossSection}>
              {rankUps.map((relic) => (
                <Text key={relic.location_id} style={[styles.relicNote, { color: sealColors[relic.seal] }]}>
                  {relic.relic_name} rose to the {SEAL_LABELS[relic.seal]}
                </Text>
              ))}
            </View>
          )}

          {!forfeited && freezesConsumed > 0 && (
            <Text style={styles.freezeNote}>
              ❄️ A streak freeze covered {freezesConsumed === 1 ? 'a missed day' : `${freezesConsumed} missed days`} — your streak held.
            </Text>
          )}
          {!forfeited && freezesEarned > 0 && (
            <Text style={styles.freezeNote}>
              ❄️ You banked a streak freeze. It&apos;ll save your streak on a day you miss.
            </Text>
          )}

          <TouchableOpacity
            style={styles.button}
            onPress={onContinue}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>
              {forfeited ? 'Continue' : 'Collect'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(5,3,1,0.8)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
  },
  cardForfeited: {
    borderColor: palette.emberBorder,
    backgroundColor: palette.emberCard,
  },
  title: {
    fontSize: 10,
    fontFamily: fonts.pixel,
    color: palette.textFaint,
    letterSpacing: 3,
    marginBottom: 8,
  },
  time: {
    fontSize: 48,
    fontFamily: fonts.serif,
    color: palette.text,
    marginBottom: 24,
  },
  divider: {
    width: "100%",
    height: 1,
    backgroundColor: palette.hairline,
    marginBottom: 24,
  },
  rewards: {
    width: "100%",
    gap: 16,
    marginBottom: 28,
  },
  forfeitMessage: {
    fontSize: 14,
    fontFamily: fonts.ui,
    color: palette.textDim,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
  },
  rewardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rewardLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: fonts.ui,
    color: palette.textDim,
  },
  rewardValue: {
    fontSize: 14,
    fontFamily: fonts.pixel,
    color: palette.text,
  },
  bossSection: {
    width: "100%",
    alignItems: "center",
    gap: 4,
    marginTop: -8,
    marginBottom: 28,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
  },
  bossStrike: {
    fontSize: 16,
    fontFamily: fonts.serif,
    color: palette.goldBright,
    textAlign: "center",
  },
  bossDefeated: {
    fontSize: 18,
    fontFamily: fonts.serif,
    color: palette.goldBright,
    textAlign: "center",
  },
  bossDetail: {
    fontSize: 12,
    fontFamily: fonts.ui,
    color: palette.textDim,
    textAlign: "center",
  },
  relicNote: {
    fontSize: 14,
    fontFamily: fonts.serif,
    color: palette.gold,
    textAlign: "center",
  },
  freezeNote: {
    fontSize: 13,
    fontFamily: fonts.ui,
    color: palette.goldDim,
    textAlign: "center",
    lineHeight: 19,
    marginTop: -12,
    marginBottom: 24,
  },
  dustColor: {
    color: palette.dust,
  },
  shardColor: {
    color: palette.shards,
  },
  button: {
    backgroundColor: palette.bgRaised,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    borderRadius: 32,
    paddingVertical: 14,
    width: "100%",
    alignItems: "center",
  },
  buttonText: {
    color: palette.text,
    fontSize: 16,
    fontFamily: fonts.ui,
  },
});
