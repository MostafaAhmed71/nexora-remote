using System.Runtime.InteropServices;
using System.Diagnostics;
using System.Security.Principal;
using System.Text;
namespace Nexora.Remote;

public static class NativeSession
{
    [DllImport("kernel32.dll")] public static extern uint WTSGetActiveConsoleSessionId();
    [DllImport("wtsapi32.dll", SetLastError = true)] static extern bool WTSQueryUserToken(uint session, out IntPtr token);
    [DllImport("userenv.dll", SetLastError = true)] static extern bool CreateEnvironmentBlock(out IntPtr env, IntPtr token, bool inherit);
    [DllImport("userenv.dll")] static extern bool DestroyEnvironmentBlock(IntPtr env);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct STARTUPINFO { public int cb; public string? reserved, desktop, title; public uint x, y, width, height, xChars, yChars, fill, flags; public ushort show, reserved2; public IntPtr reservedPtr, input, output, error; }
    [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr process, thread; public uint pid, tid; }
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateProcessAsUser(IntPtr token, string app, StringBuilder command, IntPtr processAttributes, IntPtr threadAttributes, bool inherit, uint flags, IntPtr env, string cwd, ref STARTUPINFO startup, out PROCESS_INFORMATION process);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr OpenSCManager(string? machine, string? database, uint access);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr OpenService(IntPtr scm, string name, uint access);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool QueryServiceStatusEx(IntPtr service, int level, byte[] buffer, int length, out int needed);
    [DllImport("advapi32.dll")] static extern bool CloseServiceHandle(IntPtr service);
    public static int ServiceProcessId() { IntPtr scm = OpenSCManager(null, null, 1); if (scm == IntPtr.Zero) return -1; IntPtr service = IntPtr.Zero; try { service = OpenService(scm, "NexoraRemote", 4); if (service == IntPtr.Zero) return -1; byte[] b = new byte[36]; return QueryServiceStatusEx(service, 0, b, b.Length, out _) ? BitConverter.ToInt32(b, 28) : -1; } finally { if (service != IntPtr.Zero) CloseServiceHandle(service); CloseServiceHandle(scm); } }
    public static (SecurityIdentifier User, Process Process) Launch(uint session, string pipe) { if (!WTSQueryUserToken(session, out var token)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); IntPtr env = IntPtr.Zero; try { using var id = new WindowsIdentity(token); var sid = id.User ?? throw new UnauthorizedAccessException(); if (!CreateEnvironmentBlock(out env, token, false)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); string exe = Environment.ProcessPath!; var startup = new STARTUPINFO { cb = Marshal.SizeOf<STARTUPINFO>(), desktop = @"winsta0\default" }; if (!CreateProcessAsUser(token, exe, new StringBuilder("\"" + exe + "\" --worker " + pipe), IntPtr.Zero, IntPtr.Zero, false, 0x400, env, AppContext.BaseDirectory, ref startup, out var pi)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); try { return (sid, Process.GetProcessById((int)pi.pid)); } finally { CloseHandle(pi.thread); CloseHandle(pi.process); } } finally { if (env != IntPtr.Zero) DestroyEnvironmentBlock(env); CloseHandle(token); } }
    public static SecurityIdentifier UserForSession(uint session) { if (!WTSQueryUserToken(session, out var token)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); try { using var id = new WindowsIdentity(token); return id.User!; } finally { CloseHandle(token); } }
}
