using System.Drawing.Imaging;
using System.Text.Json;
using System.Diagnostics;
namespace Nexora.Remote;


public sealed record CaptureTiming(double CaptureMs = 0, double EncodeMs = 0);
public interface IRemoteDesktop : IDisposable { bool Available { get; } CaptureTiming Timing { get; } Task Authorize(string signed, Identity identity, CancellationToken ct); Task Revoke(CancellationToken ct); Task Apply(JsonElement input, CancellationToken ct); Task<byte[]?> Capture(CaptureOptions options, CancellationToken ct); }
public sealed class LocalDesktop : IRemoteDesktop, IManagedDesktop
{
    DesktopManagement? management;
    public Task<JsonElement> Manage(string signed, Identity identity, string nonce, CancellationToken ct) => (management ??= new DesktopManagement()).Apply(signed, identity, nonce, ct);
    Bitmap? bitmap; public CaptureTiming Timing { get; private set; } = new(); Grant? grant; long sequence; public bool Enabled { get; set; } = true; public bool Available{get{NativeInput.FlushReleases();return Enabled&&NativeInput.NormalDesktop();}}
    public Task Authorize(string signed, Identity identity, CancellationToken ct) { NativeInput.ReleaseAll(); grant = GrantVerifier.Verify(signed, identity.ServerPublicKey, identity); sequence = 0; return Task.CompletedTask; }
    public Task Revoke(CancellationToken ct) { NativeInput.ReleaseAll(); grant = null; return Task.CompletedTask; }
    bool Authorized => Available && grant != null && grant.ExpiresAt > DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    public Task Apply(JsonElement input, CancellationToken ct) { if (!Authorized || grant!.Mode != "control") throw new UnauthorizedAccessException("Inactive control grant"); long seq = input.GetProperty("seq").GetInt64(); if (seq <= sequence) throw new UnauthorizedAccessException("Input replay"); sequence = seq; NativeInput.Apply(input); return Task.CompletedTask; }
    public Task<byte[]?> Capture(CaptureOptions options, CancellationToken ct)
    {
        if (!Authorized) return Task.FromResult<byte[]?>(null);
        ct.ThrowIfCancellationRequested(); options = options.Validate() with { Monitor = Math.Clamp(options.Monitor, 0, Screen.AllScreens.Length - 1) };
        NativeInput.MonitorIndex = options.Monitor; var b = Screen.AllScreens[options.Monitor].Bounds;
        var watch = Stopwatch.StartNew();
        if (bitmap == null || bitmap.Width != b.Width || bitmap.Height != b.Height) { bitmap?.Dispose(); bitmap = new Bitmap(b.Width, b.Height, PixelFormat.Format24bppRgb); }
        using (var graphics = Graphics.FromImage(bitmap)) graphics.CopyFromScreen(b.Location, Point.Empty, b.Size, CopyPixelOperation.SourceCopy);
        double capture = watch.Elapsed.TotalMilliseconds; watch.Restart();
        var bytes = JpegEncoder.Encode(bitmap, options); Timing = new(capture, watch.Elapsed.TotalMilliseconds);
        return Task.FromResult<byte[]?>(bytes);
    }
    public void Dispose() { management?.Dispose(); NativeInput.ReleaseAll(); bitmap?.Dispose(); bitmap = null; }

}
public static class JpegEncoder
{
    static readonly ImageCodecInfo Codec = ImageCodecInfo.GetImageEncoders().First(x => x.MimeType == "image/jpeg");
    public static byte[] Encode(Bitmap image, CaptureOptions options) { double scale = Math.Min(1.0, (double)options.Width / image.Width); using var small = new Bitmap(image, new Size(Math.Max(1, (int)(image.Width * scale)), Math.Max(1, (int)(image.Height * scale)))); using var ms = new MemoryStream();  using var parameters = new EncoderParameters(1); parameters.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, (long)options.Quality); small.Save(ms, Codec, parameters); return ms.ToArray(); }
}
