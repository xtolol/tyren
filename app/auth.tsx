import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuthStore } from '@/src/stores/useAuthStore';

export default function AuthScreen() {
  const router = useRouter();
  const { signInWithEmail, signUpWithEmail, loading } = useAuthStore();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setSuccessMessage(null);

    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }
    if (mode === 'signup' && !username.trim()) {
      setError('Username is required.');
      return;
    }

    if (mode === 'signin') {
      const err = await signInWithEmail(email.trim(), password);
      if (err) setError(err);
      else router.replace('/');
    } else {
      const err = await signUpWithEmail(email.trim(), password, username.trim());
      if (err) {
        setError(err);
      } else {
        setSuccessMessage('Account created! Check your email to confirm, then sign in.');
        setMode('signin');
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        {/* Logo */}
        <MaskedView
          maskElement={<Text style={styles.logo}>TYREN</Text>}
          style={styles.maskedView}
        >
          <LinearGradient
            colors={['#C7E3ED', '#39A5C9']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.gradient}
          >
            <Text style={[styles.logo, { opacity: 0 }]}>TYREN</Text>
          </LinearGradient>
        </MaskedView>

        <Text style={styles.subtitle}>
          {mode === 'signin' ? 'Welcome back' : 'Create your account'}
        </Text>

        {/* Inputs */}
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="rgba(255,255,255,0.35)"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        {mode === 'signup' && (
          <TextInput
            style={styles.input}
            placeholder="Username"
            placeholderTextColor="rgba(255,255,255,0.35)"
            autoCapitalize="none"
            value={username}
            onChangeText={setUsername}
          />
        )}
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="rgba(255,255,255,0.35)"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {/* Error / Success */}
        {error && <Text style={styles.error}>{error}</Text>}
        {successMessage && <Text style={styles.success}>{successMessage}</Text>}

        {/* Submit */}
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="white" />
            : <Text style={styles.primaryButtonText}>
                {mode === 'signin' ? 'Sign in' : 'Sign up'}
              </Text>
          }
        </TouchableOpacity>

        {/* Toggle mode */}
        <TouchableOpacity onPress={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError(null); setSuccessMessage(null); setUsername(''); }}>
          <Text style={styles.toggleText}>
            {mode === 'signin'
              ? "Don't have an account? Sign up"
              : 'Already have an account? Sign in'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  maskedView: {
    height: 56,
    alignSelf: 'center',
    marginBottom: 8,
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
  },
  logo: {
    fontSize: 48,
    fontFamily: 'InstrumentSerif-Regular',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'OpenSans',
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: 'OpenSans',
    color: 'white',
  },
  primaryButton: {
    backgroundColor: '#1A1A1A',
    borderRadius: 100,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryButtonText: {
    fontSize: 16,
    fontFamily: 'OpenSans',
    color: 'white',
  },
  toggleText: {
    fontSize: 13,
    fontFamily: 'OpenSans',
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    marginTop: 4,
  },
  error: {
    fontSize: 13,
    fontFamily: 'OpenSans',
    color: '#FF6B6B',
    textAlign: 'center',
  },
  success: {
    fontSize: 13,
    fontFamily: 'OpenSans',
    color: '#39A5C9',
    textAlign: 'center',
  },
});
