import { LegalDocumentView } from "../../src/components/LegalDocumentView";
import { PRIVACY_POLICY } from "../../src/core/legal/privacyPolicy";

/** throttlebase.in/privacy — open to everyone, signed in or not. */
export default function PrivacyPolicyScreen() {
  return <LegalDocumentView document={PRIVACY_POLICY} />;
}
