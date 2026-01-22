import DustIcon from '@/assets/images/dust-16px.svg';
import ResultsIcon from '@/assets/images/results-32px.svg';
import SettingsIcon from '@/assets/images/settings-32px.svg';
import ShardIcon from '@/assets/images/shard-16px.svg';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function NavBar() {
  return (
    <View style={styles.container}>
      <SettingsIcon width={32} height={32} />
      <View style={styles.iconContainer}>
        <DustIcon width={16} height={16} />
        <Text style={styles.dust}>2K</Text>
      </View>
      <MaskedView
        maskElement={<Text style={styles.title}>TYREN</Text>}
        style={styles.maskedView}
      >
        <LinearGradient
          colors={['#C7E3ED', '#39A5C9']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.gradient}
        >
          <Text style={[styles.title, { opacity: 0 }]}>TYREN</Text>
        </LinearGradient>
      </MaskedView>
      <View style={styles.iconContainer}>
        <ShardIcon width={16} height={16} />
        <Text style={styles.shard}>1</Text>
      </View>
      <ResultsIcon width={32} height={32} />
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 32,
    fontWeight: 'regular',
    fontFamily: 'OpenSans',
  },
  container: {
    paddingTop: 65,
    paddingHorizontal: 16,
    backgroundColor: 'transparent',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  iconContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dust: {
    fontSize: 14,
    fontWeight: 'regular',
    color: '#FBC647',
    fontFamily: 'OpenSans',
  },
  shard: {
    fontSize: 14,
    fontWeight: 'regular',
    color: '#C34DB0',
    fontFamily: 'OpenSans',
  },
  maskedView: {
    height: 40,
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
  },
});