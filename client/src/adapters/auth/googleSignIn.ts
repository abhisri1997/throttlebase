import {
  GoogleSignin,
  statusCodes,
} from "@react-native-google-signin/google-signin";

/**
 * Native Google sign-in.
 *
 * Only the ID token leaves this file. The backend verifies it against
 * Google's JWKS and issues our own token, so nothing downstream ever handles
 * a Google credential.
 */

export class SignInCancelledError extends Error {
  constructor() {
    super("Sign-in was cancelled");
    this.name = "SignInCancelledError";
  }
}

let configured = false;

const configure = (): void => {
  if (configured) return;

  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!webClientId) {
    throw new Error("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not set");
  }

  GoogleSignin.configure({
    // Requesting the web client id is what makes Google mint an ID token our
    // backend can accept, rather than only a platform-scoped one.
    webClientId,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    offlineAccess: false,
  });

  configured = true;
};

export const signInWithGoogleNatively = async (): Promise<string> => {
  configure();

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();

    const idToken =
      response.type === "success" ? response.data.idToken : null;

    if (!idToken) {
      throw new SignInCancelledError();
    }

    return idToken;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === statusCodes.SIGN_IN_CANCELLED
    ) {
      throw new SignInCancelledError();
    }
    throw error;
  }
};

export const signOutOfGoogle = async (): Promise<void> => {
  try {
    configure();
    await GoogleSignin.signOut();
  } catch {
    // Clearing the provider's own session is best-effort: our session is
    // already gone, and failing here would block the rider from signing out.
  }
};
