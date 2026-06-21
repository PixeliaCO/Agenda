/**
 * Pantalla completa estilo Palm OS para editar la lista de categorías.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';
import { BUILTIN_CATEGORIES, CATEGORY_PICKER_COLORS, type CategoryItem, nextCustomColor } from '../../constants/categories';
import { usePreferences } from '../../contexts/PreferencesContext';
import { scaledFontSize, titleFont } from '../../utils/typography';
import { getAllCategories, saveCategories } from '../../services/categoryService';
import { renameCategoryInReminders, clearCategoryInReminders } from '../../services/reminderService';
import { PalmScreenShell, ScreenOverlay } from '../PalmScreenShell';

type EditCategoriesScreenProps = {
  onDismiss: () => void;
  onSaved?: () => void;
};

function CategoryDot({ color, size = 12 }: { color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(0,0,0,0.15)',
      }}
    />
  );
}

function CategoryColorPicker({
  value,
  onChange,
  accentColor,
}: {
  value: string;
  onChange: (color: string) => void;
  accentColor: string;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10, marginBottom: 4 }}>
      {CATEGORY_PICKER_COLORS.map((color) => {
        const selected = value === color;
        return (
          <TouchableOpacity
            key={color}
            onPress={() => onChange(color)}
            accessibilityRole="button"
            accessibilityLabel={`Color ${color}`}
            accessibilityState={{ selected }}
            hitSlop={4}
          >
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? accentColor : 'rgba(0,0,0,0.2)',
              }}
            >
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: color,
                }}
              />
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function EditCategoriesScreen({ onDismiss, onSaved }: EditCategoriesScreenProps) {
  const { colors, fontScale } = usePreferences();
  const [categories, setCategories] = useState<CategoryItem[]>([...BUILTIN_CATEGORIES]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dialogMode, setDialogMode] = useState<'new' | 'edit' | 'delete' | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const [promptColor, setPromptColor] = useState(CATEGORY_PICKER_COLORS[0]);
  const [keyboardPad, setKeyboardPad] = useState(0);

  useEffect(() => {
    void getAllCategories().then((list) => {
      setCategories(list.length > 0 ? list : [...BUILTIN_CATEGORIES]);
      setSelectedIndex(0);
    });
  }, []);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(showEvt, (e) => setKeyboardPad(e.endCoordinates.height));
    const h = Keyboard.addListener(hideEvt, () => setKeyboardPad(0));
    return () => {
      s.remove();
      h.remove();
    };
  }, []);

  const styles = useMemo(() => {
    const fs = (n: number) => scaledFontSize(n, fontScale);
    return StyleSheet.create({
      body: {
        flex: 1,
        paddingHorizontal: 10,
        paddingTop: 10,
        paddingBottom: 6,
      },
      listBox: {
        flex: 1,
        borderWidth: 1,
        borderColor: colors.strongBorder,
        backgroundColor: colors.fieldFill,
      },
      listItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 11,
        paddingHorizontal: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.line,
      },
      listItemSelected: { backgroundColor: colors.daySelectedBg },
      listItemText: {
        fontSize: fs(15),
        color: colors.text,
        fontFamily: 'PixelOperator',
        fontWeight: 'normal',
        flex: 1,
      },
      listItemTextSelected: { color: colors.onAccentBg },
      modalRoot: { flex: 1 },
      modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.backdrop },
      modalCenter: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingVertical: 20,
      },
      modalCard: {
        width: '100%',
        maxWidth: 340,
        backgroundColor: colors.fieldFill,
        borderWidth: 1,
        borderColor: colors.strongBorder,
        paddingHorizontal: 16,
        paddingVertical: 16,
        zIndex: 2,
        elevation: 8,
      },
      modalTitle: {
        fontSize: fs(16),
        color: colors.text,
        marginBottom: 12,
        ...titleFont,
      },
      modalMessage: {
        fontSize: fs(14),
        color: colors.text,
        lineHeight: Math.round(fs(14) * 1.4),
        fontFamily: 'PixelOperator',
        fontWeight: 'normal',
      },
      promptLabel: {
        fontSize: fs(12),
        color: colors.textSecondary,
        marginBottom: 4,
        fontFamily: 'PixelOperator',
        fontWeight: 'normal',
      },
      colorLabel: {
        fontSize: fs(12),
        color: colors.textSecondary,
        marginTop: 8,
        fontFamily: 'PixelOperator',
        fontWeight: 'normal',
      },
      promptInput: {
        fontSize: fs(15),
        color: colors.text,
        fontFamily: 'PixelOperator',
        fontWeight: 'normal',
        paddingVertical: 6,
        minHeight: 36,
      },
      promptActions: { flexDirection: 'row', gap: 8, marginTop: 16, justifyContent: 'flex-end' },
      footer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 8,
        paddingVertical: 10,
      },
      footerBtn: {
        flex: 1,
        paddingVertical: 8,
        paddingHorizontal: 4,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.footerText,
        backgroundColor: colors.screenBackground,
        alignItems: 'center',
      },
      footerBtnText: {
        color: colors.footerText,
        fontSize: fs(13),
        fontFamily: 'PixelOperator',
        fontWeight: 'normal',
      },
      promptBtn: {
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.footerText,
        backgroundColor: colors.screenBackground,
      },
    });
  }, [colors, fontScale]);

  const selected = categories[selectedIndex] ?? null;

  const closeDialog = () => {
    setDialogMode(null);
    setPromptValue('');
    setPromptColor(CATEGORY_PICKER_COLORS[0]);
  };

  const openEditDialog = (mode: 'new' | 'edit') => {
    if (mode === 'edit' && !selected) {
      Alert.alert('Categorías', 'Selecciona una categoría para editar.');
      return;
    }
    setPromptValue(mode === 'edit' && selected ? selected.name : '');
    setPromptColor(mode === 'edit' && selected ? selected.color : nextCustomColor(categories));
    setDialogMode(mode);
  };

  const applyPrompt = (mode: 'new' | 'edit', raw: string, color: string) => {
    const name = raw.trim();
    if (!name) {
      Alert.alert('Categorías', 'Escribe un nombre.');
      return;
    }
    const duplicate = categories.findIndex(
      (c, i) => c.name.toLowerCase() === name.toLowerCase() && (mode === 'new' || i !== selectedIndex)
    );
    if (duplicate >= 0) {
      Alert.alert('Categorías', 'Ya existe una categoría con ese nombre.');
      return;
    }
    if (mode === 'new') {
      setCategories((prev) => [...prev, { name, color, builtIn: false }]);
      setSelectedIndex(categories.length);
    } else if (selected) {
      const oldName = selected.name;
      setCategories((prev) => prev.map((c, i) => (i === selectedIndex ? { ...c, name, color } : c)));
      if (oldName !== name) {
        void renameCategoryInReminders(oldName, name);
      }
    }
    closeDialog();
  };

  const confirmDelete = () => {
    if (!selected || selected.builtIn) {
      closeDialog();
      return;
    }
    const name = selected.name;
    setCategories((prev) => prev.filter((_, i) => i !== selectedIndex));
    setSelectedIndex((i) => Math.max(0, Math.min(i, categories.length - 2)));
    void clearCategoryInReminders(name);
    closeDialog();
  };

  const handleDeletePress = () => {
    if (!selected) return;
    setDialogMode('delete');
  };

  const handleOK = async () => {
    await saveCategories(categories);
    onSaved?.();
    onDismiss();
  };

  const footer = (
    <View style={[styles.footer, Platform.OS === 'android' && keyboardPad > 0 && { marginBottom: keyboardPad }]}>
      <TouchableOpacity style={styles.footerBtn} onPress={() => void handleOK()}>
        <Text style={styles.footerBtnText}>OK</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.footerBtn} onPress={() => openEditDialog('new')}>
        <Text style={styles.footerBtnText}>Nueva</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.footerBtn} onPress={() => openEditDialog('edit')}>
        <Text style={styles.footerBtnText}>Editar</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.footerBtn} onPress={handleDeletePress}>
        <Text style={styles.footerBtnText}>Eliminar</Text>
      </TouchableOpacity>
    </View>
  );

  const listBody = (
    <View style={styles.body}>
      <View style={styles.listBox}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          bounces={false}
        >
          {categories.map((cat, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <TouchableOpacity
                key={`${cat.name}-${idx}`}
                style={[styles.listItem, isSelected && styles.listItemSelected]}
                onPress={() => setSelectedIndex(idx)}
                activeOpacity={0.75}
              >
                <CategoryDot color={cat.color} />
                <Text style={[styles.listItemText, isSelected && styles.listItemTextSelected]}>{cat.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );

  const editDialog =
    dialogMode === 'new' || dialogMode === 'edit' ? (
      <ScreenOverlay zIndex={60}>
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCenter} pointerEvents="box-none">
            <TouchableOpacity
              style={styles.modalBackdrop}
              activeOpacity={1}
              onPress={closeDialog}
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
            />
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                {dialogMode === 'new' ? 'Nueva categoría' : 'Editar categoría'}
              </Text>
              <Text style={styles.promptLabel}>Nombre</Text>
              <TextInput
                style={styles.promptInput}
                value={promptValue}
                onChangeText={setPromptValue}
                autoFocus
                placeholder="Nombre"
                placeholderTextColor={colors.placeholder}
                onSubmitEditing={() => applyPrompt(dialogMode, promptValue, promptColor)}
              />
              <Text style={styles.colorLabel}>Color</Text>
              <CategoryColorPicker
                value={promptColor}
                onChange={setPromptColor}
                accentColor={colors.daySelectedBg}
              />
              <View style={styles.promptActions}>
                <TouchableOpacity style={styles.promptBtn} onPress={closeDialog}>
                  <Text style={styles.footerBtnText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.promptBtn}
                  onPress={() => applyPrompt(dialogMode, promptValue, promptColor)}
                >
                  <Text style={styles.footerBtnText}>OK</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </ScreenOverlay>
    ) : null;

  const deleteDialog =
    dialogMode === 'delete' ? (
      <ScreenOverlay zIndex={60}>
        <View style={styles.modalCenter} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={closeDialog}
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Eliminar categoría</Text>
            <Text style={styles.modalMessage}>
              {selected?.builtIn
                ? 'No se pueden eliminar las categorías predeterminadas.'
                : `¿Eliminar «${selected?.name ?? ''}»? Los eventos quedarán sin esta categoría.`}
            </Text>
            <View style={styles.promptActions}>
              <TouchableOpacity style={styles.promptBtn} onPress={closeDialog}>
                <Text style={styles.footerBtnText}>{selected?.builtIn ? 'OK' : 'Cancelar'}</Text>
              </TouchableOpacity>
              {!selected?.builtIn ? (
                <TouchableOpacity style={styles.promptBtn} onPress={confirmDelete}>
                  <Text style={styles.footerBtnText}>Eliminar</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      </ScreenOverlay>
    ) : null;

  return (
    <View style={{ flex: 1 }}>
      <PalmScreenShell
        title="Editar categorías..."
        onClose={onDismiss}
        contentStyle={{ backgroundColor: colors.screenBackground }}
        footerStyle={{
          backgroundColor: colors.screenBackground,
          borderTopWidth: 0,
        }}
        footer={footer}
      >
        {Platform.OS === 'ios' ? (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
            {listBody}
          </KeyboardAvoidingView>
        ) : (
          listBody
        )}
      </PalmScreenShell>
      {editDialog}
      {deleteDialog}
    </View>
  );
}

/** @deprecated Usar EditCategoriesScreen */
export const EditCategoriesModal = EditCategoriesScreen;
