import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { getAccount } from "./src/api";
import { ApprovalsScreen } from "./src/screens/ApprovalsScreen";
import { ProjectsScreen } from "./src/screens/ProjectsScreen";
import { SignInScreen } from "./src/screens/SignInScreen";
import { theme } from "./src/theme";

type Session = "checking" | "signed-out" | "signed-in";
type Tab = "approvals" | "projects";

export default function App() {
  const [session, setSession] = useState<Session>("checking");
  const [tab, setTab] = useState<Tab>("approvals");

  const check = useCallback(async () => {
    try {
      await getAccount();
      setSession("signed-in");
    } catch {
      // Every failure lands on sign-in. An unreachable server and an expired session look the
      // same to a merchant, and linking again is the fix for both.
      setSession("signed-out");
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <StatusBar style="dark" />
        {session === "checking" ? (
          <View style={styles.centre}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : session === "signed-out" ? (
          <SignInScreen onSignedIn={() => setSession("signed-in")} />
        ) : (
          <View style={styles.flex}>
            <View style={styles.tabs}>
              {(["approvals", "projects"] as const).map((value) => {
                const active = tab === value;
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    onPress={() => setTab(value)}
                    style={[styles.tab, active && styles.tabActive]}
                  >
                    <Text style={[styles.tabText, active && styles.tabTextActive]}>
                      {value === "approvals" ? "Decisions" : "Projects"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {tab === "approvals" ? (
              <ApprovalsScreen onSessionLost={() => setSession("signed-out")} />
            ) : (
              <ProjectsScreen onSessionLost={() => setSession("signed-out")} />
            )}
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.paper },
  flex: { flex: 1 },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },
  tabs: { flexDirection: "row", gap: 8, paddingHorizontal: theme.space.lg, paddingTop: theme.space.md },
  tab: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 999, backgroundColor: theme.soft, borderWidth: 1, borderColor: theme.line },
  tabActive: { backgroundColor: theme.ink, borderColor: theme.ink },
  tabText: { color: theme.ink, fontWeight: "700", fontSize: 14 },
  tabTextActive: { color: theme.card },
});
