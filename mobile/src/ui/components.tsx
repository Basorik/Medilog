import type { Tag } from "@medilog/engine";
import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius, space, useColors } from "./theme";

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

export const tap = () => {
  if (Platform.OS !== "web") void Haptics.selectionAsync();
};

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const c = useColors();
  const body = <View style={styles.screenInner}>{children}</View>;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.screenScroll} keyboardShouldPersistTaps="handled">
          {body}
        </ScrollView>
      ) : (
        body
      )}
    </View>
  );
}

export function T({ children, style, kind = "body", numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; kind?: "title" | "h2" | "body" | "muted" | "small" | "eyebrow"; numberOfLines?: number }) {
  const c = useColors();
  const base: TextStyle =
    kind === "title"
      ? { fontSize: 28, fontWeight: "700", letterSpacing: -0.4, color: c.ink }
      : kind === "h2"
        ? { fontSize: 18, fontWeight: "700", color: c.ink }
        : kind === "muted"
          ? { fontSize: 15, color: c.muted, lineHeight: 21 }
          : kind === "small"
            ? { fontSize: 13, color: c.ink2, lineHeight: 18 }
            : kind === "eyebrow"
              ? { fontSize: 11.5, fontWeight: "700", letterSpacing: 0.7, textTransform: "uppercase", color: c.muted }
              : { fontSize: 16, color: c.ink, lineHeight: 22 };
  return (
    <Text style={[base, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

export function Button({
  label,
  onPress,
  kind = "primary",
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: "primary" | "ghost" | "danger" | "link";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const bg = kind === "primary" ? c.primary : kind === "danger" ? c.danger : "transparent";
  const fg = kind === "primary" ? c.primaryInk : kind === "danger" ? "#fff" : kind === "link" ? c.primary : c.ink;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        kind === "link" ? styles.link : styles.button,
        { backgroundColor: bg, borderColor: kind === "ghost" ? c.line : "transparent", opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      <Text style={{ color: fg, fontWeight: "600", fontSize: kind === "link" ? 15 : 16, textAlign: "center" }}>{label}</Text>
    </Pressable>
  );
}

export function Pill({ label, onPress, on, tone = "primary" }: { label: string; onPress: () => void; on?: boolean; tone?: "primary" | "neutral" }) {
  const c = useColors();
  const color = tone === "primary" ? c.primary : c.ink2;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!on }}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.pill,
        { borderColor: tone === "primary" || on ? c.primary : c.line, backgroundColor: on ? c.primary : pressed ? c.primarySoft : "transparent" },
      ]}
    >
      <Text style={{ color: on ? c.primaryInk : color, fontWeight: "600", fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }, style]}>{children}</View>;
}

export function Badge({ label, tone }: { label: string; tone: "ai" | "local" | "danger" | "ok" }) {
  const c = useColors();
  const map = { ai: [c.aiSoft, c.ai], local: [c.surface2, c.ink2], danger: [c.accentSoft, c.danger], ok: [c.primarySoft, c.ok] } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 11.5, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

export function TagChip({ tag, edited, onPress }: { tag: Tag; edited?: boolean; onPress?: () => void }) {
  const c = useColors();
  const tone =
    tag.kind === "treatment"
      ? { bg: c.warnSoft, border: c.warnSoft }
      : tag.kind === "severity"
        ? { bg: c.accentSoft, border: c.accentSoft }
        : tag.kind === "functional"
          ? { bg: c.primarySoft, border: c.primarySoft }
          : tag.kind === "negative"
            ? { bg: "transparent", border: c.line }
            : { bg: c.surface2, border: c.line };
  const content = (
    <>
      <Text style={{ fontSize: 13 }}>{tag.emoji}</Text>
      <Text style={{ color: tag.kind === "negative" ? c.ink2 : c.ink, fontSize: 14, fontWeight: tag.kind === "severity" ? "700" : "400" }}>{tag.label}</Text>
      {edited && <Text style={{ color: c.primary, fontWeight: "700" }}>✎</Text>}
    </>
  );
  const style = [styles.tag, { backgroundColor: tone.bg, borderColor: edited ? c.primary : tone.border, borderStyle: tag.kind === "negative" ? ("dashed" as const) : ("solid" as const) }];
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityHint={`Doctor sees: ${tag.clinical}`} onPress={onPress} style={style}>
      {content}
    </Pressable>
  ) : (
    <View style={style}>{content}</View>
  );
}

export function Row({ children, style, gap = space.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: "row", flexWrap: "wrap", gap }, style]}>{children}</View>;
}

export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close">
        <View style={[StyleSheet.absoluteFill, styles.backdrop]} />
      </Pressable>
      <View style={[styles.sheet, { backgroundColor: c.bg, paddingBottom: insets.bottom + space.lg }]}>
        <View style={[styles.handle, { backgroundColor: c.line }]} />
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <T kind="h2">{title}</T>
          <Button kind="link" label="Done" onPress={onClose} />
        </View>
        {children}
      </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screenScroll: { flexGrow: 1 },
  screenInner: { padding: space.lg, paddingBottom: space.xl * 2, gap: space.lg, width: "100%", maxWidth: 640, alignSelf: "center" },
  button: { borderWidth: 1, borderRadius: radius.md, paddingVertical: 13, paddingHorizontal: space.lg, alignItems: "center" },
  link: { paddingVertical: 6 },
  pill: { borderWidth: 1.5, borderRadius: radius.pill, paddingVertical: 9, paddingHorizontal: 15 },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: space.md, gap: space.sm },
  badge: { borderRadius: radius.pill, paddingVertical: 2, paddingHorizontal: 8, alignSelf: "flex-start" },
  tag: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 10 },
  backdrop: { backgroundColor: "rgba(10,10,14,0.4)" },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: space.lg, gap: space.md },
  handle: { width: 40, height: 4, borderRadius: 4, alignSelf: "center" },
});
