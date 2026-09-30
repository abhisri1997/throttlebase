import React, { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "../../../theme/ThemeContext";
import { formatDistance, formatDuration } from "../../navigation/core/format";
import {
  fetchRoutePreview,
  saveRideAsRoute,
  type RoutePreview,
  type RouteVisibility,
} from "../api/rideRoute";
import {
  initialStopEdits,
  keptStopsForSave,
  stopChoiceDetail,
  type StopChoice,
  type StopEdit,
} from "../core/stopChoices";
import { splitPlaceName } from "../../routes/core/routeSummary";
import { PUBLIC_ROUTE_ENDS_NOTICE, PUBLIC_ROUTE_NOTICE } from "../../routes/core/routeOwner";
import {
  MAX_ROUTE_TITLE_LENGTH,
  MAX_STOP_NOTE_LENGTH,
  ROUTE_HIGHLIGHTS,
  saveRouteErrorMessage,
  suggestedRouteTitle,
  toggleHighlight,
  validRouteTitle,
  type RouteHighlight,
} from "../core/saveRoute";

interface SaveRouteSheetProps {
  rideId: string;
  rideTitle: string | undefined;
  onClose: () => void;
  onOpenRoute: (routeId: string) => void;
}

/** Same limit as the server's. */
const MAX_STOP_NAME_LENGTH = 255;

const VISIBILITY_OPTIONS: { value: RouteVisibility; label: string; hint: string }[] = [
  { value: "public", label: "Public", hint: "Anyone can find it in Routes and ride it." },
  { value: "private", label: "Only me", hint: "Listed in your Routes; nobody else sees it." },
];

/**
 * The save sheet: loads what the route would be, then lets the rider name it,
 * say why it's good and add notes to its stops. Everything but the name is
 * optional.
 */
export function SaveRouteSheet({ rideId, rideTitle, onClose, onOpenRoute }: SaveRouteSheetProps) {
  const { colors } = useTheme();
  const preview = useQuery({
    queryKey: ["route-preview", rideId],
    queryFn: () => fetchRoutePreview(rideId),
    retry: false,
  });

  if (preview.isPending) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.hint, { color: colors.textMuted }]}>Working out where this route goes…</Text>
      </View>
    );
  }

  if (preview.isError) {
    return (
      <View style={styles.centered}>
        <Text accessibilityLiveRegion='polite' style={[styles.body, { color: colors.text }]}>
          {saveRouteErrorMessage(preview.error)}
        </Text>
        <SheetButton label='Close' onPress={onClose} />
      </View>
    );
  }

  if (preview.data.saved_route_id) {
    const routeId = preview.data.saved_route_id;
    return (
      <View style={styles.centered}>
        <Text style={[styles.title, { color: colors.text }]}>You already saved this ride</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>Each ride can be saved as one route.</Text>
        <SheetButton label='View route' primary onPress={() => onOpenRoute(routeId)} />
      </View>
    );
  }

  return (
    <SaveRouteForm
      rideId={rideId}
      preview={preview.data}
      initialTitle={suggestedRouteTitle(preview.data.start_name, preview.data.end_name, rideTitle)}
      onClose={onClose}
      onSaved={onOpenRoute}
    />
  );
}

interface SaveRouteFormProps {
  rideId: string;
  preview: RoutePreview;
  initialTitle: string;
  onClose: () => void;
  onSaved: (routeId: string) => void;
}

/** A server older than this app lists only the planned stops ridden past. */
const choicesOf = (preview: RoutePreview): StopChoice[] =>
  preview.stop_choices ??
  preview.stops.map((stop) => ({
    key: `planned:${stop.ride_stop_id}`,
    kind: "planned",
    status: "visited",
    ride_stop_id: stop.ride_stop_id,
    name: stop.name,
    distance_from_start_km: stop.distance_from_start_km,
    stopped_s: null,
    walked_away: false,
    suggested: true,
  }));

