import React from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCurrentRider } from "../../src/services/useCurrentRider";
import { useTheme } from "../../src/theme/ThemeContext";
import BikeCard from "../../src/components/BikeCard";
import { Plus } from "lucide-react-native";

export default function ManageGarageModal() {
    const { colors } = useTheme();
    const router = useRouter();
    const { rider, isLoading } = useCurrentRider();

    return (
        <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }}>
            <View
                className="flex-row items-center justify-between p-4 border-b"
                style={{
                    borderBottomColor: colors.border,
                    backgroundColor: colors.surface,
                }}
            >
                <TouchableOpacity onPress={() => router.back()} hitSlop={20}>
                    <Text className="font-bold text-lg" style={{ color: colors.textMuted }}>
                        Done
                    </Text>
                </TouchableOpacity>
                <Text className="font-bold text-lg" style={{ color: colors.text }}>
                    Manage Garage
                </Text>
                <View style={{ width: 40 }} />
            </View>

            {isLoading ? (
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : (
                <ScrollView className="flex-1 px-4 pt-6" contentContainerStyle={{ paddingBottom: 40 }}>
                    <Text
                        className="text-sm font-bold uppercase mb-4"
                        style={{ color: colors.textMuted }}
                    >
                        Your Vehicles
                    </Text>

                    {Array.isArray(rider?.vehicles) && rider.vehicles.length > 0 ? (
                        rider.vehicles.map((v: any, i: number) => (
                            <View key={i} className="mb-6 relative">
                                <BikeCard vehicle={v} />

                                <View className="flex-row justify-end mt-2">
                                    <TouchableOpacity>
                                        <Text style={{ color: colors.primary, fontWeight: 'bold' }}>
                                            Edit
                                        </Text>
                                    </TouchableOpacity>
                                    <Text style={{ color: colors.textMuted, marginHorizontal: 10 }}>|</Text>
                                    <TouchableOpacity>
                                        <Text style={{ color: "#ef4444", fontWeight: 'bold' }}>
                                            Remove
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))
                    ) : (
                        <Text className="text-center italic mt-4" style={{ color: colors.textMuted }}>
                            No vehicles in your garage.
                        </Text>
                    )}

                    <TouchableOpacity
                        onPress={() => router.push("/(modals)/add-vehicle" as any)}
                        className="mt-6 p-4 rounded-xl flex-row justify-center items-center"
                        style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' }}
                    >
                        <Plus color={colors.text} size={20} className="mr-2" />
                        <Text className="font-bold" style={{ color: colors.text }}>
                            Add Another Vehicle
                        </Text>
                    </TouchableOpacity>
                </ScrollView>
            )}
        </SafeAreaView>
    );
}