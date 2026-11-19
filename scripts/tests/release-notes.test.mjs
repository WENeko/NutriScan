import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareReleaseHistory, releaseMarkdown } from "../release-notes.mjs";

const change = id => ({ id, sections: [{ title: id, items: [`Nouveauté ${id}`] }] });
const version = code => ({ versionName: `2026.11.${String(code).slice(6, 8)}.01`, versionCode: code });

test("three published versions retain all missed changes with their real build versions", () => {
  const first = prepareReleaseHistory({ changes: [change("a")] }, [], version(2026111601));
  const second = prepareReleaseHistory({ changes: [change("a"), change("b")] }, first, version(2026111701));
  const third = prepareReleaseHistory({ changes: [change("a"), change("b"), change("c")] }, second, version(2026111801));
  assert.deepEqual(third.map(entry => entry.versionCode), [2026111601, 2026111701, 2026111801]);
  assert.deepEqual(third.map(entry => entry.changes.map(c => c.id)), [["a"], ["b"], ["c"]]);
  assert.match(releaseMarkdown(third[2]), /Nouveauté c/);
  assert.doesNotMatch(releaseMarkdown(third[2]), /Nouveauté a/);
});

test("a rebuild does not repeat already published features", () => {
  const old = prepareReleaseHistory({ changes: [change("a")] }, [], version(2026111701));
  const next = prepareReleaseHistory({ changes: [change("a")] }, old, version(2026111801));
  assert.equal(next[1].changes.length, 0);
});

test("invalid history fails rather than silently losing cumulative notes", () => {
  assert.throws(() => prepareReleaseHistory({ changes: [] }, [{ versionCode: 2026111601 }], version(2026111801)));
  assert.throws(() => prepareReleaseHistory({ changes: [change("a"), change("a")] }, [], version(2026111801)));
});