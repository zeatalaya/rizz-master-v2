import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { PLATFORM_CONFIGS } from "@rizz/shared";
import type { Platform } from "@rizz/shared";
import { api } from "../lib/api";

type Step = "phone" | "otp" | "token" | "verifying";

export default function LoginScreen() {
  const { platform } = useLocalSearchParams<{ platform: Platform }>();
  const config = PLATFORM_CONFIGS[platform || "tinder"];
  const router = useRouter();

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [manualToken, setManualToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState("");

  const sendCode = async () => {
    const cleaned = phone.replace(/[\s()\-+]/g, "");
    if (cleaned.length < 10) {
      Alert.alert("Error", "Enter a valid phone number with country code");
      return;
    }
    setLoading(true);
    try {
      const data = await api.sendCode(phone.startsWith("+") ? phone : `+${phone}`, platform!);
      if (data.step === "error") throw new Error(data.error);
      setRefreshToken(data.refreshToken || "");
      setStep("otp");
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    if (!code.trim()) return;
    setLoading(true);
    try {
      const data = await api.verifyCode(code.trim(), phone, refreshToken, platform!);
      if (data.step === "error") throw new Error(data.error);
      if (data.step === "login_success") {
        await api.saveToken(data.authToken, platform!);
        setStep("verifying");
        setTimeout(() => router.replace({ pathname: "/results", params: { platform: platform! } }), 800);
        return;
      }
      throw new Error("Unexpected response");
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const submitToken = async () => {
    const cleaned = manualToken.trim().replace(/^["']+|["']+$/g, "").trim();
    if (!cleaned) return;
    setLoading(true);
    try {
      await api.saveToken(cleaned, platform!);
      router.replace({ pathname: "/results", params: { platform: platform! } });
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Invalid token");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* Platform badge */}
      <View style={[styles.iconCircle, { backgroundColor: config.primaryColor }]}>
        <Text style={styles.iconText}>{config.name[0]}</Text>
      </View>

      {step === "phone" && (
        <>
          <Text style={styles.heading}>Verify your identity</Text>
          <Text style={styles.sub}>Enter your {config.name} phone number</Text>

          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+1 (555) 123-4567"
            placeholderTextColor="#444"
            keyboardType="phone-pad"
            autoFocus
          />

          <TouchableOpacity
            style={[styles.button, { backgroundColor: config.primaryColor }, loading && styles.disabled]}
            onPress={sendCode}
            disabled={loading || !phone.trim()}
          >
            <Text style={styles.buttonText}>{loading ? "Sending..." : "Send verification code"}</Text>
          </TouchableOpacity>

          <View style={styles.links}>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.link}>Change platform</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setStep("token")}>
              <Text style={styles.link}>Use token instead</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {step === "otp" && (
        <>
          <Text style={styles.heading}>Enter your code</Text>
          <Text style={styles.sub}>We sent a 6-digit code to {phone}</Text>

          <TextInput
            style={[styles.input, styles.otpInput]}
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            placeholderTextColor="#444"
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
          />

          <TouchableOpacity
            style={[styles.button, { backgroundColor: config.primaryColor }, loading && styles.disabled]}
            onPress={verifyCode}
            disabled={loading || code.length < 6}
          >
            <Text style={styles.buttonText}>{loading ? "Verifying..." : "Verify"}</Text>
          </TouchableOpacity>

          <View style={styles.links}>
            <TouchableOpacity onPress={() => { setStep("phone"); setCode(""); }}>
              <Text style={styles.link}>Change number</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setStep("token")}>
              <Text style={styles.link}>Use token instead</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {step === "token" && (
        <>
          <Text style={styles.heading}>{config.tokenInstructions.title}</Text>
          <Text style={styles.sub}>Paste your token from {config.name}</Text>

          <TextInput
            style={[styles.input, { fontSize: 12 }]}
            value={manualToken}
            onChangeText={setManualToken}
            placeholder="Paste token here"
            placeholderTextColor="#444"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />

          <TouchableOpacity
            style={[styles.button, { backgroundColor: config.primaryColor }, loading && styles.disabled]}
            onPress={submitToken}
            disabled={loading || !manualToken.trim()}
          >
            <Text style={styles.buttonText}>{loading ? "Verifying..." : "Connect"}</Text>
          </TouchableOpacity>

          <View style={styles.instructions}>
            {config.tokenInstructions.steps.map((s, i) => (
              <Text key={i} style={styles.instructionText}>{i + 1}. {s}</Text>
            ))}
            {config.tokenInstructions.code && (
              <View style={styles.codeBlock}>
                <Text style={styles.codeText}>{config.tokenInstructions.code}</Text>
              </View>
            )}
          </View>

          <TouchableOpacity onPress={() => setStep("phone")}>
            <Text style={[styles.link, { textAlign: "center", marginTop: 16 }]}>Back to phone verification</Text>
          </TouchableOpacity>
        </>
      )}

      {step === "verifying" && (
        <View style={styles.verifying}>
          <Text style={styles.heading}>You&apos;re in!</Text>
          <Text style={styles.sub}>Fetching your {config.name} stats...</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111" },
  content: { padding: 20, paddingTop: 80, alignItems: "center" },
  iconCircle: { width: 56, height: 56, borderRadius: 28, justifyContent: "center", alignItems: "center", marginBottom: 20 },
  iconText: { fontSize: 24, fontWeight: "700", color: "#fff" },
  heading: { fontSize: 20, fontWeight: "700", color: "#fff", marginBottom: 4 },
  sub: { fontSize: 12, color: "#666", marginBottom: 24 },
  input: {
    width: "100%",
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    padding: 16,
    color: "#fff",
    fontSize: 18,
    textAlign: "center",
    marginBottom: 16,
  },
  otpInput: { fontSize: 28, letterSpacing: 12, fontFamily: "monospace" },
  button: {
    width: "100%",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 16,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.4 },
  links: { flexDirection: "row", justifyContent: "space-between", width: "100%" },
  link: { fontSize: 12, color: "#666" },
  instructions: {
    width: "100%",
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  instructionText: { fontSize: 11, color: "#888", marginBottom: 6 },
  codeBlock: { backgroundColor: "rgba(0,0,0,0.3)", borderRadius: 8, padding: 8, marginTop: 8 },
  codeText: { fontSize: 10, color: "#22c55e", fontFamily: "monospace" },
  verifying: { alignItems: "center", paddingTop: 60 },
});
