import assert from "node:assert";
import test from "node:test";

interface MockJob {
  id: string;
  printer: string;
  shouldFail?: boolean;
}

// Saf kuyruk işleyici mantık simülasyonu
class SimplePrintQueue {
  private queue: MockJob[] = [];
  public isProcessing = false;
  public completed: string[] = [];
  public failed: string[] = [];

  public add(job: MockJob) {
    this.queue.push(job);
    this.process();
  }

  private async process() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    const current = this.queue.shift()!;
    try {
      await this.execute(current);
      this.completed.push(current.id);
    } catch {
      this.failed.push(current.id);
    } finally {
      this.isProcessing = false;
      this.process();
    }
  }

  private execute(job: MockJob): Promise<void> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (job.shouldFail) {
          reject(new Error("Yazıcı hatası"));
        } else {
          resolve();
        }
      }, 10);
    });
  }
}

test("PrintQueue: Sıralı (FIFO) yazdırma ve hata izolasyonu testi", async () => {
  const queue = new SimplePrintQueue();

  queue.add({ id: "job-1", printer: "Kasa" });
  queue.add({ id: "job-2", printer: "Mutfak", shouldFail: true });
  queue.add({ id: "job-3", printer: "Kasa" });

  // İşlerin tamamlanmasını bekle
  await new Promise((r) => setTimeout(r, 80));

  // job-1 ve job-3 tamamlanmalı, job-2 hata listesine gitmeli ama kuyruğu tıkamamalı
  assert.deepStrictEqual(queue.completed, ["job-1", "job-3"]);
  assert.deepStrictEqual(queue.failed, ["job-2"]);
  assert.strictEqual(queue.isProcessing, false);
});
