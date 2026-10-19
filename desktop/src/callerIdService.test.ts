import { test } from "node:test";
import assert from "node:assert";
import { CallerIdService } from "./main/callerIdService";

test("CallerIdService: DLL path resolution, Koffi loading and initialization", (t) => {
  const service = new CallerIdService();
  const dllPath = service.resolveDllPath();

  assert.ok(dllPath, "cid.dll yolu başarıyla bulunmalı");

  const loaded = service.load();
  assert.strictEqual(loaded, true, "cid.dll Koffi ile sorunsuz yüklenmeli");

  const started = service.start();
  assert.strictEqual(started, true, "CallerIdService başlatılabilmeli");

  const status = service.getStatus();
  assert.strictEqual(status.loaded, true);
  assert.strictEqual(status.isRunning, true);
  assert.strictEqual(status.architecture, "x64");
  assert.strictEqual(status.error, null);

  service.stop();
  const stoppedStatus = service.getStatus();
  assert.strictEqual(stoppedStatus.isRunning, false);
});
