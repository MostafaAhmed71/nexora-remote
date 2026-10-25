namespace Nexora.Remote;

// One producer, no frame queue. Downshift quickly, recover only after sustained headroom.
public sealed class StreamPolicy
{
    int level, healthy;
    public int Level => level;
    public int Dropped { get; private set; }
    public CaptureOptions Effective(CaptureOptions requested)
    {
        var q = requested.Validate();
        return q with { Width = Math.Max(320, q.Width * (100 - level * 15) / 100), Quality = Math.Max(15, q.Quality - level * 10), Fps = Math.Max(1, q.Fps / (level + 1)) };
    }
    public void Observe(double elapsedMs, CaptureOptions requested, bool congested = false)
    {
        if (congested || elapsedMs > 1000.0 / requested.Validate().Fps * 1.25)
        { level = Math.Min(3, level + 1); healthy = 0; if (congested) Dropped++; }
        else if (++healthy >= 30) { level = Math.Max(0, level - 1); healthy = 0; }
    }
    public void Reset() { level = 0; healthy = 0; Dropped = 0; }
}

public static class RecoveryDelay
{
    public static int Milliseconds(int attempt, int jitter) => (int)Math.Min(30000, 1000L << Math.Clamp(attempt, 0, 5)) + Math.Clamp(jitter, 0, 249);
}
