import { LegalDocumentView } from "../../src/components/LegalDocumentView";
import { TERMS } from "../../src/core/legal/terms";

/** throttlebase.in/terms — open to everyone, signed in or not. */
export default function TermsScreen() {
  return <LegalDocumentView document={TERMS} />;
}
