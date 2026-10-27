import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';

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

  // =========================
  // QUÊN MẬT KHẨU
  // =========================
  async function handleForgotPassword() {
    setError('');

    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setError('Nhập email trước khi chọn "Quên mật khẩu?".');
      return;
    }

    setLoading(true);

    try {
      await sendPasswordResetEmail(auth, cleanEmail);

      setError(
        'Đã gửi email đặt lại mật khẩu. Hãy kiểm tra hộp thư của bạn.'
      );
    } catch (e) {
      console.log('Forgot password error:', e);

      setError(mapError(e.code));
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // ĐĂNG NHẬP / ĐĂNG KÝ
  // =========================
  async function handleSubmit() {
    setError('');

    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      setError('Nhập đủ email và mật khẩu.');
      return;
    }

    if (isSignUp && password.length < 6) {
      setError('Mật khẩu cần ít nhất 6 ký tự.');
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        const cred = await createUserWithEmailAndPassword(
          auth,
          cleanEmail,
          password
        );

        const uid = cred.user.uid;

        // Tạo thông tin người dùng trong Realtime Database
        await set(ref(db, `users/${uid}`), {
          name: name.trim() || 'User',
          email: cleanEmail,
          created_at: Date.now(),
          plant_ids: [],
        });
      } else {
        await signInWithEmailAndPassword(
          auth,
          cleanEmail,
          password
        );
      }
    } catch (e) {
      console.log('Login error:', e);

      setError(mapError(e.code));
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // UI
  // =========================
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={s.container}
    >
      <View style={s.logoWrap}>
        <Ionicons
          name="leaf"
          size={48}
          color={C.green}
        />

        <Text style={s.logoText}>
          PlantCare
        </Text>

        <Text style={s.tagline}>
          Chăm sóc cây mọi lúc, mọi nơi
        </Text>
      </View>

      {/* HỌ TÊN - CHỈ HIỆN KHI ĐĂNG KÝ */}
      {isSignUp && (
        <TextInput
          style={s.input}
          placeholder="Họ tên"
          value={name}
          onChangeText={setName}
          editable={!loading}
        />
      )}

      {/* EMAIL */}
      <TextInput
        style={s.input}
        placeholder="Email"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        editable={!loading}
      />

      {/* MẬT KHẨU */}
      <TextInput
        style={s.input}
        placeholder="Mật khẩu"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        editable={!loading}
      />

      {/* QUÊN MẬT KHẨU - CHỈ HIỆN KHI ĐĂNG NHẬP */}
      {!isSignUp && (
        <Pressable
          onPress={handleForgotPassword}
          disabled={loading}
          style={s.forgotButton}
        >
          <Text style={s.forgotText}>
            Quên mật khẩu?
          </Text>
        </Pressable>
      )}

      {!!error && (
        <Text style={s.error}>
          {error}
        </Text>
      )}

      {/* NÚT ĐĂNG NHẬP / ĐĂNG KÝ */}
      <Pressable
        style={s.button}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={s.buttonText}>
            {isSignUp ? 'Đăng ký' : 'Đăng nhập'}
          </Text>
        )}
      </Pressable>

      {/* CHUYỂN ĐĂNG NHẬP / ĐĂNG KÝ */}
      <Pressable
        onPress={() => {
          setIsSignUp(!isSignUp);
          setError('');
        }}
        disabled={loading}
      >
        <Text style={s.switchText}>
          {isSignUp
            ? 'Đã có tài khoản? Đăng nhập'
            : 'Chưa có tài khoản? Đăng ký'}
        </Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

// =========================
// FIREBASE ERROR
// =========================

function mapError(code) {
  const map = {
    'auth/email-already-in-use':
      'Email này đã được đăng ký.',

    'auth/invalid-email':
      'Email không hợp lệ.',

    'auth/weak-password':
      'Mật khẩu cần ít nhất 6 ký tự.',

    'auth/user-not-found':
      'Không tìm thấy tài khoản này.',

    'auth/wrong-password':
      'Sai mật khẩu.',

    'auth/invalid-credential':
      'Email hoặc mật khẩu không đúng.',

    'auth/too-many-requests':
      'Có quá nhiều yêu cầu. Vui lòng thử lại sau.',

    'auth/network-request-failed':
      'Không có kết nối mạng. Vui lòng kiểm tra Internet.',

    'auth/user-disabled':
      'Tài khoản này đã bị vô hiệu hóa.',
  };

  return (
    map[code] ||
    'Có lỗi xảy ra, thử lại nhé.'
  );
}

// =========================
// STYLE
// =========================

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    padding: 24,
    justifyContent: 'center',
  },

  logoWrap: {
    alignItems: 'center',
    marginBottom: 36,
  },

  logoText: {
    fontSize: 26,
    fontWeight: '800',
    color: C.darkGreen,
    marginTop: 8,
  },

  tagline: {
    color: C.gray,
    marginTop: 4,
  },

  input: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 52,
    marginBottom: 12,
    fontSize: 15,
  },

  forgotButton: {
    alignItems: 'flex-end',
    marginBottom: 10,
  },

  forgotText: {
    color: C.green,
    fontWeight: '600',
  },

  button: {
    backgroundColor: C.green,
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },

  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },

  switchText: {
    textAlign: 'center',
    color: C.green,
    marginTop: 18,
    fontWeight: '600',
  },

  error: {
    color: C.red,
    marginBottom: 10,
    textAlign: 'center',
  },
});