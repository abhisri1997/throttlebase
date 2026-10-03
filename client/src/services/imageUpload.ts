import { apiClient } from "../api/client";
import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";

/**
 * Uploads an image from an ImagePicker result to the backend
 */
export async function uploadImage(imageUri: string): Promise<string> {
  const formData = new FormData();
  
  // Extract filename and determine type
  const uriParts = imageUri.split(".");
  const fileType = uriParts[uriParts.length - 1];
  const fileName = imageUri.split("/").pop() || `upload.${fileType}`;

  // React Native's FormData expects this shape for files
  formData.append("image", {
    uri: Platform.OS === "ios" ? imageUri.replace("file://", "") : imageUri,
    name: fileName,
    type: `image/${fileType}`,
  } as any);

  const { data } = await apiClient.post("/api/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return data.url;
}

/**
 * Opens the image picker and returns the URI of the selected image
 */
export async function pickImage(): Promise<string | null> {
  // Request permissions
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    alert("Sorry, we need camera roll permissions to make this work!");
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1], // Default square aspect ratio, can be overridden
    quality: 0.8, // Slight compression
  });

  if (!result.canceled && result.assets && result.assets.length > 0) {
    return result.assets[0].uri;
  }

  return null;
}
