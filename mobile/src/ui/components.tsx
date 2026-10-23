import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import type { ComponentProps, ReactNode } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius, space, type, useColors } from "./theme";

export type IconName = ComponentProps<typeof Ionicons>["name"];
export { Ionicons as Icon };

export const tap = () => {
  if (Platform.OS !== "web") void Haptics.selectionAsync();
};

/** Native confirm dialog (Alert has no web implementation, so the preview uses window.confirm). */
export function confirm(title: string, message: string, action: string, onConfirm: () => void) {
  if (Platform.OS === "web") {
    if ((globalThis as { confirm?: (m: string) => boolean }).confirm?.(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: action, style: "destructive", onPress: onConfirm },
  ]);
}

// ---------------------------------------------------------------- text

type TextKind = keyof typeof type | "secondary";

export function T({ children, kind = "body", style, numberOfLines }: { children: ReactNode; kind?: TextKind; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const c = useColors();
  const base = kind === "secondary" ? { ...type.callout, color: c.muted } : kind === "caption" || kind === "label" ? { ...type[kind], color: c.muted } : { ...type[kind], color: c.ink };
  return (
    <Text style={[base, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------- layout

/** Page container. `safeTop` is off for screens that sit under a native header. */
export function Screen({ children, scroll = true, safeTop = true }: { children: ReactNode; scroll?: boolean; safeTop?: boolean }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const inner = <View style={[styles.screenInner, { paddingTop: (safeTop ? insets.top : 0) + space.md }]}>{children}</View>;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {scroll ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </View>
  );
}

export function SettingsButton() {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Settings" hitSlop={12} onPress={() => router.push("/settings")} style={[styles.iconButton, { backgroundColor: c.fill }]}>
      <Ionicons name="settings-outline" size={19} color={c.ink2} />
    </Pressable>
  );
}

/** Large title at the top of a tab, with a quiet subtitle and the settings button. */
export function Header({ title, subtitle, settings = true }: { title: string; subtitle?: string; settings?: boolean }) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1, gap: 2 }}>
        <T kind="largeTitle">{title}</T>
        {subtitle && <T kind="secondary">{subtitle}</T>}
      </View>
      {settings && <SettingsButton />}
    </View>
  );
}

export function Card({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const c = useColors();
  return <View style={[styles.card, { backgroundColor: c.card }, padded && styles.cardPadded, style]}>{children}</View>;
}

/** A labelled group: small heading, a card, optional footnote. */
export function Section({ title, footer, children, card = true }: { title?: string; footer?: string; children: ReactNode; card?: boolean }) {
  return (
    <View style={{ gap: space.sm }}>
      {title && <T kind="label" style={{ paddingHorizontal: space.xs }}>{title}</T>}
      {card ? <Card padded={false}>{children}</Card> : children}
      {footer && <T kind="caption" style={{ paddingHorizontal: space.xs }}>{footer}</T>}
    </View>
  );
}

export function Divider({ inset = space.lg }: { inset?: number }) {
  const c = useColors();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginLeft: inset }} />;
}

/** A list row inside a Section card. */
export function Row({
  icon,
  title,
  detail,
  right,
  onPress,
  tone = "default",
}: {
  icon?: IconName;
  title: string;
  detail?: string;
  right?: ReactNode;
  onPress?: () => void;
  tone?: "default" | "danger" | "primary";
}) {
  const c = useColors();
  const color = tone === "danger" ? c.danger : tone === "primary" ? c.primary : c.ink;
  const body = (
    <>
      {icon && <Ionicons name={icon} size={20} color={tone === "default" ? c.ink2 : color} style={{ width: 24 }} />}
      <View style={{ flex: 1, gap: 2 }}>
        <T style={{ color }}>{title}</T>
        {detail && <T kind="caption">{detail}</T>}
      </View>
      {right}
      {onPress && !right && <Ionicons name="chevron-forward" size={18} color={c.muted} />}
    </>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.fill }]}
    >
      {body}
    </Pressable>
  ) : (
    <View style={styles.row}>{body}</View>
  );
}

// ---------------------------------------------------------------- controls

