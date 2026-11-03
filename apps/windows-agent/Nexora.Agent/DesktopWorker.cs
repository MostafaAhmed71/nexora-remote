using System.IO.Pipes;
using System.Text.Json;
namespace Nexora.Remote;

public sealed class DesktopWorker : Form
{
    readonly LocalDesktop desktop = new(); readonly CancellationTokenSource stop = new(); readonly Label state = new() { AutoSize = true, MaximumSize = new Size(500, 0), Text = "NEXORA Remote — waiting for local service" }; readonly Button toggle = new() { Text = "Disable remote access", AutoSize = true };
    public DesktopWorker(string pipeName) { desktop.Enabled = !File.Exists(OptOut); Text = "NEXORA Remote — interactive session worker"; Width = 600; Height = 220; var layout = new FlowLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(20), FlowDirection = FlowDirection.TopDown }; Controls.Add(layout); layout.Controls.Add(state); layout.Controls.Add(toggle); toggle.Click += async (_, _) => { desktop.Enabled = !desktop.Enabled; PersistOptOut(); await desktop.Revoke(CancellationToken.None); toggle.Text = desktop.Enabled ? "Disable remote access" : "Enable authorized access"; state.Text = desktop.Enabled ? "Enabled; only signed authorized sessions accepted" : "Disabled locally — no screen or input"; }; FormClosing += (_, e) => { if (e.CloseReason is CloseReason.WindowsShutDown or CloseReason.TaskManagerClosing) { stop.Cancel(); _ = desktop.Revoke(CancellationToken.None); return; } if (!stop.IsCancellationRequested) { e.Cancel = true; desktop.Enabled = false; PersistOptOut(); _ = desktop.Revoke(CancellationToken.None); state.Text = "Access disabled locally. Stop service to remove worker."; } }; Shown += (_, _) => { _ = Task.Run(() => Run(pipeName)); }; }
    static string OptOut => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "NexoraRemote", "access.disabled");
    void PersistOptOut() { Directory.CreateDirectory(Path.GetDirectoryName(OptOut)!); if (desktop.Enabled) { if (File.Exists(OptOut)) File.Delete(OptOut); } else File.WriteAllText(OptOut, "Remote access disabled by interactive user"); }
    async Task Run(string name)
    {
        try
        {
            using var pipe = new NamedPipeClientStream(".", name, PipeDirection.InOut, PipeOptions.Asynchronous); await pipe.ConnectAsync(10000, stop.Token); if (!Ipc.MatchesService(pipe)) throw new UnauthorizedAccessException("IPC server is not the registered service"); while (!stop.IsCancellationRequested)
            {
                var request = await Ipc.Read(pipe, stop.Token); try
                {
                    var response = await OnUi(async () =>
                    {
                        switch (request.GetProperty("type").GetString())
                        {
                            case "management": var managedIdentity = request.GetProperty("identity").Deserialize<Identity>()!; var managedResult = await desktop.Manage(request.GetProperty("signed").GetString()!, managedIdentity, request.GetProperty("nonce").GetString()!, stop.Token); return new { ok = true, payload = managedResult };
                            case "status": return new { ok = true, available = desktop.Available } as object;
                            case "grant": var identity = request.GetProperty("identity").Deserialize<Identity>()!; await desktop.Authorize(request.GetProperty("grant").GetString()!, identity, stop.Token); state.Text = "Authorized remote session active — visible and revocable"; return new { ok = true };
                            case "revoke": await desktop.Revoke(stop.Token); state.Text = "Session ended"; return new { ok = true };
                            case "input": await desktop.Apply(request.GetProperty("input"), stop.Token); return new { ok = true };
                            case "capture": var options = request.GetProperty("options").Deserialize<CaptureOptions>()!; var jpeg = await desktop.Capture(options, stop.Token); return new { ok = true, timing = desktop.Timing, jpeg = jpeg is null ? null : Convert.ToBase64String(jpeg) };
                            default: throw new InvalidDataException();
                        }
                    }); await Ipc.Write(pipe, response, stop.Token);
                }
                catch (Exception ex) { AgentLog.Write("worker.operation", ex.GetType().Name); await Ipc.Write(pipe, new { ok = false }, stop.Token); }
            }
        }
        catch (Exception ex) { AgentLog.Write("worker.disconnected", ex.GetType().Name); }
        finally { await OnUi(async () => { await desktop.Revoke(CancellationToken.None); stop.Cancel(); desktop.Dispose(); Close(); return new { ok = true }; }); }
    }
    Task<object> OnUi(Func<Task<object>> action) { var completion = new TaskCompletionSource<object>(TaskCreationOptions.RunContinuationsAsynchronously); if (IsDisposed) { completion.SetException(new ObjectDisposedException(nameof(DesktopWorker))); return completion.Task; } BeginInvoke(async () => { try { completion.SetResult(await action()); } catch (Exception e) { completion.SetException(e); } }); return completion.Task; }
}
