using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Diagnostics;
namespace Nexora.Remote;

public interface IManagedDesktop
{
    Task<JsonElement> Manage(string signed, Identity identity, string nonce, CancellationToken ct);
}

public sealed class ManagementClient(Identity identity, IManagedDesktop desktop) : IDisposable
{
    readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(15) };
    public async Task Run(CancellationToken ct)
    {
        object payload = new { revision = 0 };
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await desktop.Manage("", identity, "", ct);
                using var challenge = await http.PostAsJsonAsync(identity.Server + "/api/agent/management/challenge", new { organizationId = identity.OrganizationId, deviceId = identity.DeviceId }, ct);
                challenge.EnsureSuccessStatusCode();
                var nonce = (await challenge.Content.ReadFromJsonAsync<JsonElement>(ct)).GetProperty("nonce").GetString()!;
                var text = JsonSerializer.Serialize(payload);
                using var rsa = RSA.Create(); rsa.ImportFromPem(identity.PrivateKey);
                var signature = Convert.ToBase64String(rsa.SignData(Encoding.UTF8.GetBytes(nonce + "\n" + text), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1));
                using var response = await http.PostAsJsonAsync(identity.Server + "/api/agent/management/sync", new { organizationId = identity.OrganizationId, deviceId = identity.DeviceId, nonce, payload = text, signature }, ct);
                response.EnsureSuccessStatusCode();
                var signed = (await response.Content.ReadFromJsonAsync<JsonElement>(ct)).GetProperty("signed").GetString()!;
                payload = await desktop.Manage(signed, identity, nonce, ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; }
            catch (Exception ex) { AgentLog.Write("management.sync", ex.GetType().Name); payload = new { error = "Management synchronization failed" }; }
            await Task.Delay(2000, ct);
        }
    }
    public void Dispose() => http.Dispose();
}

public static class ManagementVerifier
{
    public static JsonElement Verify(string signed, Identity identity, string? nonce, bool saved = false)
    {
        var parts = signed.Split('.'); if (parts.Length != 2) throw new InvalidDataException("Invalid management signature");
        static byte[] Decode(string s) => Convert.FromBase64String(s.Replace('-', '+').Replace('_', '/').PadRight((s.Length + 3) / 4 * 4, '='));
        using var rsa = RSA.Create(); rsa.ImportFromPem(identity.ServerPublicKey);
        if (!rsa.VerifyData(Encoding.ASCII.GetBytes(parts[0]), Decode(parts[1]), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1)) throw new CryptographicException();
        var state = JsonSerializer.Deserialize<JsonElement>(Decode(parts[0]));
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (state.GetProperty("kind").GetString() != "management" || state.GetProperty("deviceId").GetString() != identity.DeviceId || state.GetProperty("organizationId").GetString() != identity.OrganizationId || (!saved && (state.GetProperty("nonce").GetString() != nonce || state.GetProperty("expiresAt").GetInt64() <= now || state.GetProperty("expiresAt").GetInt64() > now + 90000))) throw new UnauthorizedAccessException("Management scope or lifetime invalid");
        return state;
    }
}

// Cooperative classroom controls. This visible, locally revocable UI is not a Windows kiosk/security boundary.
public sealed class DesktopManagement : IDisposable
{
    readonly TaskCompletionSource<ManagementPanel> ready = new(TaskCreationOptions.RunContinuationsAsynchronously);
    readonly Thread thread;
    public DesktopManagement()
    {
        thread = new Thread(() => { try { var panel = new ManagementPanel(); panel.Load += (_, _) => ready.TrySetResult(panel); Application.Run(panel); } catch (Exception ex) { ready.TrySetException(ex); } }) { IsBackground = true, Name = "Nexora classroom controls" };
        thread.SetApartmentState(ApartmentState.STA); thread.Start();
    }
    public async Task<JsonElement> Apply(string signed, Identity identity, string nonce, CancellationToken ct)
    {
        var panel = await ready.Task.WaitAsync(ct); var result = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        panel.BeginInvoke(() => { try { result.TrySetResult(panel.Apply(signed, identity, nonce)); } catch (Exception ex) { result.TrySetException(ex); } });
        return await result.Task.WaitAsync(ct);
    }
    public void Dispose() { if (ready.Task.IsCompletedSuccessfully) { var p = ready.Task.Result; if (!p.IsDisposed) p.BeginInvoke(() => { p.Shutdown = true; p.Close(); }); } }
}

