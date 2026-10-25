// No frame queue: at most one decoder-acknowledged frame may be outstanding.
// Legacy validation clients may omit ACK negotiation; bufferedAmount still bounds them.
export class StreamGate {
  acknowledged = false;
  private waitingSince: number | null = null;
  dropped = 0;
  delivered = 0;
  allow(bufferedBytes: number, frameBytes: number, now: number) {
    if (
      bufferedBytes + frameBytes > 2 * 1024 * 1024 ||
      (this.acknowledged && this.waitingSince !== null)
    ) {
      this.dropped++;
      return false;
    }
    this.delivered++;
    if (this.acknowledged) this.waitingSince = now;
    return true;
  }
  ack(now: number) {
    if (this.waitingSince === null) return null;
    const elapsed = Math.max(0, now - this.waitingSince);
    this.waitingSince = null;
    return elapsed;
  }
  stalled(now: number) {
    return this.waitingSince !== null && now - this.waitingSince > 10000;
  }
}
