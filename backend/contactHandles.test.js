const { test } = require("node:test");
const assert = require("node:assert");
const { findContactHandle } = require("./contactHandles");

const flags = (text) => findContactHandle(text) !== null;

test("catches an @handle", () => {
  assert.strictEqual(flags("hmu @divyansh"), true);
  assert.strictEqual(flags("@divyansh_raj"), true);
});

test("catches a named platform followed by a handle", () => {
  assert.strictEqual(flags("ig: divyansh"), true);
  assert.strictEqual(flags("insta divyansh"), true);
  assert.strictEqual(flags("snap - divyansh"), true);
  assert.strictEqual(flags("telegram: dr0408"), true);
  assert.strictEqual(flags("my discord is dr0408"), true);
});

test("catches a phone number in several shapes", () => {
  assert.strictEqual(flags("9876543210"), true);
  assert.strictEqual(flags("+91 98765 43210"), true);
  assert.strictEqual(flags("call me on 98765-43210"), true);
});

test("catches a plain and an obfuscated email", () => {
  assert.strictEqual(flags("divyansh@gmail.com"), true);
  assert.strictEqual(flags("me at gmail dot com"), true);
});

test("does not flag short platform names used as ordinary words", () => {
  // "ig" is "I guess" for most of this app's users, and "fb group project" is
  // a study group. Rejecting those bios is worse than missing a handle.
  const fine = [
    "ig you are right, idk what to say",
    "tbh ig this is fine",
    "fb group project due tmrw",
    "wa a great day honestly",
  ];
  for (const bio of fine) {
    assert.strictEqual(flags(bio), false, `false positive on: ${bio}`);
  }
});

test("still flags a short platform name with a separator or an @", () => {
  assert.strictEqual(flags("ig: divyansh"), true);
  assert.strictEqual(flags("ig @divyansh"), true);
  assert.strictEqual(flags("fb - divyansh raj"), true);
});

test("does not flag ordinary bios", () => {
  const fine = [
    "3rd year, into indie rock and terrible at FIFA",
    "email me later maybe",
    "at the gym at 5",
    "born in 2004, still figuring it out",
    "I rate every cafe out of 10",
    "chess rating 1200 and falling",
    "ask me about space",
  ];
  for (const bio of fine) {
    assert.strictEqual(flags(bio), false, `false positive on: ${bio}`);
  }
});

test("returns the kind of thing it found, for the error message", () => {
  assert.strictEqual(findContactHandle("ig: divyansh"), "social handle");
  assert.strictEqual(findContactHandle("9876543210"), "phone number");
  assert.strictEqual(findContactHandle("me@gmail.com"), "email address");
  assert.strictEqual(findContactHandle("hello there"), null);
});
