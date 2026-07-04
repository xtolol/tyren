import { formatPerkBonus, perkMultiplier } from "@/src/core/relics";
import type { MapResult, RelicResult } from "@/src/lib/api";
import { useFocusTimer } from "@/src/hooks/useFocusTimer";
import { useFocusTimerStore } from "@/src/stores/useFocusTimerStore";
import { useMapStore } from "@/src/stores/useMapStore";
import { equippedRelics, useRelicStore } from "@/src/stores/useRelicStore";
import { fonts, levelAccent, palette } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import InventoryBottomSheet, {
  InventoryBottomSheetRef,
} from "./InventoryBottomSheet";
import NavBar from "./NavBar";
import RankUpModal, { RelicMoment } from "./RankUpModal";
import SessionSummaryPopup from "./SessionSummaryPopup";
import ShopBottomSheet, { ShopBottomSheetRef } from "./ShopBottomSheet";
import Crest from "./sigil/Crest";
import RelicCard from "./sigil/RelicCard";

// Mirrors complete_focus_session's fragment cadence (1 fragment / 30
// verified min) for the live provisional countdown; the server stays
// authoritative and corrects on the next sync.
const FRAGMENT_INTERVAL_MS = 1_800_000;

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
}

// Segmented location-path header shown during a boss fight (design row 2).
function PathSegments({ total, currentIndex }: { total: number; currentIndex: number }) {
  return (
    <View style={styles.segmentsRow}>
      <View style={[styles.segmentDiamond, { backgroundColor: palette.ember }]} />
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[styles.segment, i <= currentIndex && { backgroundColor: palette.ember }]}
        />
      ))}
      <Text style={styles.segmentLabel}>
        {currentIndex + 1}/{total}
      </Text>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [isShopOpen, setIsShopOpen] = useState(false);
  const inventorySheetRef = useRef<InventoryBottomSheetRef>(null);
  const shopSheetRef = useRef<ShopBottomSheetRef>(null);

  const { isRunning, loading, error: timerError, elapsedMs, stop, startFreeform } = useFocusTimer();
  const forfeitNotice = useFocusTimerStore((s) => s.forfeitNotice);
  const clearForfeitNotice = useFocusTimerStore((s) => s.clearForfeitNotice);

  // Where the player stands on the world map (server-mirrored)
  const locations = useMapStore((s) => s.locations);
  const mapProgress = useMapStore((s) => s.progress);
  const relics = useRelicStore((s) => s.relics);

  const current = locations.find((l) => mapProgress[l.id]?.status === "current");
  const entry = current ? mapProgress[current.id] : undefined;
  const bossStage = entry?.stage === "boss" && !!current?.boss;
  const ember = bossStage;

  // The level's identity color world; a boss fight overrides with the
  // universal ember variant.
  const level = levelAccent(current?.sort_order ?? 0);
  const accent = ember ? palette.ember : level.accent;
  const bright = ember ? palette.emberBright : level.bright;
  const faint = ember ? "rgba(255,106,77,0.2)" : level.faint;
  const border = ember ? palette.emberBorder : level.border;

  // ---- Live location progress (provisional while a session runs) ----
  const liveDamage = isRunning ? Math.floor(elapsedMs / 60_000) : 0;
  const maxHp = current?.boss?.maxHp ?? 0;
  const hp = bossStage ? Math.max(0, (entry?.bossHpRemaining ?? maxHp) - liveDamage) : 0;

  const required = current?.fragments_required ?? 1;
  const liveMs = (entry?.fragmentProgressMs ?? 0) + (isRunning ? elapsedMs : 0);
  const collected = Math.min(
    required,
    (entry?.fragmentsCollected ?? 0) + Math.floor(liveMs / FRAGMENT_INTERVAL_MS),
  );
  const gateReady = collected >= required;
  const nextFragmentIn = gateReady ? 0 : FRAGMENT_INTERVAL_MS - (liveMs % FRAGMENT_INTERVAL_MS);

  const progressPct = Math.round((collected / required) * 100);
  // Gate bar fills toward the broken gate; the HP bar drains toward the kill.
  const barPct = bossStage ? (maxHp > 0 ? (hp / maxHp) * 100 : 0) : progressPct;

  // ---- Equipped perks (seal journeys live on each relic's detail page) ----
  const equipped = equippedRelics(relics);
  const multiplier = perkMultiplier(equipped.map(([, r]) => r.seal));

  type SessionResult = {
    elapsedMs: number; dust: number; shards: number; xp: number;
    map: MapResult | null; relics: RelicResult[];
    freezesEarned: number; freezesConsumed: number;
  };
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(null);
  const [moments, setMoments] = useState<RelicMoment[]>([]);

  const handleToggle = async () => {
    if (isRunning) {
      const snapshotMs = elapsedMs;
      const result = await stop();
      if (result) {
        setSessionResult({
          elapsedMs: snapshotMs,
          ...result.rewards,
          map: result.map,
          relics: result.relics,
          freezesEarned: result.freezesEarned,
          freezesConsumed: result.freezesConsumed,
        });
      }
    } else {
      startFreeform();
    }
  };

  // After the summary is collected, play the relic moments one at a time:
  // a claimed relic first, then any seal rank-ups.
  const handleCollect = () => {
    const result = sessionResult;
    setSessionResult(null);
    if (!result) return;

    const queue: RelicMoment[] = [];
    const earned = result.map?.relic_earned;
    if (earned) {
      const loc = locations.find((l) => l.id === earned.location_id);
      queue.push({
        kind: "earned",
        relicName: earned.relic_name,
        perkName: earned.perk_name,
        seal: earned.seal,
        glyphIndex: loc?.sort_order ?? 0,
      });
    }
    for (const relic of result.relics) {
      if (!relic.ranked_up) continue;
      const loc = locations.find((l) => l.id === relic.location_id);
      queue.push({
        kind: "rankup",
        relicName: relic.relic_name,
        perkName: relic.perk_name,
        seal: relic.seal,
        glyphIndex: loc?.sort_order ?? 0,
      });
    }
    setMoments(queue);
  };

  return (
    <View style={[styles.container, ember && { backgroundColor: palette.emberDeep }]}>
      {/* A quiet radial glow behind the card */}
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="homeGlow" cx="50%" cy="42%" r="65%">
            <Stop offset="0%" stopColor={ember ? "#3A150A" : level.glow} />
            <Stop offset="100%" stopColor={ember ? palette.emberDeep : palette.bg} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#homeGlow)" />
      </Svg>

      <NavBar accent={accent} />
      {ember && current && (
        <PathSegments total={locations.length} currentIndex={current.sort_order} />
      )}

      <View style={styles.centerContainer}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push("/codex" as never)}
          style={styles.cardTouchable}
        >
          <RelicCard
            label={bossStage ? "BOSS" : current ? `LVL ${current.sort_order + 1}` : "TYREN"}
            accent={accent}
            borderColor={border}
          >
            <Crest
              size={190}
              color={accent}
              dimColor={faint}
              glyphIndex={current?.sort_order ?? 0}
              hostile={bossStage}
            />

            {/* The in-card progress strip (design 1B): PROGRESS/HP · value · bar */}
            <View style={styles.cardBar}>
              <View style={styles.cardBarLabels}>
                <Text style={styles.cardBarCaption}>{bossStage ? "HP" : "PROGRESS"}</Text>
                <Text style={[styles.cardBarValue, { color: bright }]}>
                  {bossStage ? hp : `${progressPct}%`}
                </Text>
              </View>
              <View style={styles.cardBarTrack}>
                <View
                  style={[
                    styles.cardBarFill,
                    { width: `${Math.min(100, Math.max(0, barPct))}%`, backgroundColor: accent },
                  ]}
                />
              </View>
            </View>
          </RelicCard>
        </TouchableOpacity>

        <Text style={styles.multiplier}>{multiplier.toFixed(1)}× progress multiplier</Text>

        <Text style={[styles.cardHint, gateReady && !bossStage && { color: bright }]}>
          {bossStage
            ? `${current?.boss?.bossName ?? "The boss"} · every focused minute strikes`
            : gateReady
              ? `${current?.gate_label ?? "Break the gate"} on the map →`
              : `${formatCountdown(nextFragmentIn)} until the next ${current?.fragment_name ?? "fragment"}`}
        </Text>

        {/* The relic strip: equipped perk chips (tap → loadout) */}
        {equipped.length > 0 ? (
          <View style={styles.relicStrip}>
            <View style={styles.perkRow}>
              {equipped.map(([locationId, relic]) => {
                const loc = locations.find((l) => l.id === locationId);
                const perkColor = levelAccent(loc?.sort_order ?? 0).accent;
                return (
                  <TouchableOpacity
                    key={locationId}
                    style={[styles.perkChip, { borderColor: perkColor }]}
                    onPress={() => router.push("/loadout" as never)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.perkDiamond, { backgroundColor: perkColor }]} />
                    <Text style={styles.perkChipName}>{loc?.perk_name ?? "Perk"}</Text>
                    <Text style={[styles.perkChipBonus, { color: perkColor }]}>
                      {formatPerkBonus(relic.seal)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.noRelicChip}
            onPress={() => router.push("/codex" as never)}
            activeOpacity={0.8}
          >
            <Text style={styles.noRelicText}>
              {current?.boss
                ? `Fell ${current.boss.bossName} to claim your first relic`
                : "Defeat a boss to claim your first relic"}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.bottomContainer}>
        <View style={styles.levelContainer}>
          <Text style={styles.levelTitle}>{current?.name ?? "The Realm Lies Quiet"}</Text>
          <Text style={styles.levelnumber}>
            {current ? `LVL ${current.sort_order + 1}` : "ALL PATHS CLEARED"}
          </Text>
        </View>
        <View style={styles.botbuttonsContainer}>
          <TouchableOpacity
            style={[styles.iconButton, { borderColor: border }]}
            onPress={() => setIsShopOpen(true)}
          >
            <Ionicons name="cart-outline" size={26} color={accent} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.textButton, loading && styles.textButtonDisabled]}
            onPress={handleToggle}
            activeOpacity={0.8}
            disabled={loading}
          >
            <View style={styles.gradientContainer}>
              <Svg width="100%" height="100%" viewBox="0 0 200 64" style={{ position: "absolute" }}>
                <Defs>
                  <RadialGradient
                    id="focusRadial"
                    cx="50%"
                    cy="5%"
                    r="50%"
                    fx="50%"
                    fy="0%"
                    gradientTransform="scale(1, 1.6)"
                  >
                    <Stop offset="0%" stopColor={ember ? "#7A2914" : level.buttonTop} />
                    <Stop offset="100%" stopColor={ember ? "#2A0D05" : level.buttonBottom} />
                  </RadialGradient>
                </Defs>
                <Rect x="0" y="0" width="200" height="64" rx="32" ry="32" fill="url(#focusRadial)" />
              </Svg>
              {loading ? (
                <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" />
              ) : (
                <Text style={styles.buttonText}>{isRunning ? "Stop" : "Focus time"}</Text>
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.iconButton, { borderColor: border }]}
            onPress={() => setIsInventoryOpen(true)}
          >
            <Ionicons name="bag-handle-outline" size={26} color={accent} />
          </TouchableOpacity>
        </View>
        {timerError ? (
          <Text style={styles.timerError}>{timerError}</Text>
        ) : isRunning ? (
          <Text style={styles.stakeHint}>
            Keep Tyren open — leaving longer than 30s breaks the session
          </Text>
        ) : null}
      </View>

      <InventoryBottomSheet
        ref={inventorySheetRef}
        isOpen={isInventoryOpen}
        onClose={() => setIsInventoryOpen(false)}
      />
      <ShopBottomSheet
        ref={shopSheetRef}
        isOpen={isShopOpen}
        onClose={() => setIsShopOpen(false)}
      />

      <SessionSummaryPopup
        visible={sessionResult !== null}
        elapsedMs={sessionResult?.elapsedMs ?? 0}
        rewards={{
          dust: sessionResult?.dust ?? 0,
          shards: sessionResult?.shards ?? 0,
          xp: sessionResult?.xp ?? 0,
        }}
        map={sessionResult?.map ?? null}
        relics={sessionResult?.relics ?? []}
        freezesEarned={sessionResult?.freezesEarned ?? 0}
        freezesConsumed={sessionResult?.freezesConsumed ?? 0}
        onContinue={handleCollect}
      />

      <SessionSummaryPopup
        visible={forfeitNotice !== null}
        variant="forfeited"
        elapsedMs={forfeitNotice?.elapsedMs ?? 0}
        rewards={{ dust: 0, shards: 0, xp: 0 }}
        onContinue={clearForfeitNotice}
      />

      <RankUpModal
        moment={moments[0] ?? null}
        onContinue={() => setMoments((q) => q.slice(1))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "column",
    backgroundColor: palette.bg,
  },
  segmentsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  segmentDiamond: {
    width: 7,
    height: 7,
    transform: [{ rotate: "45deg" }],
    marginRight: 3,
  },
  segment: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,106,77,0.18)",
  },
  segmentLabel: {
    fontSize: 8,
    fontFamily: fonts.pixel,
    color: palette.emberDim,
    marginLeft: 4,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    gap: 14,
  },
  cardTouchable: {
    width: "100%",
    maxWidth: 320,
  },
  cardBar: {
    width: "100%",
    marginTop: 14,
    gap: 6,
  },
  cardBarLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  cardBarCaption: {
    fontSize: 8,
    fontFamily: fonts.pixel,
    letterSpacing: 2,
    color: palette.textFaint,
  },
  cardBarValue: {
    fontSize: 14,
    fontFamily: fonts.pixelBold,
  },
  cardBarTrack: {
    width: "100%",
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(244,234,218,0.08)",
    overflow: "hidden",
  },
  cardBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  cardHint: {
    fontSize: 12,
    fontFamily: fonts.ui,
    color: palette.textDim,
    textAlign: "center",
  },
  multiplier: {
    fontSize: 13,
    fontFamily: fonts.ui,
    color: palette.textDim,
  },
  relicStrip: {
    width: "100%",
    gap: 12,
    alignItems: "center",
    marginTop: 4,
  },
  perkRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
  },
  perkChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: palette.bgRaised,
  },
  perkDiamond: {
    width: 6,
    height: 6,
    transform: [{ rotate: "45deg" }],
  },
  perkChipName: {
    fontSize: 12,
    fontFamily: fonts.ui,
    fontWeight: "700",
    color: palette.text,
  },
  perkChipBonus: {
    fontSize: 9,
    fontFamily: fonts.pixel,
  },
  noRelicChip: {
    borderWidth: 1,
    borderColor: palette.hairline,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: palette.bgRaised,
    marginTop: 4,
  },
  noRelicText: {
    fontSize: 12,
    fontFamily: fonts.ui,
    color: palette.textDim,
  },
  bottomContainer: {
    gap: 20,
    paddingHorizontal: 16,
    paddingBottom: 24,
    flexDirection: "column",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  levelContainer: {
    width: "100%",
    alignItems: "center",
    gap: 4,
  },
  levelTitle: {
    fontSize: 36,
    fontFamily: fonts.serif,
    color: palette.text,
  },
  levelnumber: {
    fontSize: 10,
    fontFamily: fonts.pixel,
    letterSpacing: 2,
    color: palette.textFaint,
  },
  timerError: {
    fontSize: 12,
    fontFamily: fonts.ui,
    color: palette.danger,
    textAlign: "center",
    marginTop: -12,
  },
  stakeHint: {
    fontSize: 12,
    fontFamily: fonts.ui,
    color: palette.textFaint,
    textAlign: "center",
    marginTop: -12,
  },
  botbuttonsContainer: {
    width: "100%",
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    height: 64,
  },
  iconButton: {
    height: 64,
    width: 64,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.bgRaised,
    borderWidth: 1,
    borderRadius: 100,
  },
  textButton: {
    height: 64,
    width: 200,
    borderRadius: 32,
  },
  textButtonDisabled: {
    opacity: 0.6,
  },
  gradientContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: {
    color: palette.text,
    fontSize: 20,
    fontFamily: fonts.ui,
  },
});
