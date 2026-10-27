import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { ref, set } from 'firebase/database';
import { auth, db } from '../firebaseConfig';
import { C } from '../styles';

export default function LoginScreen() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    setError('');
    if (!email || !password) {
      setError('Nhập đủ email và mật khẩu.');
      return;
    }
    setLoading(true);
    try {
      if (isSignUp) {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const uid = cred.user.uid;
        // Tài khoản mới bắt đầu với danh sách cây rỗng.
        // Người dùng có thể thêm cây từ màn hình Cây trồng.
        await set(ref(db, `users/${uid}`), {
          name: name.trim() || 'User',
          email: email.trim(),
          created_at: Date.now(),
          plant_ids: [],
        });
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (e) {
      setError(mapError(e.code));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.container}>
      <View style={s.logoWrap}>
        <Ionicons name="leaf" size={48} color={C.green} />
        <Text style={s.logoText}>PlantCare</Text>
        <Text style={s.tagline}>Chăm sóc cây mọi lúc, mọi nơi</Text>
      </View>

      {isSignUp && (
        <TextInput style={s.input} placeholder="Họ tên" value={name} onChangeText={setName} />
      )}
      <TextInput
        style={s.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={s.input}
        placeholder="Mật khẩu"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {!!error && <Text style={s.error}>{error}</Text>}

      <Pressable style={s.button} onPress={handleSubmit} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>{isSignUp ? 'Đăng ký' : 'Đăng nhập'}</Text>}
      </Pressable>

      <Pressable onPress={() => { setIsSignUp(!isSignUp); setError(''); }}>
        <Text style={s.switchText}>
          {isSignUp ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký'}
        </Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

function mapError(code) {
  const map = {
    'auth/email-already-in-use': 'Email này đã được đăng ký.',
    'auth/invalid-email': 'Email không hợp lệ.',
    'auth/weak-password': 'Mật khẩu cần ít nhất 6 ký tự.',
    'auth/user-not-found': 'Không tìm thấy tài khoản này.',
    'auth/wrong-password': 'Sai mật khẩu.',
    'auth/invalid-credential': 'Email hoặc mật khẩu không đúng.',
  };
  return map[code] || 'Có lỗi xảy ra, thử lại nhé.';
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, padding: 24, justifyContent: 'center' },
  logoWrap: { alignItems: 'center', marginBottom: 36 },
  logoText: { fontSize: 26, fontWeight: '800', color: C.darkGreen, marginTop: 8 },
  tagline: { color: C.gray, marginTop: 4 },
  input: { backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 16, height: 52, marginBottom: 12, fontSize: 15 },
  button: { backgroundColor: C.green, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  switchText: { textAlign: 'center', color: C.green, marginTop: 18, fontWeight: '600' },
  error: { color: C.red, marginBottom: 10, textAlign: 'center' },
});
