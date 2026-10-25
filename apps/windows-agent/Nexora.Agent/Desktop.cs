using System.Drawing.Imaging;
using System.Text.Json;
namespace Nexora.Remote;

public sealed record CaptureOptions(int Width = 1280, int Quality = 55, int Fps = 5, int Monitor = 0) { public CaptureOptions Validate() => this with { Width = Math.Clamp(Width, 320, 2560), Quality = Math.Clamp(Quality, 15, 85), Fps = Math.Clamp(Fps, 1, 15), Monitor = Math.Clamp(Monitor, 0, 31) }; }
public interface IRemoteDesktop : IDisposable { bool Available { get; } Task Authorize(string signed, Identity identity, CancellationToken ct); Task Revoke(CancellationToken ct); Task Apply(JsonElement input, CancellationToken ct); Task<byte[]?> Capture(CaptureOptions options, CancellationToken ct); }
public sealed class LocalDesktop : IRemoteDesktop
{
    Grant? grant; long sequence; public bool Enabled { get; set; } = true; public bool Available{get{NativeInput.FlushReleases();return Enabled&&NativeInput.NormalDesktop();}}
    public Task Authorize(string signed, Identity identity, CancellationToken ct) { NativeInput.ReleaseAll(); grant = GrantVerifier.Verify(signed, identity.ServerPublicKey, identity); sequence = 0; return Task.CompletedTask; }
    public Task Revoke(CancellationToken ct) { NativeInput.ReleaseAll(); grant = null; return Task.CompletedTask; }
    bool Authorized => Available && grant != null && grant.ExpiresAt > DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    public Task Apply(JsonElement input, CancellationToken ct) { if (!Authorized || grant!.Mode != "control") throw new UnauthorizedAccessException("Inactive control grant"); long seq = input.GetProperty("seq").GetInt64(); if (seq <= sequence) throw new UnauthorizedAccessException("Input replay"); sequence = seq; NativeInput.Apply(input); return Task.CompletedTask; }
    public Task<byte[]?> Capture(CaptureOptions options, CancellationToken ct) { if (!Authorized) return Task.FromResult<byte[]?>(null); options = options.Validate() with { Monitor = Math.Clamp(options.Monitor, 0, Screen.AllScreens.Length - 1) }; NativeInput.MonitorIndex = options.Monitor; var b = Screen.AllScreens[options.Monitor].Bounds; using var bmp = new Bitmap(b.Width, b.Height, PixelFormat.Format24bppRgb); using (var graphics = Graphics.FromImage(bmp)) graphics.CopyFromScreen(b.Location, Point.Empty, b.Size, CopyPixelOperation.SourceCopy); return Task.FromResult<byte[]?>(JpegEncoder.Encode(bmp, options)); }
    public void Dispose() { NativeInput.ReleaseAll(); }
}
public static class JpegEncoder
{
    public static byte[] Encode(Bitmap image, CaptureOptions options) { double scale = Math.Min(1.0, (double)options.Width / image.Width); using var small = new Bitmap(image, new Size(Math.Max(1, (int)(image.Width * scale)), Math.Max(1, (int)(image.Height * scale)))); using var ms = new MemoryStream(); var codec = ImageCodecInfo.GetImageEncoders().First(x => x.MimeType == "image/jpeg"); using var parameters = new EncoderParameters(1); parameters.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, (long)options.Quality); small.Save(ms, codec, parameters); return ms.ToArray(); }
}
