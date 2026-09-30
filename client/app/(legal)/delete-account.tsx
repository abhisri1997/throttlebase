import { LegalDocumentView } from "../../src/components/LegalDocumentView";
import { ACCOUNT_DELETION } from "../../src/core/legal/accountDeletion";
import { DeleteAccountForm } from "../../src/features/account-deletion/components/DeleteAccountForm";

/**
 * throttlebase.in/delete-account, and Settings → Account → Delete account in
 * the app: one page, open signed in or not, as Google Play requires.
 */
export default function DeleteAccountScreen() {
  return (
    <LegalDocumentView document={ACCOUNT_DELETION}>
      <DeleteAccountForm />
    </LegalDocumentView>
  );
}
