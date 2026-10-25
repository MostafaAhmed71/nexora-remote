using System.Net.Http.Json;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Drawing.Imaging;
namespace Nexora.Remote;

public sealed class Engine(Identity identity, Action<string> status) : IDisposable
{
    readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(15) };
    readonly SemaphoreSlim sendLock = new(1, 1), stateLock = new(1, 1);
    Grant? grant; long sequence; int delay = 200; long totalBytes;
    static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };
    public async Task Run(CancellationToken ct)
    {
        ValidateServer(identity.Server); var attempt = 0;
        while (!ct.IsCancellationRequested)
        {
            try { await Connect(ct); attempt = 0; } catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; } catch (Exception ex) { status("Disconnected: " + ex.Message); }
            await ClearGrant(); await Task.Delay(TimeSpan.FromSeconds(Math.Min(30, Math.Pow(2, Math.Min(attempt++, 5)))), ct);
        }
    }
    public static void ValidateServer(string server) { var uri = new Uri(server); if (uri.Scheme != "https" && !(uri.Scheme == "http" && uri.IsLoopback)) throw new InvalidOperationException("HTTPS required except loopback development"); if (!string.IsNullOrEmpty(uri.UserInfo) || !string.IsNullOrEmpty(uri.Query) || !string.IsNullOrEmpty(uri.Fragment)) throw new InvalidOperationException("Invalid server address"); }
    async Task<JsonElement> Post(string path, object body, CancellationToken ct) { using var response = await http.PostAsJsonAsync(identity.Server.TrimEnd('/') + path, body, ct); response.EnsureSuccessStatusCode(); return await response.Content.ReadFromJsonAsync<JsonElement>(ct); }
    async Task Connect(CancellationToken ct)
    {
        var n = await Post("/api/agent/challenge", new { deviceId = identity.DeviceId }, ct); var nonce = n.GetProperty("nonce").GetString()!; using var rsa = RSA.Create(); rsa.ImportFromPem(identity.PrivateKey); var signature = Convert.ToBase64String(rsa.SignData(Encoding.UTF8.GetBytes(nonce), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1)); var proof = await Post("/api/agent/prove", new { deviceId = identity.DeviceId, organizationId = identity.OrganizationId, nonce, signature }, ct);
        using var ws = new ClientWebSocket(); var url = new UriBuilder(identity.Server) { Scheme = new Uri(identity.Server).Scheme == "https" ? "wss" : "ws", Path = "/api/socket", Query = "ticket=" + Uri.EscapeDataString(proof.GetProperty("ticket").GetString()!) }; await ws.ConnectAsync(url.Uri, ct); status("Connected — waiting for authorized session");
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct); var receive = Receive(ws, linked.Token); var capture = Capture(ws, linked.Token); var heartbeat = Heartbeat(ws, linked.Token); await Task.WhenAny(receive, capture, heartbeat); linked.Cancel(); try { await Task.WhenAll(receive, capture, heartbeat); } catch (OperationCanceledException) { }
        await ClearGrant();
    }
    async Task Send(ClientWebSocket ws, byte[] bytes, WebSocketMessageType type, CancellationToken ct) { await sendLock.WaitAsync(ct); try { await ws.SendAsync(bytes.AsMemory(), type, true, ct); } finally { sendLock.Release(); } }
    async Task Heartbeat(ClientWebSocket ws, CancellationToken ct) { while (!ct.IsCancellationRequested) { await Send(ws, Encoding.UTF8.GetBytes("ping"), WebSocketMessageType.Text, ct); await Task.Delay(10000, ct); } }
    async Task Receive(ClientWebSocket ws, CancellationToken ct)
    {
        byte[] buf = new byte[16384]; while (ws.State == WebSocketState.Open && !ct.IsCancellationRequested)
        {
            using var ms = new MemoryStream(); WebSocketReceiveResult result; do { result = await ws.ReceiveAsync(new ArraySegment<byte>(buf), ct); if (result.MessageType == WebSocketMessageType.Close) return; ms.Write(buf, 0, result.Count); if (ms.Length > 65536) throw new InvalidDataException("Oversized control message"); } while (!result.EndOfMessage); var text = Encoding.UTF8.GetString(ms.ToArray()); if (text == "pong") continue; using var doc = JsonDocument.Parse(text); var root = doc.RootElement; await stateLock.WaitAsync(ct); try
            {
                switch (root.GetProperty("type").GetString())
                {
                    case "grant": NativeInput.ReleaseAll(); grant = GrantVerifier.Verify(root.GetProperty("grant").GetString()!, identity.ServerPublicKey, identity); sequence = 0; status("Authorized session: " + grant.Mode); break;
                    case "revoke": if (grant?.SessionId == root.GetProperty("sessionId").GetString()) { NativeInput.ReleaseAll(); grant = null; status("Session revoked"); } break;
                    case "input": if (grant == null || grant.Mode != "control" || grant.SessionId != root.GetProperty("sessionId").GetString() || grant.ExpiresAt <= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()) break; var e = root.GetProperty("event"); long seq = e.GetProperty("seq").GetInt64(); if (seq <= sequence) break; sequence = seq; NativeInput.Apply(e); break;
                }
            }
            finally { stateLock.Release(); }
        }
    }
    async Task Capture(ClientWebSocket ws, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            await stateLock.WaitAsync(ct); Grant? g; try { if (grant?.ExpiresAt <= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()) { NativeInput.ReleaseAll(); grant = null; } g = grant; } finally { stateLock.Release(); }
            if (g != null && NativeInput.NormalDesktop()) { var watch = System.Diagnostics.Stopwatch.StartNew(); byte[] jpeg = CaptureJpeg(); if (jpeg.Length + 36 <= 2097152) { byte[] packet = new byte[36 + jpeg.Length]; Encoding.ASCII.GetBytes(g.SessionId).CopyTo(packet, 0); jpeg.CopyTo(packet, 36); await Send(ws, packet, WebSocketMessageType.Binary, ct); totalBytes += packet.Length; delay = watch.ElapsedMilliseconds > 400 ? Math.Min(1000, delay + 50) : Math.Max(200, delay - 10); status($"Session {g.Mode} • {1000 / delay} FPS target • {totalBytes / 1048576.0:F1} MB"); } }
            await Task.Delay(delay, ct);
        }
    }
    static byte[] CaptureJpeg() { var b = Screen.PrimaryScreen!.Bounds; using var bmp = new Bitmap(b.Width, b.Height, PixelFormat.Format24bppRgb); using (var graphics = Graphics.FromImage(bmp)) { graphics.CopyFromScreen(b.Location, Point.Empty, b.Size, CopyPixelOperation.SourceCopy); } var scale = Math.Min(1.0, 1280.0 / b.Width); using var small = new Bitmap(bmp, new Size(Math.Max(1, (int)(b.Width * scale)), Math.Max(1, (int)(b.Height * scale)))); using var ms = new MemoryStream(); var encoder = ImageCodecInfo.GetImageEncoders().First(x => x.MimeType == "image/jpeg"); using var parameters = new EncoderParameters(1); parameters.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 55L); small.Save(ms, encoder, parameters); return ms.ToArray(); }
    async Task ClearGrant() { await stateLock.WaitAsync(); try { NativeInput.ReleaseAll(); grant = null; } finally { stateLock.Release(); } }
    public void Dispose() { http.Dispose(); sendLock.Dispose(); stateLock.Dispose(); }
}
