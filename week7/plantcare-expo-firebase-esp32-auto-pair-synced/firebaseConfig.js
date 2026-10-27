// ⚠️ THAY các giá trị bên dưới bằng config thật của project Firebase
// (Firebase Console → Project Settings → Your apps → chọn app Web "</>")
import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyAebDHuY5Q4L1kBfeuxH5eN6Udhe5jtvqA",
  authDomain: "plantcare-ecbc6.firebaseapp.com",
  databaseURL: "https://plantcare-ecbc6-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "plantcare-ecbc6",
  storageBucket: "plantcare-ecbc6.firebasestorage.app",
  messagingSenderId: "698299850446",
  appId: "1:698299850446:web:ef0f8464ae323ec0f4fa9f"
};

const app = initializeApp(firebaseConfig);

// getReactNativePersistence lưu phiên đăng nhập vào AsyncStorage,
// nếu không có dòng này user sẽ bị đăng xuất mỗi lần tắt/mở lại app.
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db = getDatabase(app);
