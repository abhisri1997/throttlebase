import React, { useState, useEffect, useRef } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../src/api/client";
import { useTheme } from "../../src/theme/ThemeContext";
import { CURRENT_RIDER_KEY } from "../../src/services/useCurrentRider";
import { ChevronDown, ChevronUp } from "lucide-react-native";

interface Brand {
    id: string;
    name: string;
}

interface Model {
    id: string;
    name: string;
    brand_id: string;
    image_url: string | null;
    cc: string;
}

export default function AddVehicleModal() {
    const { colors } = useTheme();
    const router = useRouter();
    const { editVehicle } = useLocalSearchParams<{ editVehicle?: string }>();
    const [editMode, setEditMode] = useState(false);
    const [vehicleId, setVehicleId] = useState<string | null>(null);

    // Selections & Manual Entries
    const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
    const [isOtherBrand, setIsOtherBrand] = useState(false);
    const [customBrand, setCustomBrand] = useState("");

    const [selectedModel, setSelectedModel] = useState<Model | null>(null);
    const [isOtherModel, setIsOtherModel] = useState(false);
    const [customModel, setCustomModel] = useState("");

    const [engineCc, setEngineCc] = useState("");
    const [year, setYear] = useState("");

    // Dropdown states
    const [isBrandOpen, setIsBrandOpen] = useState(false);
    const [isModelOpen, setIsModelOpen] = useState(false);

    const queryClient = useQueryClient();

    // Fetch Brands
    const { data: brands = [], isLoading: brandsLoading } = useQuery({
        queryKey: ["vehicleBrands"],
        queryFn: async () => {
            const { data } = await apiClient.get("/api/garage-suggestion/vehicle-brand");
            return data as Brand[];
        },
    });

    // Fetch Models based on selected brand
    const { data: models = [], isLoading: modelsLoading, isFetching: modelsFetching, isSuccess: modelsSuccess } = useQuery({
        queryKey: ["vehicleModels", selectedBrand?.id],
        queryFn: async () => {
            if (!selectedBrand || isOtherBrand) return [];
            const { data } = await apiClient.get(`/api/garage-suggestion/vehicle-model/${selectedBrand.id}`);
            return data as Model[];
        },
        enabled: !!selectedBrand && !isOtherBrand,
    });

    const hasInitializedBrand = useRef(false);
    const hasInitializedModel = useRef(false);

    // Populate Edit Mode - Phase 1 (Brand)
    useEffect(() => {
        if (editVehicle && brands.length > 0 && !hasInitializedBrand.current) {
            try {
                const v = JSON.parse(editVehicle);
                setEditMode(true);
                setVehicleId(v.id);
                
                const matchingBrand = brands.find(b => b.name.toLowerCase() === v.make?.toLowerCase());
                if (matchingBrand) {
                    setSelectedBrand(matchingBrand);
                    setIsOtherBrand(false);
                } else {
                    setCustomBrand(v.make || "");
                    setIsOtherBrand(true);
                    // If it's a custom brand, we can just set custom model immediately
                    setCustomModel(v.model || "");
                    setIsOtherModel(true);
                    hasInitializedModel.current = true;
                }
                
                if (v.year) setYear(v.year.toString());
                if (v.engine_capacity_cc) setEngineCc(v.engine_capacity_cc.toString());
                
                hasInitializedBrand.current = true;
            } catch (e) {
                console.error("Failed to parse editVehicle", e);
            }
        }
    }, [editVehicle, brands]);

    // Populate Edit Mode - Phase 2 (Model)
    useEffect(() => {
        if (editVehicle && modelsSuccess && !hasInitializedModel.current) {
            try {
                const v = JSON.parse(editVehicle as string);
                const matchingModel = models.find(m => m.name.toLowerCase() === v.model?.toLowerCase());
                if (matchingModel) {
                    setSelectedModel(matchingModel);
                    setIsOtherModel(false);
                } else {
                    setCustomModel(v.model || "");
                    setIsOtherModel(true);
                }
                hasInitializedModel.current = true;
            } catch (e) {
                console.error("Failed to parse editVehicle model phase", e);
            }
        }
    }, [editVehicle, models, modelsSuccess]);

    // Save Vehicle Mutation (Create or Update)
    const saveVehicleMutation = useMutation({
        mutationFn: async (payload: any) => {
            if (editMode && vehicleId) {
                const { data } = await apiClient.put(`/api/garage/vehicle/${vehicleId}`, payload);
                return data;
            } else {
                const { data } = await apiClient.post("/api/garage/vehicle", payload);
                return data;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: CURRENT_RIDER_KEY });
            router.back();
        },
        onError: (error) => {
            console.error("Failed to save vehicle:", error);
        }
    });



    // Update CC when model is selected
    useEffect(() => {
        if (selectedModel && !isOtherModel) {
            if (selectedModel.cc && selectedModel.cc !== "N/A" && selectedModel.cc !== "0") {
                setEngineCc(selectedModel.cc);
            } else {
                setEngineCc("");
            }
        }
    }, [selectedModel, isOtherModel]);

    const handleSave = () => {
        const payload = {
            make: isOtherBrand ? customBrand : selectedBrand?.name,
            model: isOtherModel ? customModel : selectedModel?.name,
            year: year ? parseInt(year) : undefined,
            engine_capacity_cc: engineCc ? parseInt(engineCc) : undefined,
        };

        saveVehicleMutation.mutate(payload);
    };

    const isSaveDisabled =
        (isOtherBrand ? !customBrand : !selectedBrand) ||
        (isOtherModel ? !customModel : !selectedModel);

    return (
        <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }}>
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                className="flex-1"
            >
                <View
                    className="flex-row items-center justify-between p-4 border-b"
                    style={{
                        borderBottomColor: colors.border,
                        backgroundColor: colors.surface,
                    }}
                >
                    <TouchableOpacity onPress={() => router.back()} hitSlop={20}>
                        <Text className="font-bold text-lg" style={{ color: colors.textMuted }}>
                            Cancel
                        </Text>
                    </TouchableOpacity>
                    <Text className="font-bold text-lg" style={{ color: colors.text }}>
                        {editMode ? "Edit Vehicle" : "Add Vehicle"}
                    </Text>
                    <TouchableOpacity onPress={handleSave} disabled={isSaveDisabled || saveVehicleMutation.isPending}>
                        {saveVehicleMutation.isPending ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                            <Text
                                className="font-bold text-lg"
                                style={{ color: isSaveDisabled ? colors.textMuted : colors.primary }}
                            >
                                Save
                            </Text>
                        )}
                    </TouchableOpacity>
                </View>

                <ScrollView className="flex-1 px-4 pt-6" keyboardShouldPersistTaps="handled">

                    <View className="mb-4">
                        <Text className="text-sm font-bold uppercase mb-2" style={{ color: colors.textMuted }}>
                            Brand / Make
                        </Text>
                        <TouchableOpacity
                            onPress={() => { setIsBrandOpen(!isBrandOpen); setIsModelOpen(false); }}
                            className="p-4 rounded-xl flex-row justify-between items-center"
                            style={{
                                backgroundColor: colors.inputBg,
                                borderWidth: 1,
                                borderColor: isBrandOpen ? colors.primary : colors.border,
                            }}
                        >
                            <Text style={{ color: selectedBrand || isOtherBrand ? colors.text : colors.textMuted }}>
                                {isOtherBrand ? "Other" : (selectedBrand?.name || "Select Brand")}
                            </Text>
                            {brandsLoading ? (
                                <ActivityIndicator size="small" color={colors.primary} />
                            ) : isBrandOpen ? (
                                <ChevronUp color={colors.textMuted} size={20} />
                            ) : (
                                <ChevronDown color={colors.textMuted} size={20} />
                            )}
                        </TouchableOpacity>

                        {isBrandOpen && (
                            <View
                                className="mt-2 rounded-xl overflow-hidden"
                                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, maxHeight: 250 }}
                            >
                                <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                                    {brands.map((brand) => (
                                        <TouchableOpacity
                                            key={brand.id}
                                            onPress={() => {
                                                setSelectedBrand(brand);
                                                setIsOtherBrand(false);
                                                setIsBrandOpen(false);
                                                setSelectedModel(null);
                                                setIsOtherModel(false);
                                                setCustomModel("");
                                            }}
                                            className="p-4 border-b"
                                            style={{ borderBottomColor: colors.border }}
                                        >
                                            <Text style={{ color: colors.text }}>{brand.name}</Text>
                                        </TouchableOpacity>
                                    ))}
                                    <TouchableOpacity
                                        onPress={() => {
                                            setIsOtherBrand(true);
                                            setSelectedBrand(null);
                                            setIsBrandOpen(false);
                                            setIsOtherModel(true); // Automatically set model to custom if brand is custom
                                            setSelectedModel(null);
                                        }}
                                        className="p-4"
                                        style={{ backgroundColor: colors.inputBg }}
                                    >
                                        <Text className="font-bold" style={{ color: colors.primary }}>Other (Type manually)</Text>
                                    </TouchableOpacity>
                                </ScrollView>
                            </View>
                        )}
                    </View>

                    {isOtherBrand && (
                        <TextInput
                            className="p-4 rounded-xl mb-4"
                            style={{ backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, color: colors.text }}
                            placeholder="Enter Custom Brand"
                            placeholderTextColor={colors.textMuted}
                            value={customBrand}
                            onChangeText={setCustomBrand}
                        />
                    )}

                    <View className="mb-4">
                        <Text className="text-sm font-bold uppercase mb-2" style={{ color: colors.textMuted }}>
                            Model
                        </Text>
                        <TouchableOpacity
                            onPress={() => { setIsModelOpen(!isModelOpen); setIsBrandOpen(false); }}
                            disabled={!selectedBrand && !isOtherBrand}
                            className="p-4 rounded-xl flex-row justify-between items-center"
                            style={{
                                backgroundColor: colors.inputBg,
                                borderWidth: 1,
                                borderColor: isModelOpen ? colors.primary : colors.border,
                                opacity: (!selectedBrand && !isOtherBrand) ? 0.5 : 1,
                            }}
                        >
                            <Text style={{ color: selectedModel || isOtherModel ? colors.text : colors.textMuted }}>
                                {isOtherModel ? "Other" : (selectedModel?.name || "Select Model")}
                            </Text>
                            {(modelsLoading || modelsFetching) ? (
                                <ActivityIndicator size="small" color={colors.primary} />
                            ) : isModelOpen ? (
                                <ChevronUp color={colors.textMuted} size={20} />
                            ) : (
                                <ChevronDown color={colors.textMuted} size={20} />
                            )}
                        </TouchableOpacity>

                        {isModelOpen && !isOtherBrand && (
                            <View
                                className="mt-2 rounded-xl overflow-hidden"
                                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, maxHeight: 250 }}
                            >
                                <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                                    {models.map((model) => (
                                        <TouchableOpacity
                                            key={model.id}
                                            onPress={() => {
                                                setSelectedModel(model);
                                                setIsOtherModel(false);
                                                setIsModelOpen(false);
                                            }}
                                            className="p-4 border-b"
                                            style={{ borderBottomColor: colors.border }}
                                        >
                                            <Text style={{ color: colors.text }}>{model.name}</Text>
                                        </TouchableOpacity>
                                    ))}
                                    <TouchableOpacity
                                        onPress={() => {
                                            setIsOtherModel(true);
                                            setSelectedModel(null);
                                            setIsModelOpen(false);
                                        }}
                                        className="p-4"
                                        style={{ backgroundColor: colors.inputBg }}
                                    >
                                        <Text className="font-bold" style={{ color: colors.primary }}>Other (Type manually)</Text>
                                    </TouchableOpacity>
                                </ScrollView>
                            </View>
                        )}
                    </View>

                    {isOtherModel && (
                        <TextInput
                            className="p-4 rounded-xl mb-4"
                            style={{ backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, color: colors.text }}
                            placeholder="Enter Custom Model"
                            placeholderTextColor={colors.textMuted}
                            value={customModel}
                            onChangeText={setCustomModel}
                        />
                    )}

                    <Text className="text-sm font-bold uppercase mb-2" style={{ color: colors.textMuted }}>
                        Engine Capacity (CC) — Optional
                    </Text>
                    <TextInput
                        className="p-4 rounded-xl mb-4"
                        style={{ backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, color: colors.text }}
                        placeholder="e.g. 400"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="numeric"
                        value={engineCc}
                        onChangeText={setEngineCc}
                    />

                    <Text className="text-sm font-bold uppercase mb-2" style={{ color: colors.textMuted }}>
                        Year — Optional
                    </Text>
                    <TextInput
                        className="p-4 rounded-xl mb-12"
                        style={{ backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, color: colors.text }}
                        placeholder="e.g. 2023"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="numeric"
                        value={year}
                        onChangeText={setYear}
                        maxLength={4}
                    />

                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}