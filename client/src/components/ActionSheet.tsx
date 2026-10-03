import React, { ReactNode } from "react";
import { View, Text, TouchableOpacity, Modal, TouchableWithoutFeedback } from "react-native";
import { useTheme } from "../theme/ThemeContext";

interface ActionSheetProps {
    visible: boolean;
    onClose: () => void;
    title?: ReactNode; // Can pass custom title component or string
    subtitle?: string;
    children: ReactNode;
    showCancel?: boolean;
}

export default function ActionSheet({ 
    visible, 
    onClose, 
    title, 
    subtitle, 
    children, 
    showCancel = true 
}: ActionSheetProps) {
    const { colors } = useTheme();

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableWithoutFeedback onPress={onClose}>
                <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
                    <TouchableWithoutFeedback>
                        <View 
                            className="rounded-t-[32px] px-6 pt-4 pb-10" 
                            style={{ backgroundColor: colors.surface }}
                        >
                            {/* Drag Handle */}
                            <View 
                                className="w-12 h-1.5 rounded-full self-center mb-6" 
                                style={{ backgroundColor: colors.border }} 
                            />

                            {/* Optional Header */}
                            {title && (
                                <View className="mb-6 items-center">
                                    {typeof title === "string" ? (
                                        <Text className="font-bold text-2xl" style={{ color: colors.text }}>
                                            {title}
                                        </Text>
                                    ) : (
                                        title
                                    )}
                                    {subtitle && (
                                        <Text className="text-base mt-2 text-center" style={{ color: colors.textMuted }}>
                                            {subtitle}
                                        </Text>
                                    )}
                                </View>
                            )}

                            {/* Action Items */}
                            {children}

                            {/* Standard Cancel Button */}
                            {showCancel && (
                                <TouchableOpacity 
                                    onPress={onClose}
                                    className="mt-6 py-4 rounded-2xl items-center"
                                    style={{ backgroundColor: colors.bg }}
                                >
                                    <Text className="font-bold text-lg" style={{ color: colors.text }}>
                                        Cancel
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
}

export function ActionSheetItem({
    icon: Icon,
    iconColor,
    title,
    subtitle,
    onPress,
    isLast = false,
    danger = false
}: {
    icon: any;
    iconColor: string;
    title: string;
    subtitle?: string;
    onPress: () => void;
    isLast?: boolean;
    danger?: boolean;
}) {
    const { colors } = useTheme();
    return (
        <TouchableOpacity 
            onPress={onPress}
            className={`flex-row items-center py-4 ${!isLast ? 'border-b' : ''}`}
            style={{ borderBottomColor: colors.border }}
        >
            <View 
                className="w-10 h-10 rounded-full items-center justify-center mr-4" 
                style={{ backgroundColor: `${iconColor}20` }}
            >
                <Icon size={20} color={iconColor} />
            </View>
            <View className="flex-1">
                <Text className="font-bold text-lg" style={{ color: danger ? colors.danger : colors.text }}>
                    {title}
                </Text>
                {subtitle && (
                    <Text className="text-sm mt-0.5 pr-4" style={{ color: colors.textMuted }}>
                        {subtitle}
                    </Text>
                )}
            </View>
        </TouchableOpacity>
    );
}
