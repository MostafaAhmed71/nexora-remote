using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
namespace Nexora.Remote;

public sealed class AgentWindow : Form
{
    readonly TextBox server = new() { Width = 420, PlaceholderText = "https://remote.example.org" }, org = new() { Width = 420, PlaceholderText = "Organization ID" }, enrollment = new() { Width = 420, PlaceholderText = "One-time enrollment token", UseSystemPasswordChar = true };
    readonly Label status = new() { AutoSize = true, MaximumSize = new Size(600, 0), Text = "NEXORA Remote — visible, authorized remote access" };
    readonly Button register = new() { Text = "Enroll this device", AutoSize = true }, connect = new() { Text = "Enable authorized access", AutoSize = true }, stop = new() { Text = "Disable access", AutoSize = true }, remove = new() { Text = "Remove local identity", AutoSize = true };
    CancellationTokenSource? cancellation; Task? running; Identity? identity;
    public AgentWindow()
    {
        Text = "NEXORA Remote Agent"; Width = 680; Height = 420; var layout = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, Padding = new Padding(24), WrapContents = false, AutoScroll = true }; Controls.Add(layout); layout.Controls.AddRange([new Label { Text = "Server / Organization / Enrollment", AutoSize = true }, server, org, enrollment, register, connect, stop, remove, status]); try { identity = IdentityStore.Load(); if (identity != null) { server.Text = identity.Server; org.Text = identity.OrganizationId; } } catch (Exception ex) { status.Text = "Identity could not be loaded: " + ex.Message; }
        register.Click += async (_, _) => { try { if (identity != null) throw new InvalidOperationException("Remove existing local identity first"); Engine.ValidateServer(server.Text); if (!Guid.TryParse(org.Text, out _)) throw new InvalidDataException("Invalid organization"); if (MessageBox.Show("Authorize enrollment and future audited desktop sessions while this agent is enabled?", Text, MessageBoxButtons.YesNo) != DialogResult.Yes) return; using var rsa = RSA.Create(3072); using var http = new HttpClient(); using var response = await http.PostAsJsonAsync(server.Text.TrimEnd('/') + "/api/agent/enroll", new { organizationId = org.Text, token = enrollment.Text, name = Environment.MachineName, publicKey = rsa.ExportSubjectPublicKeyInfoPem(), os = Environment.OSVersion.VersionString, version = "0.1.0" }); response.EnsureSuccessStatusCode(); var data = await response.Content.ReadFromJsonAsync<JsonElement>(); identity = new Identity(server.Text.TrimEnd('/'), org.Text, data.GetProperty("id").GetString()!, rsa.ExportPkcs8PrivateKeyPem(), data.GetProperty("serverPublicKey").GetString()!); IdentityStore.Save(identity); enrollment.Clear(); status.Text = "Enrolled. Device ID: " + identity.DeviceId; } catch (Exception ex) { status.Text = ex.Message; } };
        connect.Click += (_, _) => { if (identity == null) { status.Text = "Enroll first"; return; } if (running is { IsCompleted: false }) return; cancellation = new(); var engine = new Engine(identity, s => { if (!IsDisposed && IsHandleCreated) BeginInvoke(() => status.Text = s); }); running = Task.Run(async () => { try { await engine.Run(cancellation.Token); } catch (OperationCanceledException) { } finally { engine.Dispose(); } }); };
        stop.Click += async (_, _) => { await Stop(); status.Text = "Remote access disabled"; }; remove.Click += async (_, _) => { if (MessageBox.Show("Remove identity? Server trust must also be revoked in the dashboard.", Text, MessageBoxButtons.YesNo) != DialogResult.Yes) return; await Stop(); IdentityStore.Delete(); identity = null; status.Text = "Local identity removed"; };
        FormClosing += async (_, e) => { if (running is { IsCompleted: false }) { e.Cancel = true; await Stop(); Close(); } };
    }
    async Task Stop() { cancellation?.Cancel(); if (running != null) try { await running; } catch (OperationCanceledException) { } cancellation?.Dispose(); cancellation = null; running = null; }
}
