import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { referencePreview } from "../scripts/reference-preview.mjs";

test("acceptance gateway serves only signed reference media from its designated project", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mouva-preview-"));
  const id = "11111111-1111-4111-8111-111111111111",
    other = "22222222-2222-4222-8222-222222222222",
    token = "a".repeat(64);
  const server = referencePreview({ dataDir: dir, projectId: "qa-test" });
  try {
    await mkdir(path.join(dir, "jobs"));
    await mkdir(path.join(dir, "media", id), { recursive: true });
    await writeFile(
      path.join(dir, "jobs", id + ".json"),
      JSON.stringify({
        projectId: "qa-test",
        mediaToken: token,
        referenceUrl: "/signed-reference",
      }),
    );
    await writeFile(
      path.join(dir, "jobs", other + ".json"),
      JSON.stringify({
        projectId: "private-project",
        mediaToken: token,
        referenceUrl: "/private-reference",
      }),
    );
    await writeFile(path.join(dir, "media", id, "reference.mp4"), "abcdefghij");
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = "http://127.0.0.1:" + server.address().port;
    const url = base + "/api/ai/media/" + id + "/reference.mp4?token=" + token;
    const full = await fetch(url);
    assert.equal(full.status, 200);
    assert.equal(await full.text(), "abcdefghij");
    const range = await fetch(url, { headers: { Range: "bytes=2-5" } });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get("content-range"), "bytes 2-5/10");
    assert.equal(await range.text(), "cdef");
    const head = await fetch(url, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get("content-length"), "10");
    assert.equal(await head.text(), "");
    for (const target of [
      "/api/ai/status",
      "/api/ai/productions",
      "/api/ai/media/" + id + "/final.mp4?token=" + token,
      "/api/ai/media/" + id + "/reference.mp4?token=wrong",
      "/api/ai/media/" + other + "/reference.mp4?token=" + token,
      "/api/ai/media/" + id + "/reference.mp4?token=" + token + "&other=1",
    ])
      assert.equal((await fetch(base + target)).status, 404);
    assert.equal(
      (await fetch(url, { method: "POST", body: "new file" })).status,
      405,
    );
    assert.equal(
      (await fetch(url, { headers: { Range: "bytes=100-200" } })).status,
      416,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
