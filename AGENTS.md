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
