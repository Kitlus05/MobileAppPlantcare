import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Switch,
  StyleSheet,
  Pressable,
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import {
  signOut,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';

import { PageTitle } from '../components/Common';
import WateringSettings from '../components/WateringSettings';
import { auth } from '../firebaseConfig';
import { useAuth } from '../contexts/AuthContext';
import { C } from '../styles';


function Row({
  icon,
  text,
  switchValue,
  onChange,
  onPress,
  danger,
}) {
  return (
    <Pressable
      style={s.row}
      onPress={onPress}
      disabled={!onPress}
    >
      <Ionicons
        name={icon}
        size={22}
        color={danger ? C.red : C.green}
      />

      <Text
        style={[
          s.text,
          danger && { color: C.red },
        ]}
      >
        {text}
      </Text>

      {switchValue !== undefined ? (
        <View style={s.switchBox}>
          <Switch
            value={switchValue}
            onValueChange={onChange}
            trackColor={{ true: '#9DCE9F' }}
            thumbColor={switchValue ? C.green : undefined}
          />
        </View>
      ) : danger ? null : (
        <Ionicons
          name="chevron-forward"
          size={20}
          color="#8A918A"
        />
      )}
    </Pressable>
  );
}


// Mỗi nhóm là một thẻ bo góc, các dòng cách nhau bằng đường kẻ mảnh.
function Section({ title, children }) {
  const items = React.Children.toArray(children).filter(Boolean);

  return (
    <View>
      <Text style={s.section}>{title}</Text>

      <View style={s.card}>
        {items.map((child, i) => (
          <View key={i}>
            {i > 0 && <View style={s.divider} />}
            {child}
          </View>
        ))}
      </View>
    </View>
  );
}


export default function SettingsScreen() {
  const { user } = useAuth();

  const [d, setD] = useState(false);

  // =========================
  // ĐỔI MẬT KHẨU
  // =========================

  const [showChangePassword, setShowChangePassword] =
    useState(false);

  const [currentPassword, setCurrentPassword] =
    useState('');

  const [newPassword, setNewPassword] =
    useState('');

  const [confirmPassword, setConfirmPassword] =
    useState('');

  const [passwordLoading, setPasswordLoading] =
    useState(false);

  const [passwordError, setPasswordError] =
    useState('');

  const [passwordSuccess, setPasswordSuccess] =
    useState('');


  // =========================
  // ĐỔI MẬT KHẨU
  // =========================

  async function handleChangePassword() {
    setPasswordError('');
    setPasswordSuccess('');

    const currentUser = auth.currentUser;

    // Kiểm tra đăng nhập
    if (!currentUser) {
      setPasswordError(
        'Bạn chưa đăng nhập.'
      );
      return;
    }

    // Tài khoản phải có email
    if (!currentUser.email) {
      setPasswordError(
        'Tài khoản này không sử dụng email/mật khẩu.'
      );
      return;
    }

    // Kiểm tra nhập đủ
    if (
      !currentPassword ||
      !newPassword ||
      !confirmPassword
    ) {
      setPasswordError(
        'Vui lòng nhập đầy đủ thông tin.'
      );
      return;
    }

    // Kiểm tra độ dài
    if (newPassword.length < 6) {
      setPasswordError(
        'Mật khẩu mới phải có ít nhất 6 ký tự.'
      );
      return;
    }

    // Kiểm tra xác nhận
    if (newPassword !== confirmPassword) {
      setPasswordError(
        'Mật khẩu xác nhận không khớp.'
      );
      return;
    }

    // Không cho dùng lại mật khẩu cũ
    if (currentPassword === newPassword) {
      setPasswordError(
        'Mật khẩu mới phải khác mật khẩu hiện tại.'
      );
      return;
    }

    setPasswordLoading(true);

    try {
      // =========================
      // XÁC THỰC MẬT KHẨU HIỆN TẠI
      // =========================

      const credential =
        EmailAuthProvider.credential(
          currentUser.email,
          currentPassword
        );

      await reauthenticateWithCredential(
        currentUser,
        credential
      );

      // =========================
      // CẬP NHẬT MẬT KHẨU
      // =========================

      await updatePassword(
        currentUser,
        newPassword
      );

      // Xóa form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      setPasswordSuccess(
        'Đổi mật khẩu thành công!'
      );

      // Đóng form sau 1.2 giây
      setTimeout(() => {
        setShowChangePassword(false);
        setPasswordSuccess('');
      }, 1200);

    } catch (error) {
      console.log(
        'Change password error:',
        error
      );

      switch (error.code) {
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          setPasswordError(
            'Mật khẩu hiện tại không đúng.'
          );
          break;

        case 'auth/weak-password':
          setPasswordError(
            'Mật khẩu mới phải có ít nhất 6 ký tự.'
          );
          break;

        case 'auth/requires-recent-login':
          setPasswordError(
            'Phiên đăng nhập đã cũ. Vui lòng đăng xuất và đăng nhập lại rồi thử lại.'
          );
          break;

        case 'auth/network-request-failed':
          setPasswordError(
            'Không có kết nối mạng. Vui lòng kiểm tra Internet.'
          );
          break;

        case 'auth/too-many-requests':
          setPasswordError(
            'Có quá nhiều lần thử. Vui lòng thử lại sau.'
          );
          break;

        default:
          setPasswordError(
            'Không thể đổi mật khẩu. Vui lòng thử lại.'
          );
      }

    } finally {
      setPasswordLoading(false);
    }
  }


  // =========================
  // MỞ / ĐÓNG FORM
  // =========================

  function toggleChangePassword() {
    setShowChangePassword(
      !showChangePassword
    );

    setPasswordError('');
    setPasswordSuccess('');

    // Nếu đóng form thì xóa dữ liệu
    if (showChangePassword) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  }


  // =========================
  // ĐĂNG XUẤT
  // =========================

  function handleLogout() {
    Alert.alert(
      'Đăng xuất',
      'Bạn có chắc muốn đăng xuất?',
      [
        {
          text: 'Hủy',
          style: 'cancel',
        },
        {
          text: 'Đăng xuất',
          style: 'destructive',
          onPress: () => signOut(auth),
        },
      ]
    );
  }


  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor: C.bg,
      }}
      contentContainerStyle={{
        paddingBottom: 30,
      }}
    >

      <PageTitle title="Cài đặt" />


      {/* ========================= */}
      {/* PROFILE */}
      {/* ========================= */}

      <View style={s.profile}>

        <View style={s.avatar}>
          <Ionicons
            name="person"
            size={22}
            color={C.green}
          />
        </View>

        <View style={{ flex: 1 }}>

          <Text style={s.bold}>
            {user?.email || 'User'}
          </Text>

          <Text style={s.sub}>
            Đã đăng nhập
          </Text>

        </View>

      </View>


      {/* ========================= */}
      {/* TÀI KHOẢN */}
      {/* ========================= */}

      <Section title="TÀI KHOẢN">

        <Row
          icon="person-outline"
          text="Thông tin cá nhân"
        />


        {/* ĐỔI MẬT KHẨU */}

        <Row
          icon="lock-closed-outline"
          text="Đổi mật khẩu"
          onPress={toggleChangePassword}
        />

      </Section>


      {/* ========================= */}
      {/* FORM ĐỔI MẬT KHẨU */}
      {/* ========================= */}

      {showChangePassword && (

        <View style={s.passwordBox}>

          <View style={s.passwordHeader}>

            <View style={{ flex: 1 }}>

              <Text style={s.passwordTitle}>
                Đổi mật khẩu
              </Text>

              <Text style={s.passwordSubtitle}>
                Nhập mật khẩu hiện tại và mật khẩu mới
              </Text>

            </View>

            <Pressable
              onPress={toggleChangePassword}
            >
              <Ionicons
                name="close-circle-outline"
                size={25}
                color="#8A918A"
              />
            </Pressable>

          </View>


          {/* MẬT KHẨU HIỆN TẠI */}

          <Text style={s.inputLabel}>
            Mật khẩu hiện tại
          </Text>

          <TextInput
            style={s.input}
            placeholder="Nhập mật khẩu hiện tại"
            placeholderTextColor="#999"
            secureTextEntry
            value={currentPassword}
            onChangeText={setCurrentPassword}
            editable={!passwordLoading}
          />


          {/* MẬT KHẨU MỚI */}

          <Text style={s.inputLabel}>
            Mật khẩu mới
          </Text>

          <TextInput
            style={s.input}
            placeholder="Ít nhất 6 ký tự"
            placeholderTextColor="#999"
            secureTextEntry
            value={newPassword}
            onChangeText={setNewPassword}
            editable={!passwordLoading}
          />


          {/* XÁC NHẬN */}

          <Text style={s.inputLabel}>
            Xác nhận mật khẩu mới
          </Text>

          <TextInput
            style={s.input}
            placeholder="Nhập lại mật khẩu mới"
            placeholderTextColor="#999"
            secureTextEntry
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            editable={!passwordLoading}
          />


          {/* LỖI */}

          {!!passwordError && (

            <Text style={s.passwordError}>
              {passwordError}
            </Text>

          )}


          {/* THÀNH CÔNG */}

          {!!passwordSuccess && (

            <Text style={s.passwordSuccess}>
              {passwordSuccess}
            </Text>

          )}


          {/* NÚT ĐỔI MẬT KHẨU */}

          <Pressable
            style={[
              s.changePasswordButton,
              passwordLoading &&
                s.buttonDisabled,
            ]}
            onPress={handleChangePassword}
            disabled={passwordLoading}
          >

            {passwordLoading ? (

              <ActivityIndicator color="#fff" />

            ) : (

              <>

                <Ionicons
                  name="lock-closed-outline"
                  size={19}
                  color="#fff"
                />

                <Text style={s.changePasswordText}>
                  Đổi mật khẩu
                </Text>

              </>

            )}

          </Pressable>

        </View>

      )}


      {/* ========================= */}
      {/* NHẮC NHỞ */}
      {/* ========================= */}

      <Text style={s.section}>NHẮC NHỞ & TƯỚI CÂY</Text>

      <WateringSettings />


      {/* ========================= */}
      {/* HIỂN THỊ */}
      {/* ========================= */}

      <Section title="HIỂN THỊ">

        <Row
          icon="language-outline"
          text="Ngôn ngữ • Tiếng Việt"
        />

        <Row
          icon="moon-outline"
          text="Chế độ tối"
          switchValue={d}
          onChange={setD}
        />

      </Section>


      {/* ========================= */}
      {/* ỨNG DỤNG */}
      {/* ========================= */}

      <Section title="ỨNG DỤNG">

        <Row
          icon="information-circle-outline"
          text="Phiên bản • 1.0.0"
        />

        <Row
          icon="help-circle-outline"
          text="Trợ giúp"
        />

      </Section>


      {/* ========================= */}
      {/* ĐĂNG XUẤT */}
      {/* ========================= */}

      <View style={[s.card, { marginTop: 18 }]}>

        <Row
          icon="log-out-outline"
          text="Đăng xuất"
          onPress={handleLogout}
          danger
        />

      </View>

    </ScrollView>
  );
}


