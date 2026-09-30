import test from "node:test";
import assert from "node:assert/strict";
import { generateSealingKeyPair, keyIdOf, openBox, sealText } from "./sealedBox.js";

const keys = generateSealingKeyPair();
const otherKeys = generateSealingKeyPair();

test("what is sealed with the public key opens with the private key", () => {
  const box = sealText('{"email":"asha@example.test"}', keys.publicKeyPem);
  assert.equal(openBox(box, keys.privateKeyPem), '{"email":"asha@example.test"}');
});

test("the sealed box doesn't contain the text it seals", () => {
  const box = sealText("asha@example.test", keys.publicKeyPem);
  assert.equal(JSON.stringify(box).includes("asha@example.test"), false);
  // A fresh key per box: sealing the same text twice gives different boxes.
  assert.notDeepEqual(sealText("asha@example.test", keys.publicKeyPem), box);
});

test("another key can't open it", () => {
  const box = sealText("secret", keys.publicKeyPem);
  assert.throws(() => openBox(box, otherKeys.privateKeyPem));
});

test("a box that was tampered with won't open", () => {
  const box = sealText("secret", keys.publicKeyPem);
  const bytes = Buffer.from(box.ciphertext, "base64");
  bytes[0] = bytes[0]! ^ 0xff;
  assert.throws(() => openBox({ ...box, ciphertext: bytes.toString("base64") }, keys.privateKeyPem));
});

test("each key has its own stable id, so a record names the key that sealed it", () => {
  assert.equal(keyIdOf(keys.publicKeyPem), keyIdOf(keys.publicKeyPem));
  assert.notEqual(keyIdOf(keys.publicKeyPem), keyIdOf(otherKeys.publicKeyPem));
  assert.match(keyIdOf(keys.publicKeyPem), /^[0-9a-f]{16}$/);
  // The id is the same whether it's read from the public or the private key.
  assert.equal(keyIdOf(keys.privateKeyPem), keyIdOf(keys.publicKeyPem));
});
