import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary early (assuming env variables are loaded)
export const setupCloudinary = () => {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.warn("Cloudinary env variables missing. Image upload will fail.");
  }
  
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "",
    api_key: process.env.CLOUDINARY_API_KEY || "",
    api_secret: process.env.CLOUDINARY_API_SECRET || "",
  });
};

/**
 * Uploads an image buffer to Cloudinary and returns the secure URL
 */
export const uploadImageBuffer = (buffer: Buffer, folder: string = "throttlebase"): Promise<string> => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => {
        if (error) return reject(error);
        if (result) return resolve(result.secure_url);
        reject(new Error("Unknown upload error"));
      }
    );
    stream.end(buffer);
  });
};