// =========================
// STYLE
// =========================

const s = StyleSheet.create({

  profile: {
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 14,
    backgroundColor: '#fff',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: C.paleGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },

  card: {
    marginHorizontal: 20,
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E3E8E1',
    marginLeft: 52,
  },

  row: {
    minHeight: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },

  switchBox: {
    width: 56,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },

  text: {
    flex: 1,
    fontSize: 15,
  },

  section: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
    color: C.green,
    fontSize: 12,
    fontWeight: '900',
  },

  bold: {
    fontWeight: '800',
    fontSize: 16,
  },

  sub: {
    color: C.gray,
    fontSize: 13,
    marginTop: 2,
  },

  // =========================
  // FORM ĐỔI MẬT KHẨU
  // =========================

  passwordBox: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 18,
    backgroundColor: '#fff',
    borderRadius: 16,
  },

  passwordHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },

  passwordTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.darkGreen,
  },

  passwordSubtitle: {
    color: C.gray,
    fontSize: 13,
    marginTop: 4,
  },

  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#444',
    marginBottom: 6,
  },

  input: {
    height: 50,
    backgroundColor: '#F5F7F5',
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5E9E5',
  },

  passwordError: {
    color: C.red,
    textAlign: 'center',
    fontSize: 13,
    marginBottom: 12,
  },

  passwordSuccess: {
    color: C.green,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 12,
  },

  changePasswordButton: {
    height: 50,
    backgroundColor: C.green,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },

  changePasswordText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },

  buttonDisabled: {
    opacity: 0.7,
  },

});