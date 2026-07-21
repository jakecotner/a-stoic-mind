/**
 * Daily practice reminder via a LOCAL notification — scheduled on-device, no
 * push infrastructure. expo-notifications is a native module that is NOT in
 * the currently installed dev build, so it's loaded dynamically and every
 * entry point fails soft (returns false) until the next EAS build includes it.
 */

async function notifications() {
  return await import('expo-notifications');
}

/** Schedule (or reschedule) the daily reminder. Returns false when the
    native module or permission is unavailable. */
export async function scheduleDailyReminder(timeHHMM: string): Promise<boolean> {
  try {
    const N = await notifications();
    const perm = await N.requestPermissionsAsync();
    if (!perm.granted) return false;
    await N.cancelAllScheduledNotificationsAsync();
    const [hour, minute] = timeHHMM.split(':').map(Number);
    await N.scheduleNotificationAsync({
      content: {
        title: 'The Stoa awaits',
        body: "Today's passage is ready. A few minutes of reading and reflection.",
      },
      trigger: {
        type: N.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function cancelReminders(): Promise<void> {
  try {
    const N = await notifications();
    await N.cancelAllScheduledNotificationsAsync();
  } catch {
    /* module not in this build yet */
  }
}

/** Whether a daily reminder is currently scheduled on this device. */
export async function reminderScheduled(): Promise<boolean> {
  try {
    const N = await notifications();
    return (await N.getAllScheduledNotificationsAsync()).length > 0;
  } catch {
    return false;
  }
}
