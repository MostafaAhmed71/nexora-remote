using System.Runtime.InteropServices;
using System.Text.Json;
namespace Nexora.Remote;

public static class NativeInput
{
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION data; }
    [StructLayout(LayoutKind.Explicit)] struct UNION { [FieldOffset(0)] public MOUSEINPUT mouse; [FieldOffset(0)] public KEYBDINPUT key; }
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public UIntPtr extra; }
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort vk, scan; public uint flags, time; public UIntPtr extra; }
    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
    [DllImport("user32.dll", SetLastError = true)] static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
    [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr desktop);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool GetUserObjectInformation(IntPtr handle, int index, System.Text.StringBuilder value, int length, out int needed);
    public static bool NormalDesktop() { var h = OpenInputDesktop(0, false, 1); if (h == IntPtr.Zero) return false; try { var name = new System.Text.StringBuilder(256); return GetUserObjectInformation(h, 2, name, 512, out _) && name.ToString() == "Default"; } finally { CloseDesktop(h); } }
    static readonly HashSet<ushort> Keys = []; static readonly HashSet<string> Buttons = [];
    static void Send(INPUT input) { if (SendInput(1, [input], Marshal.SizeOf<INPUT>()) != 1) throw new InvalidOperationException("Windows rejected input (UIPI or desktop state)"); }
    public static void Apply(JsonElement e)
    {
        if (!NormalDesktop()) throw new UnauthorizedAccessException("Secure or locked desktop is not supported"); var kind = e.GetProperty("kind").GetString();
        if (kind == "release") { ReleaseAll(); }
        else if (kind == "move") { double x = e.GetProperty("x").GetDouble(), y = e.GetProperty("y").GetDouble(); if (!double.IsFinite(x) || !double.IsFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) throw new InvalidDataException(); var screen = Screen.PrimaryScreen!.Bounds; var virtualBounds = SystemInformation.VirtualScreen; int px = screen.Left + (int)(x * (screen.Width - 1)), py = screen.Top + (int)(y * (screen.Height - 1)); Send(new INPUT { type = 0, data = new UNION { mouse = new MOUSEINPUT { dx = (px - virtualBounds.Left) * 65535 / Math.Max(1, virtualBounds.Width - 1), dy = (py - virtualBounds.Top) * 65535 / Math.Max(1, virtualBounds.Height - 1), dwFlags = 0x8000 | 0x4000 | 0x0001 } } }); }
        else if (kind == "button") { var b = e.GetProperty("button").GetString()!; bool down = e.GetProperty("down").GetBoolean(); if (b is not ("left" or "right")) throw new InvalidDataException(); Send(new INPUT { type = 0, data = new UNION { mouse = new MOUSEINPUT { dwFlags = b == "left" ? (down ? 2u : 4u) : (down ? 8u : 16u) } } }); if (down) Buttons.Add(b); else Buttons.Remove(b); }
        else if (kind == "key") { int code = e.GetProperty("code").GetInt32(); if (code < 8 || code > 254) throw new InvalidDataException(); bool down = e.GetProperty("down").GetBoolean(); var vk = (ushort)code; Send(new INPUT { type = 1, data = new UNION { key = new KEYBDINPUT { vk = vk, flags = down ? 0u : 2u } } }); if (down) Keys.Add(vk); else Keys.Remove(vk); }
        else throw new InvalidDataException("Unsupported input");
    }
    public static void ReleaseAll() { foreach (var k in Keys.ToArray()) { try { Send(new INPUT { type = 1, data = new UNION { key = new KEYBDINPUT { vk = k, flags = 2 } } }); } catch { } } Keys.Clear(); foreach (var b in Buttons.ToArray()) { try { Send(new INPUT { type = 0, data = new UNION { mouse = new MOUSEINPUT { dwFlags = b == "left" ? 4u : 16u } } }); } catch { } } Buttons.Clear(); }
}
