using System.Net.Http.Json;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Diagnostics;
namespace Nexora.Remote;

public sealed class Engine(Identity identity, Action<string> status, IRemoteDesktop? desktop = null) : IDisposable
{
    readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(15) }; readonly SemaphoreSlim sendLock = new(1, 1), stateLock = new(1, 1); readonly IRemoteDesktop desktop = desktop ?? new LocalDesktop(); Grant? grant; CaptureOptions settings = new(); long lastPong; long totalBytes; int frames; double encodeMs; double sendMs; long skippedFrames; readonly StreamPolicy policy = new(); bool congested; byte[]? previousHash; long lastFrame;
    public static void ValidateServer(string server) { var u = new Uri(server); if (u.Scheme != "https" && !(u.Scheme == "http" && u.IsLoopback)) throw new InvalidOperationException("HTTPS required except loopback"); if (u.AbsolutePath != "/" || !string.IsNullOrEmpty(u.UserInfo) || !string.IsNullOrEmpty(u.Query) || !string.IsNullOrEmpty(u.Fragment)) throw new InvalidOperationException("Server must be an origin"); }
    public async Task Run(CancellationToken ct) { ValidateServer(identity.Server); int attempt = 0; try { while (!ct.IsCancellationRequested) { var connected = Stopwatch.StartNew(); try { await Connect(ct); } catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; } catch (Exception ex) { status("Disconnected: " + ex.GetType().Name); AgentLog.Write("connection.error", ex.GetType().Name); } finally { await ClearGrant(); } if (connected.Elapsed > TimeSpan.FromSeconds(30)) attempt = 0; var delay = TimeSpan.FromMilliseconds(RecoveryDelay.Milliseconds(attempt++, Random.Shared.Next(250))); await Task.Delay(delay, ct); } } finally { await ClearGrant(); } }
    async Task<JsonElement> Post(string path, object body, CancellationToken ct) { using var response = await http.PostAsJsonAsync(identity.Server.TrimEnd('/') + path, body, ct); response.EnsureSuccessStatusCode(); return await response.Content.ReadFromJsonAsync<JsonElement>(ct); }
    async Task Connect(CancellationToken ct) { var n = await Post("/api/agent/challenge", new { deviceId = identity.DeviceId, organizationId = identity.OrganizationId }, ct); var nonce = n.GetProperty("nonce").GetString()!; using var rsa = RSA.Create(); rsa.ImportFromPem(identity.PrivateKey); var signature = Convert.ToBase64String(rsa.SignData(Encoding.UTF8.GetBytes(nonce), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1)); var proof = await Post("/api/agent/prove", new { deviceId = identity.DeviceId, organizationId = identity.OrganizationId, nonce, signature }, ct); using var ws = new ClientWebSocket(); ws.Options.SetRequestHeader("Authorization", "Bearer " + proof.GetProperty("ticket").GetString()); var url = new UriBuilder(identity.Server) { Scheme = new Uri(identity.Server).Scheme == "https" ? "wss" : "ws", Path = "/api/socket" }; await ws.ConnectAsync(url.Uri, ct); lastPong = Environment.TickCount64; status("Connected; desktop " + (desktop.Available ? "available" : "unavailable")); using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct); var tasks = new[] { Receive(ws, linked.Token), Capture(ws, linked.Token), Heartbeat(ws, linked.Token) }; try { await Task.WhenAny(tasks); } finally { linked.Cancel(); ws.Abort(); try { await Task.WhenAll(tasks); } catch (OperationCanceledException) { } await ClearGrant(); } }
    async Task Send(ClientWebSocket ws, byte[] bytes, WebSocketMessageType type, CancellationToken ct) { using var limit = CancellationTokenSource.CreateLinkedTokenSource(ct); limit.CancelAfter(5000); await sendLock.WaitAsync(limit.Token); try { await ws.SendAsync(bytes.AsMemory(), type, true, limit.Token); } finally { sendLock.Release(); } }
    async Task Heartbeat(ClientWebSocket ws, CancellationToken ct) { while (!ct.IsCancellationRequested) { if (Environment.TickCount64 - lastPong > 25000) throw new TimeoutException("Server heartbeat expired"); await Send(ws, Encoding.UTF8.GetBytes("ping"), WebSocketMessageType.Text, ct); await Send(ws, JsonSerializer.SerializeToUtf8Bytes(new { type = "health", interactive = desktop.Available, frames, bytes = totalBytes, captureAndEncodeMs = encodeMs, timing = desktop.Timing, sendMs, skippedFrames, adaptationLevel = policy.Level, effective = policy.Effective(settings), sessionId = grant?.SessionId }), WebSocketMessageType.Text, ct); await Task.Delay(5000, ct); } }
    async Task Receive(ClientWebSocket ws, CancellationToken ct)
    {
        var buf = new byte[16384]; while (ws.State == WebSocketState.Open && !ct.IsCancellationRequested)
        {
            using var ms = new MemoryStream(); WebSocketReceiveResult result; do { result = await ws.ReceiveAsync(new ArraySegment<byte>(buf), ct); if (result.MessageType == WebSocketMessageType.Close) return; if (result.MessageType != WebSocketMessageType.Text) throw new InvalidDataException("Expected control text"); ms.Write(buf, 0, result.Count); if (ms.Length > 65536) throw new InvalidDataException("Oversized control"); } while (!result.EndOfMessage); var text = Encoding.UTF8.GetString(ms.ToArray()); if (text == "pong") { lastPong = Environment.TickCount64; continue; }
            using var doc = JsonDocument.Parse(text); var root = doc.RootElement; await stateLock.WaitAsync(ct); try
            {
                switch (root.GetProperty("type").GetString())
                {
                    case "grant": await desktop.Revoke(ct); var signed = root.GetProperty("grant").GetString()!; var checkedGrant = GrantVerifier.Verify(signed, identity.ServerPublicKey, identity); await desktop.Authorize(signed, identity, ct); grant = checkedGrant; policy.Reset(); previousHash = null; status("Session authorized: " + grant.Mode); break;
                    case "revoke": if (grant?.SessionId == root.GetProperty("sessionId").GetString()) { await desktop.Revoke(ct); grant = null; status("Session ended"); } break;
                    case "flow": if (grant != null && grant.SessionId == root.GetProperty("sessionId").GetString()) congested = root.GetProperty("congested").GetBoolean(); break;
                    case "quality": if (grant != null && grant.SessionId == root.GetProperty("sessionId").GetString()) { var q = root.GetProperty("settings"); settings = new CaptureOptions(q.GetProperty("width").GetInt32(), q.GetProperty("quality").GetInt32(), q.GetProperty("fps").GetInt32(), q.GetProperty("monitor").GetInt32()).Validate(); } break;
                    case "input": if (grant?.Mode == "control" && grant.SessionId == root.GetProperty("sessionId").GetString() && grant.ExpiresAt > DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()) await desktop.Apply(root.GetProperty("event"), ct); break;
                }
            }
            finally { stateLock.Release(); }
        }
    }
    async Task Capture(ClientWebSocket ws, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            var watch = Stopwatch.StartNew(); byte[]? packet = null; string? session = null; CaptureOptions requested;
            await stateLock.WaitAsync(ct);
            try
            {
                if (grant != null && (grant.ExpiresAt <= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() || Environment.TickCount64 - lastPong > 10000 || !desktop.Available))
                { await desktop.Revoke(ct); grant = null; previousHash = null; }
                requested = settings;
                if (grant != null)
                {
                    session = grant.SessionId;
                    var jpeg = await desktop.Capture(policy.Effective(settings), ct);
                    encodeMs = watch.Elapsed.TotalMilliseconds;
                    if (jpeg is { Length: > 0 } && jpeg.Length + 36 <= 2097152)
                    {
                        var hash = SHA256.HashData(jpeg);
                        // Refresh a static screen every two seconds; reset fingerprint for every grant.
                        if (previousHash != null && hash.AsSpan().SequenceEqual(previousHash) && Environment.TickCount64 - lastFrame < 2000) skippedFrames++;
                        else { previousHash = hash; lastFrame = Environment.TickCount64; packet = new byte[36 + jpeg.Length]; Encoding.ASCII.GetBytes(session).CopyTo(packet, 0); jpeg.CopyTo(packet, 36); }
                    }
                }
            }
            finally { stateLock.Release(); }
            // Never hold the grant/input mutex while a slow socket drains. Relay revalidates each frame.
            if (packet != null && grant?.SessionId == session)
            {
                var transport = Stopwatch.StartNew(); await Send(ws, packet, WebSocketMessageType.Binary, ct); sendMs = transport.Elapsed.TotalMilliseconds; totalBytes += packet.Length; frames++;
            }
            await stateLock.WaitAsync(ct);
            int delay;
            try { policy.Observe(watch.Elapsed.TotalMilliseconds, requested, congested); congested = false; delay = 1000 / policy.Effective(settings).Fps; }
            finally { stateLock.Release(); }
            await Task.Delay(Math.Max(1, delay - (int)watch.ElapsedMilliseconds), ct);
        }
    }
    async Task ClearGrant() { await stateLock.WaitAsync(); try { grant = null; using var timeout = new CancellationTokenSource(2000); try { await desktop.Revoke(timeout.Token); } catch (Exception ex) { AgentLog.Write("revoke.error", ex.GetType().Name); } } finally { stateLock.Release(); } }
    public void Dispose() { http.Dispose(); desktop.Dispose(); sendLock.Dispose(); stateLock.Dispose(); }
}
