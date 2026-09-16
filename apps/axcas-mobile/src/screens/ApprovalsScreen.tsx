import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { AxcasApiError, decideApproval, isUnauthorized, listApprovals, type Approval, type ApprovalType } from "../api";
import { theme } from "../theme";

/**
 * Decision labels per approval type. The generic Approve/Deny pair the WhatsApp buttons use
 * says nothing about what is about to happen; a merchant tapping "Publish" knows exactly what
 * they are agreeing to. The consequence line inside the checklist still spells it out.
 */
const ACTIONS: Record<ApprovalType, { confirm: string; decline: string }> = {
  release: { confirm: "Publish", decline: "Change" },
  reel: { confirm: "Make it", decline: "Change" },
  call_batch: { confirm: "Start calls", decline: "Not now" },
  social_campaign: { confirm: "Schedule", decline: "Not now" },
};

function expiryLabel(expiresAt: number): string {
  const hours = Math.round((expiresAt - Date.now()) / 3_600_000);
  if (hours <= 0) return "Expires soon";
  if (hours === 1) return "Expires in about an hour";
  if (hours < 24) return `Expires in about ${hours} hours`;
  return "Expires tomorrow";
}

export function ApprovalsScreen({ onSessionLost }: { onSessionLost: () => void }) {
  const [approvals, setApprovals] = useState<Approval[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const result = await listApprovals();
      setApprovals(result.approvals);
    } catch (caught) {
      if (isUnauthorized(caught)) {
        onSessionLost();
        return;
      }
      setApprovals([]);
      setError(caught instanceof AxcasApiError ? caught.message : "Could not load your decisions.");
    }
  }, [onSessionLost]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(approval: Approval, decision: "approved" | "denied") {
    setBusyId(approval.approvalId);
    setError(null);
    setOutcome(null);
    try {
      const result = await decideApproval(approval.approvalId, decision);
      if (result.stage === "published") setOutcome("Your website is live.");
      else if (result.stage === "rendering") setOutcome("Your reel is being made. It will arrive on WhatsApp.");
      else if (result.stage === "declined") setOutcome("Nothing was changed.");
      else setOutcome("Saved. Axcas is finishing up.");
      await load();
    } catch (caught) {
      if (isUnauthorized(caught)) {
        onSessionLost();
        return;
      }
      setError(caught instanceof AxcasApiError ? caught.message : "Could not save that decision.");
    } finally {
      setBusyId(null);
    }
  }

  if (approvals === null) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <Text style={styles.title}>Your decisions</Text>
      {outcome ? <Text style={styles.outcome}>{outcome}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {approvals.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing needs you right now.</Text>
          <Text style={styles.emptyDetail}>
            When Axcas has a website, reel, or set of calls ready, it appears here and on WhatsApp. Pull down to
            check again.
          </Text>
        </View>
      ) : (
        approvals.map((approval) => {
          const actions = ACTIONS[approval.type];
          const busy = busyId === approval.approvalId;
          return (
            <View key={approval.approvalId} style={styles.card}>
              <Text style={styles.checklist}>{approval.checklist ?? "Axcas has something ready for you to review."}</Text>
              <Text style={styles.expiry}>{expiryLabel(approval.expiresAt)}</Text>
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => void decide(approval, "approved")}
                  style={[styles.confirmButton, busy && styles.buttonBusy]}
                >
                  <Text style={styles.confirmText}>{busy ? "Saving…" : actions.confirm}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => void decide(approval, "denied")}
                  style={[styles.declineButton, busy && styles.buttonBusy]}
                >
                  <Text style={styles.declineText}>{actions.decline}</Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.space.lg, backgroundColor: theme.paper, flexGrow: 1 },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.paper },
  title: { color: theme.ink, fontSize: 26, fontWeight: "700", marginBottom: theme.space.md },
  card: { backgroundColor: theme.card, borderColor: theme.line, borderWidth: 1, borderRadius: theme.radius, padding: theme.space.md, marginBottom: theme.space.md },
  checklist: { color: theme.ink, fontSize: 15, lineHeight: 23 },
  expiry: { color: theme.muted, fontSize: 13, marginTop: theme.space.sm },
  actions: { flexDirection: "row", gap: theme.space.sm, marginTop: theme.space.md },
  confirmButton: { backgroundColor: theme.ink, borderRadius: 999, paddingVertical: 13, paddingHorizontal: 22, flexGrow: 1, alignItems: "center" },
  confirmText: { color: theme.card, fontWeight: "800", fontSize: 15 },
  declineButton: { backgroundColor: theme.soft, borderColor: theme.line, borderWidth: 1, borderRadius: 999, paddingVertical: 13, paddingHorizontal: 22, alignItems: "center" },
  declineText: { color: theme.ink, fontWeight: "700", fontSize: 15 },
  buttonBusy: { opacity: 0.6 },
  empty: { backgroundColor: theme.soft, borderRadius: theme.radius, padding: theme.space.lg },
  emptyTitle: { color: theme.ink, fontWeight: "700", fontSize: 16, marginBottom: theme.space.xs },
  emptyDetail: { color: theme.muted, fontSize: 14, lineHeight: 21 },
  outcome: { color: theme.success, fontSize: 15, marginBottom: theme.space.sm },
  error: { color: theme.danger, fontSize: 14, lineHeight: 20, marginBottom: theme.space.sm },
});
