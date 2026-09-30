import { LegalDocumentView } from "../../src/components/LegalDocumentView";
import { GRIEVANCE } from "../../src/core/legal/grievance";

/** throttlebase.in/grievance — open to everyone, signed in or not. */
export default function GrievanceScreen() {
  return <LegalDocumentView document={GRIEVANCE} />;
}
