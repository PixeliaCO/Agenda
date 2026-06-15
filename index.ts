import 'react-native-gesture-handler';
/** Notifee: registrar `onBackgroundEvent` antes del componente raíz (alarmas con app en segundo plano / cerrada). */
import './notifeeBackground';
import { ensureAgendaAlarmBridgeListener } from './src/services/localNotificationService';
import { registerRootComponent } from 'expo';

ensureAgendaAlarmBridgeListener();

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
