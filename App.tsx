/**
 * Punto de entrada de la aplicación.
 * Renderiza la pantalla principal (AgendaScreen).
 * SafeAreaProvider permite que las pantallas respeten la barra de estado y el notch.
 */

import React, { useEffect } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { PreferencesProvider } from './src/contexts/PreferencesContext';
import { AgendaScreen } from './src/screens';

let didApplyGlobalFont = false;
let originalTextRender: any = null;

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    PixelOperator: require('./assets/font/PixelOperator.ttf'),
    'PixelOperator-Bold': require('./assets/font/PixelOperator-Bold.ttf'),
  });

  useEffect(() => {
    if (fontError) {
      console.warn('[Agenda] No se pudieron cargar las fuentes PixelOperator:', fontError);
    }
  }, [fontError]);

  useEffect(() => {
    if (!fontsLoaded) return;
    if (didApplyGlobalFont) return;
    didApplyGlobalFont = true;

    // Text: forzar fontFamily aunque haya styles con fontWeight.
    originalTextRender = originalTextRender ?? (Text as any).render;
    (Text as any).render = function render(...args: any[]) {
      const origin = originalTextRender.apply(this, args);
      const flatStyle = StyleSheet.flatten(origin.props?.style) ?? {};
      const weight = flatStyle.fontWeight;
      const wantsBold =
        flatStyle.fontFamily === 'PixelOperator-Bold' ||
        weight === 'bold' ||
        weight === '700' ||
        weight === '600';
      return React.cloneElement(origin, {
        ...origin.props,
        allowFontScaling: false,
        maxFontSizeMultiplier: 1,
        style: [
          origin.props?.style,
          {
            fontFamily: wantsBold ? 'PixelOperator-Bold' : 'PixelOperator',
            fontWeight: 'normal',
          },
        ],
      });
    };

    // TextInput: default global + normaliza fontWeight.
    TextInput.defaultProps = TextInput.defaultProps ?? {};
    TextInput.defaultProps.style = [
      TextInput.defaultProps.style,
      { fontFamily: 'PixelOperator', fontWeight: 'normal' },
    ];
    (TextInput.defaultProps as any).allowFontScaling = false;
    (TextInput.defaultProps as any).maxFontSizeMultiplier = 1;
  }, [fontsLoaded]);

  // No bloquear la UI si las fuentes fallan (evita pantalla blanca permanente).
  if (!fontsLoaded && !fontError) {
    return <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#ffffff' }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PreferencesProvider>
          <AgendaScreen />
        </PreferencesProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
