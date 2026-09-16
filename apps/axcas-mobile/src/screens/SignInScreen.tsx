import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AxcasApiError, pollLinkStatus, requestWhatsAppLink, type StudioIntent } from "../api";
import { LINK_POLL_INTERVAL_MS, LINK_POLL_TIMEOUT_MS } from "../config";
import { theme } from "../theme";

const INTENTS: Array<{ value: StudioIntent; title: string; detail: string }> = [
  { value: "website", title: "A website", detail: "One page with your work, prices, and a WhatsApp order button." },
  { value: "reels", title: "Reels", detail: "Short vertical videos made from photos you already have." },
  { value: "both", title: "Both", detail: "A website and reels from the same set of details." },
];

/**
 * Sign-in reuses the WhatsApp link flow the web Studio already uses. The app asks the Worker
 * for a short code, opens WhatsApp with it prefilled, then polls until the merchant sends it.
 * Two factors by construction: this device holds the link cookie, their phone holds the code.
 */
export function SignInScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [intent, setIntent] = useState<StudioIntent>("website");
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef(0);

  const stopWaiting = useCallback(() => {
    setWaiting(false);
    startedAt.current = 0;
  }, []);

  useEffect(() => {
    if (!waiting) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      if (cancelled) return;
      if (Date.now() - startedAt.current > LINK_POLL_TIMEOUT_MS) {
        stopWaiting();
        setError("That sign-in link expired. Tap Continue with WhatsApp to get a new one.");
        return;
      }
      try {
        const result = await pollLinkStatus();
        if (result && !cancelled) {
          cancelled = true;
          stopWaiting();
          onSignedIn();
        }
      } catch (caught) {
        if (cancelled) return;
        cancelled = true;
        stopWaiting();
        setError(caught instanceof AxcasApiError ? caught.message : "Could not complete sign-in. Try again.");
      }
    }, LINK_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [waiting, onSignedIn, stopWaiting]);

  async function startLink() {
    setError(null);
    try {
      const link = await requestWhatsAppLink(intent);
      startedAt.current = Date.now();
      setWaiting(true);
      const opened = await Linking.canOpenURL(link.whatsappUrl);
      if (!opened) {
        stopWaiting();
        setError("WhatsApp is not installed on this device. Install it, then try again.");
        return;
      }
      await Linking.openURL(link.whatsappUrl);
    } catch (caught) {
      stopWaiting();
      setError(caught instanceof AxcasApiError ? caught.message : "Could not start sign-in. Try again.");
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>AXCAS</Text>
      <Text style={styles.title}>Your business, set up from WhatsApp.</Text>
      <Text style={styles.lede}>Tell Axcas what you need. You approve everything before it goes live.</Text>

      <Text style={styles.sectionLabel}>What would you like?</Text>
      {INTENTS.map((option) => {
        const selected = option.value === intent;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => setIntent(option.value)}
            style={[styles.choice, selected && styles.choiceSelected]}
          >
            <Text style={styles.choiceTitle}>{option.title}</Text>
            <Text style={styles.choiceDetail}>{option.detail}</Text>
          </Pressable>
        );
      })}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {waiting ? (
        <View style={styles.waiting}>
          <ActivityIndicator color={theme.accent} />
          <Text style={styles.waitingText}>Waiting for your WhatsApp message…</Text>
          <Pressable onPress={stopWaiting} accessibilityRole="button">
            <Text style={styles.secondaryAction}>Cancel</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable accessibilityRole="button" onPress={startLink} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Continue with WhatsApp</Text>
        </Pressable>
      )}

      <Text style={styles.fine}>
        Axcas opens WhatsApp with a short code already written. Send it, and this device is linked to the same
        workspace. No password, and no email address.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.space.lg, paddingBottom: theme.space.xl, backgroundColor: theme.paper, flexGrow: 1 },
  eyebrow: { color: theme.accent, fontWeight: "800", letterSpacing: 2, fontSize: 12, marginBottom: theme.space.sm },
  title: { color: theme.ink, fontSize: 32, fontWeight: "700", lineHeight: 38, marginBottom: theme.space.sm },
  lede: { color: theme.muted, fontSize: 16, lineHeight: 24, marginBottom: theme.space.lg },
  sectionLabel: { color: theme.ink, fontWeight: "700", fontSize: 15, marginBottom: theme.space.sm },
  choice: { backgroundColor: theme.card, borderColor: theme.line, borderWidth: 1, borderRadius: theme.radius, padding: theme.space.md, marginBottom: theme.space.sm },
  choiceSelected: { borderColor: theme.ink, borderWidth: 2 },
  choiceTitle: { color: theme.ink, fontWeight: "700", fontSize: 16, marginBottom: 2 },
  choiceDetail: { color: theme.muted, fontSize: 14, lineHeight: 20 },
  primaryButton: { backgroundColor: theme.ink, borderRadius: 999, paddingVertical: 16, alignItems: "center", marginTop: theme.space.md },
  primaryButtonText: { color: theme.card, fontWeight: "800", fontSize: 16 },
  waiting: { alignItems: "center", gap: theme.space.sm, marginTop: theme.space.lg },
  waitingText: { color: theme.muted, fontSize: 15 },
  secondaryAction: { color: theme.accent, fontWeight: "700", fontSize: 15, paddingVertical: theme.space.xs },
  error: { color: theme.danger, fontSize: 14, lineHeight: 20, marginTop: theme.space.sm },
  fine: { color: theme.muted, fontSize: 13, lineHeight: 19, marginTop: theme.space.lg },
});
