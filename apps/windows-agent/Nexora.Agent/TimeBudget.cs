namespace Nexora.Remote;

public sealed class TimeBudget
{
    public int Revision { get; private set; }
    public long? Deadline { get; private set; }
    public bool Locked { get; private set; }
    long monotonicDeadline = long.MaxValue;
    public bool Apply(int revision, long? deadline, bool locked, long utcNow, long monotonicNow)
    {
        if (revision < Revision) throw new UnauthorizedAccessException("Old management revision");
        if (revision < 0 || (deadline.HasValue && deadline.Value > utcNow + 604800000)) throw new InvalidDataException("Invalid time budget");
        bool changed = revision != Revision || deadline != Deadline;
        if (changed) monotonicDeadline = deadline.HasValue ? monotonicNow + Math.Max(0, deadline.Value - utcNow) : long.MaxValue;
        Revision = revision; Deadline = deadline; Locked = locked;
        return changed;
    }
    public long Remaining(long utcNow, long monotonicNow) => Deadline.HasValue ? Math.Min(Deadline.Value - utcNow, monotonicDeadline - monotonicNow) : long.MaxValue;
    public bool IsLocked(long utcNow, long monotonicNow) => Locked || Remaining(utcNow, monotonicNow) <= 0;
}