export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "plain" | "destructive";
  icon?: IconName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const bg = variant === "primary" ? c.primary : variant === "secondary" ? c.primarySoft : variant === "destructive" ? c.accentSoft : "transparent";
  const fg = variant === "primary" ? c.primaryInk : variant === "destructive" ? c.danger : c.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.button, variant === "plain" && styles.buttonPlain, { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 }, style]}
    >
      {icon && <Ionicons name={icon} size={18} color={fg} />}
      <Text style={[type.headline, { color: fg, fontSize: variant === "plain" ? 16 : 17 }]}>{label}</Text>
    </Pressable>
  );
}

/** Full-width answer option: big, easy to hit with a thumb when unwell. */
export function Choice({ label, onPress, selected }: { label: string; onPress: () => void; selected?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.choice, { backgroundColor: selected ? c.primary : pressed ? c.primarySoft : c.fill }]}
    >
      <Text style={[type.body, { color: selected ? c.primaryInk : c.ink, fontWeight: "500" }]}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<V extends string | number>({ options, value, onChange }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  const c = useColors();
  return (
    <View style={[styles.segmented, { backgroundColor: c.fill }]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              tap();
              onChange(o.value);
            }}
            style={[styles.segment, on && [styles.segmentOn, { backgroundColor: c.card }]]}
          >
            <Text numberOfLines={1} style={[type.caption, { fontSize: 14, fontWeight: on ? "600" : "500", color: on ? c.ink : c.ink2 }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, onPress, edited }: { label: string; onPress?: () => void; edited?: boolean }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" disabled={!onPress} onPress={onPress} style={[styles.chip, { backgroundColor: c.fill, borderColor: edited ? c.primary : "transparent" }]}>
      <Text style={[type.callout, { color: c.ink }]}>{label}</Text>
      {edited && <Ionicons name="pencil" size={12} color={c.primary} />}
    </Pressable>
  );
}

/** Worst severity as a small number badge; colour deepens with severity. */
export function SeverityBadge({ value }: { value: number | null }) {
  const c = useColors();
  if (value === null) return null;
  const [bg, fg] = value >= 7 ? [c.accentSoft, c.accent] : value >= 4 ? [c.warnSoft, c.warn] : [c.fill, c.ink2];
  return (
    <View style={[styles.severity, { backgroundColor: bg }]} accessibilityLabel={`Severity ${value} out of 10`}>
      <Text style={[type.label, { color: fg, fontSize: 14 }]}>{value}</Text>
    </View>
  );
}

export function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onChange(!checked)} style={{ flexDirection: "row", gap: space.md, alignItems: "flex-start" }}>
      <View style={[styles.checkbox, { borderColor: checked ? c.primary : c.muted, backgroundColor: checked ? c.primary : "transparent" }]}>
        {checked && <Ionicons name="checkmark" size={16} color={c.primaryInk} />}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  );
}

export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close">
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(10,10,14,0.35)" }]} />
        </Pressable>
        <View style={[styles.sheet, { backgroundColor: c.bg, paddingBottom: insets.bottom + space.lg }]}>
          <View style={[styles.handle, { backgroundColor: c.line }]} />
          <View style={styles.sheetHead}>
            <T kind="title" style={{ flex: 1 }}>
              {title}
            </T>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} onPress={onClose} style={[styles.iconButton, { backgroundColor: c.fill }]}>
              <Ionicons name="close" size={18} color={c.ink2} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: space.lg, paddingBottom: space.sm }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screenInner: { paddingHorizontal: 20, paddingBottom: 48, gap: 28, width: "100%", maxWidth: 640, alignSelf: "center" },
  header: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  iconButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginTop: 2 },
  card: { borderRadius: radius.lg, overflow: "hidden" },
  cardPadded: { padding: space.lg, gap: space.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: 14, minHeight: 52 },
  button: { flexDirection: "row", gap: space.sm, alignItems: "center", justifyContent: "center", borderRadius: radius.md, paddingVertical: 15, paddingHorizontal: space.xl },
  buttonPlain: { paddingVertical: 8, paddingHorizontal: space.sm, alignSelf: "center" },
  choice: { borderRadius: radius.md, paddingVertical: 15, paddingHorizontal: space.lg },
  segmented: { flexDirection: "row", borderRadius: 12, padding: 3 },
  segment: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 9 },
  segmentOn: { shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 13, borderWidth: 1.5 },
  severity: { minWidth: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, alignItems: "center", justifyContent: "center", marginTop: 1 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: space.sm, gap: space.md, maxHeight: "88%" },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  handle: { width: 38, height: 5, borderRadius: 3, alignSelf: "center", marginBottom: space.xs },
});
