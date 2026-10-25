using System.Collections.Concurrent;
namespace Nexora.Remote;

// SCM session notifications invalidate every lease, including lock/unlock of the same session ID.
public static class SessionLifecycle
{
    static readonly ConcurrentDictionary<uint, (long Generation, bool Blocked)> states = new();
    public static long Generation(uint session) => states.TryGetValue(session, out var v) ? v.Generation : 0;
    public static bool Usable(uint session, long generation) => !states.TryGetValue(session, out var v) || (!v.Blocked && v.Generation == generation);
    public static void Change(uint session, bool blocked) => states.AddOrUpdate(session, (1, blocked), (_, old) => (old.Generation + 1, blocked));
}
