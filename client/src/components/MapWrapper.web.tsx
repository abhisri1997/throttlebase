import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

export const Marker = (props: any) => null;
export const Polyline = (props: any) => null;

const MapView = ({ children, style, ...props }: any) => {
  const { colors } = useTheme();

  return (
    <View
      style={[
        style,
        {
          backgroundColor: colors.surface,
          justifyContent: 'center',
          alignItems: 'center',
          borderColor: colors.border,
          borderWidth: 1,
        },
      ]}
      {...props}
    >
      <Text style={{ color: colors.textMuted, fontWeight: 'bold' }}>Interactive Map Unavailable</Text>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>This feature uses native GPS rendering.</Text>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>Please switch to the iOS or Android App.</Text>
    </View>
  );
};

export default MapView;
