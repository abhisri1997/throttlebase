import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { useTheme } from "../../../theme/ThemeContext";
import { useAccountDeletion } from "../hooks/useAccountDeletion";

const CODE_LENGTH = 6;

/** Loose check before asking the server; it validates the address properly. */
const looksLikeEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

interface MessageProps {
  text: string;
  color: string;
}

function Message({ text, color }: MessageProps) {
  return (
    <Text className="text-base leading-6 mb-4" style={{ color }}>
      {text}
    </Text>
  );
}

interface TextLinkProps {
  label: string;
  color: string;
  disabled: boolean;
  onPress: () => void;
}

function TextLink({ label, color, disabled, onPress }: TextLinkProps) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} className="py-3 items-center" accessibilityRole="button">
      <Text style={{ color }}>{label}</Text>
    </TouchableOpacity>
  );
}

/** The form on /delete-account: ask for a code, enter it, confirm. */
export function DeleteAccountForm() {
  const { colors } = useTheme();
  const flow = useAccountDeletion();
  const isBusy = flow.busy !== null;
  const address = flow.email ?? "the address on your account";

  const link = (label: string, onPress: () => void) => (
    <TextLink label={label} color={colors.primary} disabled={isBusy} onPress={onPress} />
  );

  const body = (() => {
    switch (flow.stage) {
      case "deleted":
        return (
          <Message
            color={colors.text}
            text="Your account is deleted. You've been signed out everywhere, and your data will be deleted as described below."
          />
        );
      case "no-account":
        return (
          <>
            <Message color={colors.text} text={`There's no ThrottleBase account at ${address}, so nothing was deleted.`} />
            {link("Try a different address", flow.startOver)}
          </>
        );
      case "code":
        return (
          <>
            <Message
              color={colors.text}
              text={
                flow.isSignedIn
                  ? `We emailed a ${CODE_LENGTH}-digit code to ${address}.`
                  : `If ${address} has a ThrottleBase account, we've emailed it a ${CODE_LENGTH}-digit code.`
              }
            />
            <Input
              label="Code"
              value={flow.code}
              onChangeText={flow.setCode}
              placeholder="123456"
              keyboardType="number-pad"
              maxLength={CODE_LENGTH}
              autoComplete="one-time-code"
              editable={!isBusy}
            />
            <Button
              title="Delete my account"
              variant="danger"
              onPress={() => void flow.deleteAccount()}
              isLoading={flow.busy === "deleting"}
              disabled={isBusy || flow.code.trim().length < CODE_LENGTH}
            />
            {link(flow.busy === "sending" ? "Sending…" : "Send a new code", () => void flow.sendCode())}
            {flow.isSignedIn ? null : link("Use a different address", flow.startOver)}
          </>
        );
      case "start":
        return (
          <>
            {flow.isSignedIn ? (
              <Message color={colors.text} text={`We'll email a code to ${address} to confirm it's you.`} />
            ) : (
              <Input
                label="Email address on your account"
                value={flow.typedEmail}
                onChangeText={flow.setTypedEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                editable={!isBusy}
              />
            )}
            <Button
              title="Email me a code"
              onPress={() => void flow.sendCode()}
              isLoading={flow.busy === "sending"}
              disabled={isBusy || (!flow.isSignedIn && !looksLikeEmail(flow.typedEmail))}
            />
          </>
        );
    }
  })();

  return (
    <View
      className="rounded-xl p-4 mb-6"
      style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.danger }}
    >
      {body}
      {flow.error ? (
        <Text className="mt-3" style={{ color: colors.danger }} accessibilityLiveRegion="polite">
          {flow.error}
        </Text>
      ) : null}
    </View>
  );
}
