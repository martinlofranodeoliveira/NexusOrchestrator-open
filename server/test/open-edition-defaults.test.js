const test = require("node:test");
const assert = require("node:assert/strict");
const { openEditionOptIn } = require("../services/openEditionDefaults");

test("background work requires explicit opt-in", () => {
  for (const input of [undefined, null, "", "false", "0", "yes", true, 1, {}, []]) {
    assert.equal(openEditionOptIn(input), false);
  }
  assert.equal(openEditionOptIn("true"), true);
  assert.equal(openEditionOptIn("TRUE"), true);
});
