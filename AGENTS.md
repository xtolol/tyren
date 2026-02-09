# AGENTS.md

Guidelines for AI agents working in this Tyren React Native/Expo codebase.

## Development Commands

```bash
# Install dependencies
npm install

# Start development server
npm start                    # Start Expo dev server
npm run android             # Run on Android emulator
npm run ios                 # Run on iOS simulator
npm run web                 # Run on web browser

# Linting
npm run lint                # Run ESLint on all files
npx eslint path/to/file.tsx # Lint specific file
npx eslint --fix path/to/file.tsx  # Lint and fix specific file

# Type checking
npx tsc --noEmit            # Run TypeScript type check
```

## Code Style Guidelines

### Imports (Auto-organized on save)
Order: React/React Native → Expo → Third-party libraries → Local absolute (@/) → Local relative (./)

```typescript
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useVideoPlayer } from 'expo-video';
import { create } from 'zustand';
import DustIcon from '@/assets/images/dust.svg';
import { usePlayerStore } from '@/src/stores/usePlayerStore';
import NavBar from './NavBar';
```

### Naming Conventions
- **Components**: PascalCase (e.g., `HomeScreen`, `ProgressBar`)
- **Hooks**: camelCase with `use` prefix (e.g., `useFocusTimer`, `usePlayerStore`)
- **Stores**: camelCase with `use` prefix and `Store` suffix (e.g., `usePlayerStore`)
- **Functions**: camelCase (e.g., `handleInventoryPress`, `formatCurrency`)
- **Types/Interfaces**: PascalCase (e.g., `TimerStatus`, `SessionMode`)
- **Constants**: UPPER_SNAKE_CASE for module-level constants (e.g., `XP_PER_LEVEL`)

### Component Structure
- Use default exports for components
- Define styles at bottom using `StyleSheet.create()`
- Extract helper functions above component
- Use explicit return types sparingly (TypeScript inference preferred)

```typescript
export default function ComponentName() {
  // hooks
  // state
  // effects
  // handlers
  // render
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
});
```

### Styling Requirements
- **Theme**: Black background throughout (`backgroundColor: 'black'`)
- **Colors**:
  - Dust (gold): `#FBC647`
  - Shards (pink): `#C34DB0`
  - Gradient blues: `#C7E3ED` to `#39A5C9`
  - Dark buttons: `#1A1A1A`
- **Fonts**: `InstrumentSerif-Regular` for titles, `OpenSans` for UI text

### Error Handling
- Use try/catch for cleanup operations that may fail silently
- Optional chaining for potentially undefined values
- Graceful degradation for video/media operations

### State Management
- **Zustand** for global state with persistence via AsyncStorage
- Store naming: `use{Feature}Store`
- Include types in separate files (e.g., `types.ts` in feature folder)

### TypeScript
- **Strict mode enabled**
- Use `type` for type aliases, `interface` for object shapes
- Export types from index files: `export * from './types'`
- Path alias `@/` maps to project root

### SVG Assets
- Import SVGs as React components via `react-native-svg-transformer`
- Use descriptive naming with size suffix: `dust-16px.svg`

### Project Structure
```
/app              # Expo Router routes and components
  /components     # Shared React components
  _layout.tsx     # Root layout
  index.tsx       # Home page
/src
  /stores         # Zustand stores
  /core           # Business logic (timer, rewards, boosts, progression)
  /hooks          # Custom React hooks
/assets
  /images         # SVGs, fonts, videos
```

## Key Patterns

### File-Based Routing
Expo Router uses file structure. Routes auto-map to files in `/app`.

### Gradient Text
Use `MaskedView` + `LinearGradient`:
```typescript
<MaskedView maskElement={<Text style={styles.title}>TYREN</Text>}>
  <LinearGradient colors={['#C7E3ED', '#39A5C9']}>
    <Text style={[styles.title, { opacity: 0 }]}>TYREN</Text>
  </LinearGradient>
</MaskedView>
```

### Video Background
- Muted and looped via `expo-video`
- Use `contentFit="cover"` and `nativeControls={false}`

### Bottom Sheets
Use `@gorhom/bottom-sheet` with `BottomSheetModalProvider` in root layout.

## VS Code Settings
Auto-fix and organize imports on save enabled. Run `npm run lint` before committing.


## Skills
A skill is a set of local instructions to follow that is stored in a `SKILL.md` file. Below is the list of skills that can be used. Each entry includes a name, description, and file path so you can open the source for full instructions when using a specific skill.
### Available skills
- find-skills: Helps users discover and install agent skills when they ask questions like "how do I do X", "find a skill for X", "is there a skill that can...", or express interest in extending capabilities. This skill should be used when the user is looking for functionality that might exist as an installable skill. (file: /home/zumbarak/.agents/skills/find-skills/SKILL.md)
- skill-creator: Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends Codex's capabilities with specialized knowledge, workflows, or tool integrations. (file: /home/zumbarak/.codex/skills/.system/skill-creator/SKILL.md)
- skill-installer: Install Codex skills into $CODEX_HOME/skills from a curated list or a GitHub repo path. Use when a user asks to list installable skills, install a curated skill, or install a skill from another repo (including private repos). (file: /home/zumbarak/.codex/skills/.system/skill-installer/SKILL.md)
### How to use skills
- Discovery: The list above is the skills available in this session (name + description + file path). Skill bodies live on disk at the listed paths.
- Trigger rules: If the user names a skill (with `$SkillName` or plain text) OR the task clearly matches a skill's description shown above, you must use that skill for that turn. Multiple mentions mean use them all. Do not carry skills across turns unless re-mentioned.
- Missing/blocked: If a named skill isn't in the list or the path can't be read, say so briefly and continue with the best fallback.
- How to use a skill (progressive disclosure):
  1) After deciding to use a skill, open its `SKILL.md`. Read only enough to follow the workflow.
  2) When `SKILL.md` references relative paths (e.g., `scripts/foo.py`), resolve them relative to the skill directory listed above first, and only consider other paths if needed.
  3) If `SKILL.md` points to extra folders such as `references/`, load only the specific files needed for the request; don't bulk-load everything.
  4) If `scripts/` exist, prefer running or patching them instead of retyping large code blocks.
  5) If `assets/` or templates exist, reuse them instead of recreating from scratch.
- Coordination and sequencing:
  - If multiple skills apply, choose the minimal set that covers the request and state the order you'll use them.
  - Announce which skill(s) you're using and why (one short line). If you skip an obvious skill, say why.
- Context hygiene:
  - Keep context small: summarize long sections instead of pasting them; only load extra files when needed.
  - Avoid deep reference-chasing: prefer opening only files directly linked from `SKILL.md` unless you're blocked.
  - When variants exist (frameworks, providers, domains), pick only the relevant reference file(s) and note that choice.
- Safety and fallback: If a skill can't be applied cleanly (missing files, unclear instructions), state the issue, pick the next-best approach, and continue.
