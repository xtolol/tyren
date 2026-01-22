import { VideoView, useVideoPlayer } from 'expo-video';
import React, { useEffect } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import NavBar from './NavBar';
import ProgressBar from './ProgressBar';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('screen');

export default function HomeScreen() {
  const player = useVideoPlayer(require('@/assets/images/videos/1.mp4'), (player) => {
    player.loop = true;
    player.muted = true;
  });

  useEffect(() => {
    player.play();
    return () => {
      try {
        if (player) {
          player.pause();
        }
      } catch (error) {
        // Player may have already been cleaned up by useVideoPlayer hook
      }
    };
  }, [player]);

  return (
    <View style={styles.container}>
      <VideoView
        style={styles.backgroundVideo}
        player={player}
        contentFit="cover"
        nativeControls={false}
      />
      <NavBar />
      <ProgressBar/>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
    backgroundColor: 'black',
    gap: 24,
  },
  backgroundVideo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
});