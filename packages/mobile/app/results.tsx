import { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { PLATFORM_CONFIGS, evaluateRizzMaster } from "@rizz/shared";
import type { Platform, PlatformStats, RizzCriterion } from "@rizz/shared";
import { api } from "../lib/api";

export default function ResultsScreen() {
  const { platform } = useLocalSearchParams<{ platform: Platform }>();
  const config = PLATFORM_CONFIGS[platform || "tinder"];
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [criteria, setCriteria] = useState<RizzCriterion[]>([]);
  const [isRizzMaster, setIsRizzMaster] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.fetchStats(platform!);
      setStats(data);
      const result = evaluateRizzMaster(data);
      setCriteria(result.criteria);
      setIsRizzMaster(result.isRizzMaster);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  };

  const disconnect = async () => {
    await api.clearToken();
    router.replace("/");
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={config.primaryColor} />
        <Text style={styles.loadingText}>Evaluating your rizz on {config.name}...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: config.primaryColor }]}>Rizz Master</Text>
        <TouchableOpacity onPress={disconnect} style={styles.disconnectBtn}>
          <Text style={styles.disconnectText}>Disconnect</Text>
        </TouchableOpacity>
      </View>

      {/* Badge */}
      <View style={[styles.badgeCircle, { borderColor: isRizzMaster ? config.primaryColor : "#333" }]}>
        <Text style={styles.badgeEmoji}>{isRizzMaster ? "👑" : "💔"}</Text>
      </View>

      <View style={[styles.statusPill, { backgroundColor: isRizzMaster ? `${config.primaryColor}20` : "rgba(255,255,255,0.05)" }]}>
        <Text style={[styles.statusText, isRizzMaster && { color: config.primaryColor }]}>
          {isRizzMaster ? "RIZZ MASTER" : "Not yet a Rizz Master"}
        </Text>
      </View>

      <Text style={styles.userName}>{stats?.myName || "User"}</Text>
      <Text style={styles.userSub}>
        {isRizzMaster
          ? `Your ${config.name} rizz game is officially certified`
          : "Keep working on your game to earn the title"}
      </Text>

      {/* Criteria */}
      <View style={styles.card}>
        <Text style={styles.cardHeader}>RIZZ MASTER CRITERIA</Text>
        {criteria.map((c, i) => (
          <View key={i} style={styles.criterionRow}>
            <Text style={styles.criterionIcon}>
              {c.icon === "fire" ? "🔥" : c.icon === "chat" ? "💬" : "💗"}
            </Text>
            <View style={styles.criterionInfo}>
              <View style={styles.criterionTop}>
                <Text style={styles.criterionLabel}>{c.label}</Text>
                <Text style={[styles.criterionValue, c.passed && { color: "#22c55e" }]}>
                  {c.actual}/{c.required}
                </Text>
              </View>
              <View style={styles.progressBg}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.min((c.actual / c.required) * 100, 100)}%`,
                      backgroundColor: c.passed ? "#22c55e" : config.primaryColor,
                    },
                  ]}
                />
              </View>
            </View>
            <Text style={styles.checkmark}>{c.passed ? "✓" : "○"}</Text>
          </View>
        ))}
      </View>

      {/* Stats */}
      {stats && (
        <View style={styles.card}>
          <Text style={styles.cardHeader}>YOUR {config.name.toUpperCase()} STATS</Text>
          <View style={styles.statsGrid}>
            <StatCell label="Total Matches" value={stats.totalMatches} />
            <StatCell label="Likes You" value={stats.likesYouCount} />
            <StatCell label="Conversations" value={stats.totalConversations} />
            <StatCell label="You Started" value={stats.conversationsYouStarted} />
            <StatCell label="Got Replies" value={stats.conversationsStartedWithReply} />
            <StatCell label="They Started" value={stats.conversationsTheyStarted} />
            <StatCell label="Reply Rate" value={stats.replyRate !== null ? `${stats.replyRate.toFixed(1)}%` : "—"} />
            <StatCell label="Conv. Rate" value={stats.conversationRate !== null ? `${stats.conversationRate.toFixed(1)}%` : "—"} />
          </View>
        </View>
      )}

      {/* Error */}
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: config.primaryColor }]} onPress={fetchStats}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

function StatCell({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111" },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#111" },
  loadingText: { color: "#666", marginTop: 16, fontSize: 14 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  headerTitle: { fontSize: 20, fontWeight: "800" },
  disconnectBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.05)" },
  disconnectText: { color: "#888", fontSize: 12 },
  badgeCircle: {
    width: 80, height: 80, borderRadius: 40, borderWidth: 3,
    justifyContent: "center", alignItems: "center", alignSelf: "center", marginBottom: 16,
  },
  badgeEmoji: { fontSize: 36 },
  statusPill: {
    alignSelf: "center",
    paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, marginBottom: 8,
  },
  statusText: { fontSize: 12, fontWeight: "700", color: "#888" },
  userName: { fontSize: 24, fontWeight: "700", color: "#fff", textAlign: "center" },
  userSub: { fontSize: 12, color: "#666", textAlign: "center", marginBottom: 24 },
  card: {
    backgroundColor: "#1a1a1a",
    borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.05)",
    marginBottom: 16,
  },
  cardHeader: { fontSize: 10, fontWeight: "600", color: "#666", letterSpacing: 1, marginBottom: 16 },
  criterionRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  criterionIcon: { fontSize: 14, width: 24 },
  criterionInfo: { flex: 1, marginHorizontal: 8 },
  criterionTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  criterionLabel: { fontSize: 12, color: "#ccc" },
  criterionValue: { fontSize: 12, color: "#666", fontFamily: "monospace" },
  progressBg: { height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.05)" },
  progressFill: { height: 4, borderRadius: 2 },
  checkmark: { fontSize: 14, color: "#22c55e", width: 20, textAlign: "center" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statCell: {
    width: "48%",
    backgroundColor: "#111",
    borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.05)",
  },
  statLabel: { fontSize: 9, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 },
  statValue: { fontSize: 18, fontWeight: "700", color: "#fff", marginTop: 2 },
  errorBox: { alignItems: "center", marginTop: 8 },
  errorText: { color: "#f87171", fontSize: 12, marginBottom: 8 },
  retryBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  retryText: { color: "#fff", fontSize: 12, fontWeight: "600" },
});
