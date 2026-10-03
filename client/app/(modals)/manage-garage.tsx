import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCurrentRider, CURRENT_RIDER_KEY } from "../../src/services/useCurrentRider";
import { useTheme } from "../../src/theme/ThemeContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../src/api/client";
import BikeCard from "../../src/components/BikeCard";
import ActionSheet, { ActionSheetItem } from "../../src/components/ActionSheet";
import { Plus, Edit2, Trash2 } from "lucide-react-native";
import { ModalHeader } from "../../src/components/ModalHeader";

export default function ManageGarageModal() {
    const { colors } = useTheme();
    const router = useRouter();
    const { rider, isLoading } = useCurrentRider();

    const [selectedVehicle, setSelectedVehicle] = useState<any | null>(null);

    const queryClient = useQueryClient();

    const deleteMutation = useMutation({
        mutationFn: async (vehicleId: string) => {
            const { data } = await apiClient.delete(`/api/garage/vehicle/${vehicleId}`);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: CURRENT_RIDER_KEY });
            setSelectedVehicle(null);
        }
    });

    const handleEdit = () => {
        if (!selectedVehicle) return;
        router.push({
            pathname: "/(modals)/add-vehicle",
            params: { editVehicle: JSON.stringify(selectedVehicle) }
        });
        setSelectedVehicle(null);
    };

    const handleDelete = () => {
        if (selectedVehicle?.id) {
            deleteMutation.mutate(selectedVehicle.id);
        }
    };

    return (
        <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }}>
            <ModalHeader
                title="Manage Garage"
                leftAction={{ label: "Done", onPress: () => router.back() }}
            />

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
                                <BikeCard 
                                    vehicle={v} 
                                    onMenuPress={() => setSelectedVehicle(v)} 
                                />
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

            {/* Bottom Sheet Modal */}
            <ActionSheet
                visible={!!selectedVehicle}
                onClose={() => setSelectedVehicle(null)}
                title={
                    <View className="items-center">
                        <Text 
                            className="text-xs font-bold uppercase tracking-widest mb-1" 
                            style={{ color: colors.textMuted, letterSpacing: 2 }}
                        >
                            {selectedVehicle?.make}
                        </Text>
                        <Text className="font-bold text-2xl" style={{ color: colors.text }}>
                            {selectedVehicle?.model}
                        </Text>
                    </View>
                }
            >
                <ActionSheetItem 
                    icon={Edit2}
                    iconColor={colors.primary}
                    title="Edit Vehicle"
                    onPress={handleEdit}
                />
                <ActionSheetItem 
                    icon={Trash2}
                    iconColor={colors.danger}
                    title="Remove Vehicle"
                    onPress={handleDelete}
                    danger
                    isLast
                />
            </ActionSheet>
        </SafeAreaView>
    );
}