using System.Buffers.Binary;
using System.IO.Pipes;
using System.Text.Json;
using System.Runtime.InteropServices;
using System.Diagnostics;
using Microsoft.Win32.SafeHandles;
namespace Nexora.Remote;

public static class Ipc
{
    public const int MaxBytes = 3 * 1024 * 1024;
    public static async Task Write(Stream s, object message, CancellationToken ct) { byte[] b = JsonSerializer.SerializeToUtf8Bytes(message); if (b.Length > MaxBytes) throw new InvalidDataException("IPC frame too large"); byte[] size = new byte[4]; BinaryPrimitives.WriteInt32LittleEndian(size, b.Length); await s.WriteAsync(size, ct); await s.WriteAsync(b, ct); await s.FlushAsync(ct); }
    public static async Task<JsonElement> Read(Stream s, CancellationToken ct) { byte[] size = new byte[4]; await s.ReadExactlyAsync(size, ct); int n = BinaryPrimitives.ReadInt32LittleEndian(size); if (n <= 0 || n > MaxBytes) throw new InvalidDataException("IPC frame length rejected"); byte[] b = new byte[n]; await s.ReadExactlyAsync(b, ct); using var doc = JsonDocument.Parse(b); return doc.RootElement.Clone(); }
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetNamedPipeClientProcessId(SafePipeHandle pipe, out uint pid);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetNamedPipeServerProcessId(SafePipeHandle pipe, out uint pid);
    public static bool MatchesClient(NamedPipeServerStream pipe, int expectedPid) => GetNamedPipeClientProcessId(pipe.SafePipeHandle, out uint pid) && pid == expectedPid;
    public static bool MatchesService(NamedPipeClientStream pipe) => GetNamedPipeServerProcessId(pipe.SafePipeHandle, out uint pid) && pid == NativeSession.ServiceProcessId();
}
