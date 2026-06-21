import Constants, { ExecutionEnvironment } from 'expo-constants';

/** True when running inside the Expo Go store client (no custom native modules). */
export function isExpoGoEnvironment(): boolean {
  try {
    return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  } catch {
    return false;
  }
}
