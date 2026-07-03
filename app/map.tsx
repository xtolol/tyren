import { StyleSheet, View } from 'react-native';
import MapScreen from './components/MapScreen';

export default function MapPage() {
  return (
    <View style={styles.container}>
      <MapScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C0805',
  },
});
