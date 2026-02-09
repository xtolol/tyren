export type RegionId = string;
export type LocationId = string;

export type LocationStatus = 'locked' | 'discovered' | 'current' | 'completed';

export interface BossEncounter {
  bossName: string;
  maxHp: number;
  rewardDust: number;
  rewardShards: number;
  rewardXp: number;
}

export interface MapLocation {
  id: LocationId;
  name: string;
  regionId: RegionId;
  positionX: number;
  positionY: number;
  unlockLevel: number;
  boss: BossEncounter | null;
}

export interface MapRegion {
  id: RegionId;
  name: string;
  locationIds: LocationId[];
}
