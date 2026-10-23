import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import { Platform } from "react-native";

// A single, local daily nudge. Scheduled on the phone; no push server and no
// device token ever leave the device.

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

const PROMPTS = [
  "How's your body today? Ten seconds is enough.",
  "Anything to note today? Even “a good day” helps your doctor.",
  "Quick check-in: pain, energy, sleep. Tap and speak.",
];

/** Returns false if the user declined notification permission. */
export async function scheduleReminder({ enabled, hour }: { enabled: boolean; hour: number }): Promise<boolean> {
  if (Platform.OS === "web") return false;
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!enabled) return true;

  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return false;

  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("daily", { name: "Daily check-in", importance: AndroidImportance.DEFAULT });

  await Notifications.scheduleNotificationAsync({
    content: { title: "Medilog", body: PROMPTS[new Date().getDate() % PROMPTS.length] },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute: 0, channelId: "daily" },
  });
  return true;
}
