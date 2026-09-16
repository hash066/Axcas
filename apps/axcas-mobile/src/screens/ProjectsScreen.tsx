import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { AxcasApiError, getAccount, isUnauthorized, signOut, type Account, type Project } from "../api";
import { theme } from "../theme";

const INTENT_LABELS: Record<Project["intent"], string> = {
  website: "Website",
  reels: "Reels",
  both: "Website and reels",
};

function savedLabel(project: Project): string {
  const where = project.source === "whatsapp" ? "Saved from WhatsApp" : "Saved in Studio";
  return `${where} · ${INTENT_LABELS[project.intent]}`;
}

export function ProjectsScreen({ onSessionLost }: { onSessionLost: () => void }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const result = await getAccount();
      setAccount(result.account);
      setProjects(result.projects);
    } catch (caught) {
      if (isUnauthorized(caught)) {
        onSessionLost();
        return;
      }
      setProjects([]);
      setError(caught instanceof AxcasApiError ? caught.message : "Could not load your projects.");
    }
  }, [onSessionLost]);

  useEffect(() => {
    void load();
  }, [load]);

  if (projects === null) {
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
      <Text style={styles.eyebrow}>SIGNED IN WITH WHATSAPP</Text>
      <Text style={styles.title}>{account?.displayName ?? "Your Axcas workspace"}</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.sectionLabel}>Your projects</Text>
      {projects.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing saved yet.</Text>
          <Text style={styles.emptyDetail}>
            Send Axcas a voice note, your prices, and a few photos on WhatsApp. What you send appears here.
          </Text>
        </View>
      ) : (
        projects.map((project) => (
          <View key={`${project.projectId}:${project.revisionId}`} style={styles.card}>
            <Text style={styles.cardTitle}>{project.project.businessName ?? "Untitled project"}</Text>
            {project.project.description ? (
              <Text style={styles.cardDetail} numberOfLines={2}>
                {project.project.description}
              </Text>
            ) : null}
            <Text style={styles.cardMeta}>{savedLabel(project)}</Text>
          </View>
        ))
      )}

      <Pressable
        accessibilityRole="button"
        onPress={async () => {
          try {
            await signOut();
          } catch {
            // Signing out locally is still the right outcome if the request fails.
          }
          onSessionLost();
        }}
        style={styles.signOut}
      >
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.space.lg, backgroundColor: theme.paper, flexGrow: 1 },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.paper },
  eyebrow: { color: theme.accent, fontWeight: "800", letterSpacing: 1.5, fontSize: 11, marginBottom: theme.space.xs },
  title: { color: theme.ink, fontSize: 26, fontWeight: "700", marginBottom: theme.space.lg },
  sectionLabel: { color: theme.ink, fontWeight: "700", fontSize: 15, marginBottom: theme.space.sm },
  card: { backgroundColor: theme.card, borderColor: theme.line, borderWidth: 1, borderRadius: theme.radius, padding: theme.space.md, marginBottom: theme.space.sm },
  cardTitle: { color: theme.ink, fontWeight: "700", fontSize: 16, marginBottom: 2 },
  cardDetail: { color: theme.muted, fontSize: 14, lineHeight: 20, marginBottom: theme.space.xs },
  cardMeta: { color: theme.muted, fontSize: 12 },
  empty: { backgroundColor: theme.soft, borderRadius: theme.radius, padding: theme.space.lg },
  emptyTitle: { color: theme.ink, fontWeight: "700", fontSize: 16, marginBottom: theme.space.xs },
  emptyDetail: { color: theme.muted, fontSize: 14, lineHeight: 21 },
  error: { color: theme.danger, fontSize: 14, lineHeight: 20, marginBottom: theme.space.sm },
  signOut: { marginTop: theme.space.xl, alignSelf: "flex-start" },
  signOutText: { color: theme.accent, fontWeight: "700", fontSize: 15 },
});