sealed class ManagementPanel : Form
{
    readonly CheckBox enabled = new() { Text = "Allow master time limits and classroom controls on this Windows account", AutoSize = true };
    readonly Label status = new() { AutoSize = true, MaximumSize = new Size(620, 0) };
    readonly FlowLayoutPanel launcher = new() { AutoSize = true, FlowDirection = FlowDirection.TopDown };
    readonly FlowLayoutPanel transferConsent = new() { AutoSize = true, FlowDirection = FlowDirection.TopDown };
    readonly System.Windows.Forms.Timer tick = new() { Interval = 1000 };
    readonly Button upload = new() { Text = "Choose a file to send to the master (10 MiB max)", AutoSize = true };
    readonly Form overlay = new() { Text = "NEXORA — Time ended / locked by master", FormBorderStyle = FormBorderStyle.None, StartPosition = FormStartPosition.Manual, TopMost = true, BackColor = Color.FromArgb(16, 25, 45), ForeColor = Color.White, ShowInTaskbar = true };
    readonly Label lockLabel = new() { Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter, Font = new Font("Segoe UI", 30), Text = "NEXORA\nTime ended or device paused\nContact the master to add time" };
    readonly TimeBudget budget = new();
    int revision => budget.Revision; long? deadline => budget.Deadline; bool locked => budget.Locked;
    string? signedState; Identity? bound; bool restoreAttempted; int warned; string profileKey = "";
    string? receivingId; string? receivingName; MemoryStream? receiving; string? outgoingName; byte[]? outgoing; string? outgoingId; int outgoingOffset;
    string? offeredId; string? acceptedId; string? finishedId; string? finishedResult;
    public bool Shutdown;
    static string Root => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "NexoraRemote", "classroom");
    static string Consent => Path.Combine(Root, "enabled");
    string StatePath => Path.Combine(Root, (bound?.DeviceId ?? "none") + ".state");
    public ManagementPanel()
    {
        Text = "NEXORA — Master management (local consent)"; Width = 700; Height = 520;
        var layout = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoScroll = true, Padding = new Padding(20) };
        Controls.Add(layout); layout.Controls.AddRange([enabled, status, upload, transferConsent, new Label { AutoSize = true, MaximumSize = new Size(620, 0), Text = "Classroom mode is a guided launcher, not a secure exam kiosk. Local users can revoke management here. Received files are never executed automatically. Files use your NexoraRemote inbox. Existing programs are not terminated." }, launcher]);
        Directory.CreateDirectory(Root); enabled.Checked = File.Exists(Consent);
        enabled.CheckedChanged += (_, _) => { if (enabled.Checked) File.WriteAllText(Consent, "Locally approved classroom controls"); else { if (File.Exists(Consent)) File.Delete(Consent); overlay.Hide(); } };
        upload.Click += (_, _) => { using var dialog = new OpenFileDialog { Title = "Choose a file to share with the master" }; if (dialog.ShowDialog(this) != DialogResult.OK) return; var info = new FileInfo(dialog.FileName); if (info.Length > 10485760) { MessageBox.Show(this, "Maximum file size: 10 MiB"); return; } outgoing = File.ReadAllBytes(dialog.FileName); outgoingName = info.Name; outgoingId = Guid.NewGuid().ToString(); outgoingOffset = 0; status.Text = "File selected; waiting for master connection"; };
        overlay.Controls.Add(lockLabel); overlay.FormClosing += (_, e) => { if (!Shutdown) { e.Cancel = true; overlay.Hide(); } };
        FormClosing += (_, e) => { if (!Shutdown) { e.Cancel = true; WindowState = FormWindowState.Minimized; } else { tick.Stop(); overlay.Dispose(); tick.Dispose(); receiving?.Dispose(); } };
        tick.Tick += (_, _) => UpdateClock(); tick.Start();
    }
    void UpdateClock()
    {
        var ms = budget.Remaining(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), Environment.TickCount64);
        if (enabled.Checked && (locked || ms <= 0)) { overlay.Bounds = SystemInformation.VirtualScreen; if (!overlay.Visible) overlay.Show(); }
        else overlay.Hide();
        status.Text = !enabled.Checked ? "Master controls disabled locally" : locked ? "Locked by master / timer paused" : !deadline.HasValue ? "Enabled — no time limit" : $"Time remaining: {TimeSpan.FromMilliseconds(Math.Max(0, ms)):hh\\:mm\\:ss}";
        int threshold = ms <= 60000 ? 1 : ms <= 300000 ? 5 : 0;
        if (enabled.Checked && !locked && ms > 0 && threshold > 0 && (warned == 0 || threshold < warned)) { warned = threshold; System.Media.SystemSounds.Exclamation.Play(); status.Text += $" — warning: under {threshold} minute(s)"; }
    }
    void ReadState(JsonElement state)
    {
        int next = state.GetProperty("revision").GetInt32(); if (next < revision) throw new UnauthorizedAccessException("Old management revision");
        long? end = state.GetProperty("endsAt").ValueKind == JsonValueKind.Number ? state.GetProperty("endsAt").GetInt64() : null;
        if (budget.Apply(next, end, state.GetProperty("locked").GetBoolean(), DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), Environment.TickCount64)) warned = 0;
        var profile = state.GetProperty("profile"); var key = profile.GetRawText();
        if (key != profileKey) { profileKey = key; launcher.Controls.Clear(); if (profile.ValueKind == JsonValueKind.Object) { launcher.Controls.Add(new Label { AutoSize = true, Text = "Classroom: " + profile.GetProperty("name").GetString() }); foreach (var path in profile.GetProperty("apps").EnumerateArray().Select(x => x.GetString()!).Concat(profile.GetProperty("sites").EnumerateArray().Select(x => x.GetString()!))) { var target = path; var button = new Button { AutoSize = true, Text = target, MaximumSize = new Size(600, 0) }; button.Click += (_, _) => { if (!enabled.Checked || locked || (deadline.HasValue && deadline <= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds())) return; try { if (Uri.TryCreate(target, UriKind.Absolute, out var url) && url.Scheme == "https" && string.IsNullOrEmpty(url.UserInfo)) Process.Start(new ProcessStartInfo(target) { UseShellExecute = true }); else if (Path.IsPathFullyQualified(target) && target.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) && File.Exists(target)) Process.Start(new ProcessStartInfo(target) { UseShellExecute = false }); } catch (Exception ex) { status.Text = "Launch failed: " + ex.GetType().Name; } }; launcher.Controls.Add(button); } } }
        UpdateClock();
    }
    public JsonElement Apply(string signed, Identity identity, string nonce)
    {
        bound = identity;
        if (!restoreAttempted) { restoreAttempted = true; try { if (File.Exists(StatePath)) { var saved = Encoding.UTF8.GetString(ProtectedData.Unprotect(File.ReadAllBytes(StatePath), null, DataProtectionScope.CurrentUser)); ReadState(ManagementVerifier.Verify(saved, identity, null, true)); signedState = saved; } } catch (Exception ex) { AgentLog.Write("management.restore", ex.GetType().Name); } }
        if (signed.Length == 0) return JsonSerializer.SerializeToElement(new { revision });
        var state = ManagementVerifier.Verify(signed, identity, nonce);
        if (!enabled.Checked) return JsonSerializer.SerializeToElement(new { error = "Master controls disabled locally" });
        ReadState(state);
        if (signedState == null || ManagementVerifier.Verify(signedState, identity, null, true).GetProperty("revision").GetInt32() != revision) { signedState = signed; var temp = StatePath + ".tmp"; File.WriteAllBytes(temp, ProtectedData.Protect(Encoding.UTF8.GetBytes(signed), null, DataProtectionScope.CurrentUser)); File.Move(temp, StatePath, true); }
        var result = new Dictionary<string, object?> { ["revision"] = revision };
        if (state.TryGetProperty("uploadAck", out var ack) && ack.ValueKind == JsonValueKind.Object && outgoing != null) { outgoingId = ack.GetProperty("id").GetString(); outgoingOffset = ack.GetProperty("offset").GetInt32(); if (outgoingOffset >= outgoing.Length) { outgoing = null; outgoingId = null; status.Text = "File sent to master"; } }
        if (outgoing != null) result["upload"] = new { id = outgoingId, name = outgoingName, size = outgoing.Length, offset = outgoingOffset, data = Convert.ToBase64String(outgoing.AsSpan(outgoingOffset, Math.Min(24576, outgoing.Length - outgoingOffset))) };
        var file = state.GetProperty("file");
        if (file.ValueKind == JsonValueKind.Object)
        {
            string id = file.GetProperty("id").GetString()!, name = file.GetProperty("name").GetString()!; int size = file.GetProperty("size").GetInt32(), offset = file.GetProperty("offset").GetInt32();
            if (size > 10485760 || size < 0 || name != Path.GetFileName(name) || name.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0) throw new InvalidDataException("Unsafe transfer");
            result["fileId"] = id;
            if (finishedId == id) { result["result"] = finishedResult; return JsonSerializer.SerializeToElement(result); }
            if (receivingId != id)
            {
                if (offeredId != id) { offeredId = id; transferConsent.Controls.Clear(); transferConsent.Controls.Add(new Label { AutoSize = true, MaximumSize = new Size(620, 0), Text = $"Receive '{name}' ({size} bytes) from master into your inbox?" }); var accept = new Button { Text = "Accept file", AutoSize = true }; var reject = new Button { Text = "Reject file", AutoSize = true }; accept.Click += (_, _) => { acceptedId = id; transferConsent.Controls.Clear(); }; reject.Click += (_, _) => { finishedId = id; finishedResult = "rejected"; transferConsent.Controls.Clear(); }; transferConsent.Controls.Add(accept); transferConsent.Controls.Add(reject); }
                if (acceptedId != id) { result["offset"] = 0; return JsonSerializer.SerializeToElement(result); }
                receiving?.Dispose(); receiving = new MemoryStream(); receivingId = id; receivingName = name;
            }
            if (receiving == null) throw new InvalidDataException();
            if (offset == receiving.Length) { var bytes = Convert.FromBase64String(file.GetProperty("data").GetString()!); if (bytes.Length > 24576 || receiving.Length + bytes.Length > size) throw new InvalidDataException(); receiving.Write(bytes); }
            result["offset"] = receiving.Length;
            if (receiving.Length == size) { var inbox = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "NexoraRemote Inbox"); Directory.CreateDirectory(inbox); using (var output = new FileStream(Path.Combine(inbox, id + "_" + receivingName), FileMode.Create, FileAccess.Write, FileShare.None)) { receiving.Position = 0; receiving.CopyTo(output); } result["result"] = "complete"; finishedId = id; finishedResult = "complete"; receiving.Dispose(); receiving = null; receivingId = null; status.Text = "Saved file to " + inbox; }
        }
        return JsonSerializer.SerializeToElement(result);
    }
}
