using System.Text.Json;
namespace Nexora.Remote;

public static class AgentLog { static readonly object Sync = new(); public static void Write(string name, string? detail = null) { try { lock (Sync) { var root = Environment.UserInteractive ? Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData) : Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData); var dir = Path.Combine(root, "NexoraRemote", "logs"); Directory.CreateDirectory(dir); var file = Path.Combine(dir, "agent.jsonl"); if (File.Exists(file) && new FileInfo(file).Length > 1048576) { File.Move(file, file + ".previous", true); } File.AppendAllText(file, JsonSerializer.Serialize(new { time = DateTimeOffset.UtcNow, eventName = name, detail }) + Environment.NewLine); } } catch { } } }