function SaveRouteForm({ rideId, preview, initialTitle, onClose, onSaved }: SaveRouteFormProps) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(initialTitle);
  const [highlights, setHighlights] = useState<RouteHighlight[]>([]);
  const [choices] = useState<StopChoice[]>(() => choicesOf(preview));
  const [stopEdits, setStopEdits] = useState<Record<string, StopEdit>>(() => initialStopEdits(choices));
  const [visibility, setVisibility] = useState<RouteVisibility>("public");

  const editStop = (key: string, change: Partial<StopEdit>) =>
    setStopEdits((current) => ({ ...current, [key]: { ...current[key]!, ...change } }));

  const save = useMutation({
    mutationFn: (validTitle: string) =>
      saveRideAsRoute(rideId, {
        title: validTitle,
        visibility,
        highlights,
        stops: keptStopsForSave(choices, stopEdits),
      }),
    onSuccess: ({ route }) => {
      void queryClient.invalidateQueries({ queryKey: ["routes"] });
      void queryClient.invalidateQueries({ queryKey: ["route-preview", rideId] });
      onSaved(route.id);
    },
  });

  const validTitle = validRouteTitle(title);
  const canSave = validTitle !== null && !save.isPending;
  const summary = [
    preview.start_name && preview.end_name ? `${preview.start_name} → ${preview.end_name}` : null,
    formatDistance(preview.distance_km * 1000),
    formatDuration(preview.duration_s),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps='handled'>
      <Text style={[styles.title, { color: colors.text }]}>Save as route</Text>
      <Text style={[styles.hint, { color: colors.textMuted }]}>{summary}</Text>

      <Text style={[styles.label, { color: colors.textMuted }]}>Name</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        maxLength={MAX_ROUTE_TITLE_LENGTH}
        accessibilityLabel='Route name'
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.bg }]}
      />

      <Text style={[styles.label, { color: colors.textMuted }]}>What makes this route good? · optional</Text>
      <View style={styles.chips}>
        {ROUTE_HIGHLIGHTS.map((highlight) => {
          const isPicked = highlights.includes(highlight.value);
          return (
            <TouchableOpacity
              key={highlight.value}
              accessibilityRole='checkbox'
              accessibilityState={{ checked: isPicked }}
              onPress={() => setHighlights((picked) => toggleHighlight(picked, highlight.value))}
              style={[
                styles.chip,
                { borderColor: isPicked ? colors.primary : colors.border },
                isPicked ? { backgroundColor: colors.primary + "1A" } : null,
              ]}
            >
              <Text style={[styles.chipText, { color: isPicked ? colors.primary : colors.textMuted }]}>
                {highlight.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {choices.length > 0 ? (
        <>
          <Text style={[styles.label, { color: colors.textMuted }]}>Stops · tick the ones worth keeping</Text>
          {choices.map((choice) => (
            <StopChoiceRow
              key={choice.key}
              choice={choice}
              edit={stopEdits[choice.key]!}
              onChange={(change) => editStop(choice.key, change)}
            />
          ))}
        </>
      ) : null}

      <Text style={[styles.label, { color: colors.textMuted }]}>Who can see it</Text>
      {VISIBILITY_OPTIONS.map((option) => {
        const isSelected = option.value === visibility;
        return (
          <TouchableOpacity
            key={option.value}
            accessibilityRole='radio'
            accessibilityState={{ selected: isSelected }}
            onPress={() => setVisibility(option.value)}
            style={[styles.option, { borderColor: isSelected ? colors.primary : colors.border }]}
          >
            <Text style={[styles.optionLabel, { color: colors.text }]}>{option.label}</Text>
            <Text style={[styles.hint, { color: colors.textMuted }]}>{option.hint}</Text>
          </TouchableOpacity>
        );
      })}

      {visibility === "public" ? (
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          {PUBLIC_ROUTE_ENDS_NOTICE} {PUBLIC_ROUTE_NOTICE}
        </Text>
      ) : null}

      {save.isError ? (
        <Text accessibilityLiveRegion='polite' style={[styles.error, { color: colors.danger }]}>
          {saveRouteErrorMessage(save.error)}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <SheetButton label='Cancel' onPress={onClose} />
        <SheetButton
          label={save.isPending ? "Saving…" : "Save route"}
          primary
          disabled={!canSave}
          onPress={() => validTitle && save.mutate(validTitle)}
        />
      </View>
    </ScrollView>
  );
}

interface StopChoiceRowProps {
  choice: StopChoice;
  edit: StopEdit;
  onChange: (change: Partial<StopEdit>) => void;
}

/** One stop: keep it or not, what happened there, and the rider's note (and name, for one they found). */
function StopChoiceRow({ choice, edit, onChange }: StopChoiceRowProps) {
  const { colors } = useTheme();
  const isSkipped = choice.status === "skipped";
  const isFound = choice.kind === "discovered";
  const place = splitPlaceName(choice.name ?? (isFound ? "A stop you found" : "Stop"));

  return (
    <View style={[styles.stop, { borderColor: colors.border, opacity: isSkipped ? 0.6 : 1 }]}>
      <TouchableOpacity
        accessibilityRole='checkbox'
        accessibilityState={{ checked: edit.kept, disabled: isSkipped }}
        accessibilityLabel={`${place.name}. ${stopChoiceDetail(choice)}`}
        disabled={isSkipped}
        onPress={() => onChange({ kept: !edit.kept })}
        style={styles.stopHeader}
      >
        {isSkipped ? null : (
          <View
            style={[
              styles.checkbox,
              { borderColor: edit.kept ? colors.primary : colors.border },
              edit.kept ? { backgroundColor: colors.primary } : null,
            ]}
          >
            {edit.kept ? <Text style={styles.checkmark}>✓</Text> : null}
          </View>
        )}
        <View style={styles.stopText}>
          <Text style={[styles.stopName, { color: colors.text }]} numberOfLines={1}>
            {isFound ? "New: " : ""}
            {place.name}
          </Text>
          <Text style={[styles.hint, { color: colors.textMuted }]}>{stopChoiceDetail(choice)}</Text>
        </View>
      </TouchableOpacity>
      {edit.kept && !isSkipped ? (
        <>
          {isFound ? (
            <TextInput
              value={edit.name}
              onChangeText={(name) => onChange({ name })}
              maxLength={MAX_STOP_NAME_LENGTH}
              placeholder={`Name it (${place.name})`}
              placeholderTextColor={colors.textMuted}
              accessibilityLabel='Name for this stop'
              style={[styles.noteInput, { color: colors.text, borderColor: colors.border }]}
            />
          ) : null}
          <TextInput
            value={edit.note}
            onChangeText={(note) => onChange({ note })}
            maxLength={MAX_STOP_NOTE_LENGTH}
            placeholder='Note · optional, e.g. Park at the gate'
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={`Note for ${place.name}`}
            style={[styles.noteInput, { color: colors.text, borderColor: colors.border }]}
          />
        </>
      ) : null}
    </View>
  );
}

function SheetButton({
  label,
  onPress,
  primary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      accessibilityRole='button'
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        primary
          ? { backgroundColor: colors.primary, opacity: disabled ? 0.6 : 1, flex: 1 }
          : { borderWidth: 1, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.buttonText, { color: primary ? "#ffffff" : colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  centered: { padding: 24, gap: 12, alignItems: "center" },
  form: { padding: 20, paddingBottom: 32, gap: 6 },
  title: { fontSize: 17, fontWeight: "700" },
  body: { fontSize: 14, textAlign: "center" },
  hint: { fontSize: 12 },
  label: { fontSize: 12, fontWeight: "600", marginTop: 14, marginBottom: 2 },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 15 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, minHeight: 36, justifyContent: "center" },
  chipText: { fontSize: 13, fontWeight: "600" },
  stop: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 6, marginBottom: 6 },
  stopHeader: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 },
  stopText: { flex: 1, gap: 2 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  checkmark: { color: "white", fontSize: 13, fontWeight: "800" },
  stopName: { fontSize: 14, fontWeight: "600" },
  noteInput: { minHeight: 40, borderTopWidth: 1, borderStyle: "dashed", paddingTop: 6, fontSize: 14 },
  option: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 6 },
  optionLabel: { fontSize: 15, fontWeight: "600" },
  error: { fontSize: 13, marginTop: 8 },
  actions: { flexDirection: "row", gap: 12, marginTop: 16 },
  button: { minHeight: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  buttonText: { fontSize: 15, fontWeight: "700" },
});
