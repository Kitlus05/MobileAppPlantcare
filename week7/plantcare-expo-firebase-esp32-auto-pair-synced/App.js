import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import HomeScreen from './screens/HomeScreen';
import PlantsScreen from './screens/PlantsScreen';
import PlantDetailScreen from './screens/PlantDetailScreen';
import HistoryScreen from './screens/HistoryScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import SettingsScreen from './screens/SettingsScreen';
import LoginScreen from './screens/LoginScreen';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { C } from './styles';

const Stack = createNativeStackNavigator(), Tab = createBottomTabNavigator();

function PlantStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShadowVisible: false, headerTintColor: '#0D6931', headerTitleStyle: { fontWeight: '700' } }}>
      <Stack.Screen name="Plants" component={PlantsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="PlantDetail" component={PlantDetailScreen} options={{ title: 'Chi tiết cây' }} />
    </Stack.Navigator>
  );
}

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#16833F',
        tabBarInactiveTintColor: '#7B817B',
        tabBarStyle: { height: 66, paddingBottom: 8, paddingTop: 6, backgroundColor: '#fff', borderTopWidth: 0 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ focused, color, size }) => {
          const map = {
            Home: focused ? 'home' : 'home-outline',
            Plants: focused ? 'leaf' : 'leaf-outline',
            History: 'time-outline',
            Notifications: focused ? 'notifications' : 'notifications-outline',
            Settings: focused ? 'settings' : 'settings-outline',
          };
          return <Ionicons name={map[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Trang chủ' }} />
      <Tab.Screen name="Plantlist" component={PlantStack} options={{ title: 'Cây trồng' }} />
      <Tab.Screen name="History" component={HistoryScreen} options={{ title: 'Lịch sử' }} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Thông báo' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Cài đặt' }} />
    </Tab.Navigator>
  );
}

function Root() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator size="large" color={C.green} />
      </View>
    );
  }

  return <NavigationContainer>{user ? <Tabs /> : <LoginScreen />}</NavigationContainer>;
}

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Root />
    </AuthProvider>
  );
}
