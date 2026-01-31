export interface LevelDefinition {
  level: number;
  name: string;
  xpRequired: number;
}

export interface ProgressionState {
  currentLevel: number;
  currentXp: number;
  xpToNextLevel: number;
}
