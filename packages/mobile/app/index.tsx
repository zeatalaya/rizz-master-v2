import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { PLATFORM_CONFIGS } from "@rizz/shared";
import type { Platform } from "@rizz/shared";

const PLATFORMS: { key: Platform; emoji: string }[] = [
  { key: "tinder", emoji: "🔥" },
  { key: "bumble", emoji: "🐝" },
  { key: "hinge", emoji: "💜" },
];

export default function PlatformPickerScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Rizz Master</Text>
        <Text style={styles.subtitle}>Choose your platform to check your rizz</Text>
      </View>

      <View style={styles.cards}>
        {PLATFORMS.map(({ key, emoji }) => {
          const config = PLATFORM_CONFIGS[key];
          return (
            <TouchableOpacity
              key={key}
              style={styles.card}
              activeOpacity={0.8}
              onPress={() => router.push({ pathname: "/login", params: { platform: key } })}
            >
              <View style={[styles.iconCircle, { backgroundColor: config.primaryColor }]}>
                <Text style={styles.emoji}>{emoji}</Text>
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{config.name}</Text>
                <Text style={styles.cardSub}>
                  {key === "tinder" && "Phone OTP or token paste"}
                  {key === "bumble" && "Phone OTP or session cookie"}
                  {key === "hinge" && "Phone OTP or Bearer token"}
                </Text>
              </View>
              <Text style={styles.arrow}>›</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.badge}>
        <Text style={styles.badgeText}>🔒 Secure TEE — your credentials never leave the server</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111", paddingHorizontal: 20, paddingTop: 80 },
  header: { alignItems: "center", marginBottom: 40 },
  title: { fontSize: 36, fontWeight: "800", color: "#FD297B" },
  subtitle: { fontSize: 14, color: "#666", marginTop: 8 },
  cards: { gap: 16 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  iconCircle: { width: 56, height: 56, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  emoji: { fontSize: 28 },
  cardText: { flex: 1, marginLeft: 16 },
  cardTitle: { fontSize: 18, fontWeight: "700", color: "#fff" },
  cardSub: { fontSize: 12, color: "#666", marginTop: 2 },
  arrow: { fontSize: 24, color: "#666" },
  badge: {
    marginTop: 32,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(34,197,94,0.1)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.2)",
  },
  badgeText: { fontSize: 10, color: "#22c55e" },
});
