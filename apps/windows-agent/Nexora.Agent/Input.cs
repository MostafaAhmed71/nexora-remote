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
    public static int MonitorIndex { get; set; }
    static readonly object Sync=new();static bool PendingRelease;
    static readonly HashSet<ushort> Keys = []; static readonly HashSet<string> Buttons = [];
    static void Send(INPUT input) { if (SendInput(1, [input], Marshal.SizeOf<INPUT>()) != 1) throw new InvalidOperationException("Windows rejected input (UIPI or desktop state)"); }
    public static void Apply(JsonElement e)
    {lock(Sync){
        if (!NormalDesktop()) throw new UnauthorizedAccessException("Secure or locked desktop is not supported"); var kind = e.GetProperty("kind").GetString();
        if (kind == "release") { ReleaseAll(); }
        else if (kind == "move") { double x = e.GetProperty("x").GetDouble(), y = e.GetProperty("y").GetDouble(); if (!double.IsFinite(x) || !double.IsFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) throw new InvalidDataException(); var screen = Screen.AllScreens[Math.Clamp(MonitorIndex, 0, Screen.AllScreens.Length - 1)].Bounds; var virtualBounds = SystemInformation.VirtualScreen; int px = screen.Left + (int)(x * (screen.Width - 1)), py = screen.Top + (int)(y * (screen.Height - 1)); Send(new INPUT { type = 0, data = new UNION { mouse = new MOUSEINPUT { dx = (int)((long)(px - virtualBounds.Left) * 65535 / Math.Max(1, virtualBounds.Width - 1)), dy = (int)((long)(py - virtualBounds.Top) * 65535 / Math.Max(1, virtualBounds.Height - 1)), dwFlags = 0x8000 | 0x4000 | 0x0001 } } }); }
        else if (kind == "button") { var b = e.GetProperty("button").GetString()!; bool down = e.GetProperty("down").GetBoolean(); if (b is not ("left" or "right")) throw new InvalidDataException(); Send(new INPUT { type = 0, data = new UNION { mouse = new MOUSEINPUT { dwFlags = b == "left" ? (down ? 2u : 4u) : (down ? 8u : 16u) } } }); if (down) Buttons.Add(b); else Buttons.Remove(b); }
        else if (kind == "key") { int code = e.GetProperty("code").GetInt32(); if (code < 8 || code > 254) throw new InvalidDataException(); bool down = e.GetProperty("down").GetBoolean(); var vk = (ushort)code; Send(new INPUT { type = 1, data = new UNION { key = new KEYBDINPUT { vk = vk, flags = (down ? 0u : 2u) | (IsExtended(vk) ? 1u : 0u) } } }); if (down) Keys.Add(vk); else Keys.Remove(vk); }
        else if (kind == "wheel") { int delta = e.GetProperty("delta").GetInt32(); if (Math.Abs((long)delta) > 1200) throw new InvalidDataException(); Send(new INPUT { type = 0, data = new UNION { mouse = new MOUSEINPUT { mouseData = unchecked((uint)delta), dwFlags = 0x0800 } } }); }
        else if (kind == "text") { string text = e.GetProperty("text").GetString()!; if (text.Length > 1024) throw new InvalidDataException(); foreach (char ch in text) { Send(new INPUT { type = 1, data = new UNION { key = new KEYBDINPUT { scan = ch, flags = 4 } } }); Send(new INPUT { type = 1, data = new UNION { key = new KEYBDINPUT { scan = ch, flags = 6 } } }); } }
        else throw new InvalidDataException("Unsupported input");
    }
    }
    static bool IsExtended(ushort k) => k is 0x21 or 0x22 or 0x23 or 0x24 or 0x25 or 0x26 or 0x27 or 0x28 or 0x2D or 0x2E or 0x5B or 0x5C or 0x6F or 0xA3 or 0xA5;
    public static void FlushReleases(){lock(Sync){if(PendingRelease&&NormalDesktop())ReleaseAll();}}
    public static void ReleaseAll(){lock(Sync){PendingRelease=true;foreach(var k in Keys.ToArray()){try{Send(new INPUT{type=1,data=new UNION{key=new KEYBDINPUT{vk=k,flags=2|(IsExtended(k)?1u:0u)}}});Keys.Remove(k);}catch{}}foreach(var b in Buttons.ToArray()){try{Send(new INPUT{type=0,data=new UNION{mouse=new MOUSEINPUT{dwFlags=b=="left"?4u:16u}}});Buttons.Remove(b);}catch{}}PendingRelease=Keys.Count>0||Buttons.Count>0;}}
}
