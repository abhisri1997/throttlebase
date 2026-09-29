import test from "node:test";
import assert from "node:assert/strict";
import { leaveGroupPrompt } from "./leaveGroupPrompt";

test("a member is simply asked to confirm", () => {
  const prompt = leaveGroupPrompt({ name: "Weekend riders" });
  assert.equal(prompt.title, "Leave Weekend riders?");
  assert.equal(prompt.confirmLabel, "Leave");
  assert.doesNotMatch(prompt.message, /admin|deleted/);
});

test("the owner is told who takes over", () => {
  const prompt = leaveGroupPrompt({ name: "Weekend riders", next_admin: { display_name: "Asha" } });
  assert.match(prompt.message, /Asha will become the admin/);
  assert.equal(prompt.confirmLabel, "Leave");
});

test("the only member is warned that leaving deletes the group", () => {
  const prompt = leaveGroupPrompt({ name: "Weekend riders", next_admin: null });
  assert.match(prompt.message, /only member/);
  assert.match(prompt.message, /deleted/);
  assert.equal(prompt.confirmLabel, "Leave and delete");
});
