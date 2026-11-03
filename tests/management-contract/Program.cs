using Nexora.Remote;
using System.Text;
using System.Text.Json;
using System.Security.Cryptography;

if (args is ["--probe", var identityFile])
{
    var probeIdentity = JsonSerializer.Deserialize<Identity>(File.ReadAllText(identityFile), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
    var probe = new ProbeDesktop(); using var client = new ManagementClient(probeIdentity, probe); using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(15));
    var running = client.Run(stop.Token);
    await probe.Completed.Task.WaitAsync(stop.Token);
    stop.Cancel(); try { await running; } catch (OperationCanceledException) { }
    Console.WriteLine($"Native management HTTP proof and signed response: {probe.Count} successful round trips; revision {probe.Revision}. No UI or lock was performed.");
    return;
}

int checks = 0;
void Check(bool condition, string name) { if (!condition) throw new Exception(name); checks++; }
void Reject(Action action, string name) { try { action(); } catch (Exception ex) when (ex is UnauthorizedAccessException or CryptographicException or InvalidDataException) { checks++; return; } throw new Exception(name); }
using var rsa = RSA.Create(2048);
var identity = new Identity("http://127.0.0.1", Guid.NewGuid().ToString(), Guid.NewGuid().ToString(), rsa.ExportPkcs8PrivateKeyPem(), rsa.ExportSubjectPublicKeyInfoPem());
string Sign(object value) { var data = Convert.ToBase64String(JsonSerializer.SerializeToUtf8Bytes(value)).TrimEnd('=').Replace('+', '-').Replace('/', '_'); var signature = Convert.ToBase64String(rsa.SignData(Encoding.ASCII.GetBytes(data), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1)).TrimEnd('=').Replace('+', '-').Replace('/', '_'); return data + "." + signature; }
var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
var signed = Sign(new { kind = "management", deviceId = identity.DeviceId, organizationId = identity.OrganizationId, nonce = "fresh", expiresAt = now + 60000 });
Check(ManagementVerifier.Verify(signed, identity, "fresh").GetProperty("kind").GetString() == "management", "valid signed state");
Reject(() => ManagementVerifier.Verify(signed, identity, "other"), "response nonce binding");
Reject(() => ManagementVerifier.Verify(signed, identity with { DeviceId = Guid.NewGuid().ToString() }, "fresh"), "device binding");
Reject(() => ManagementVerifier.Verify(signed, identity with { OrganizationId = Guid.NewGuid().ToString() }, "fresh"), "tenant binding");
var expired = Sign(new { kind = "management", deviceId = identity.DeviceId, organizationId = identity.OrganizationId, nonce = "fresh", expiresAt = now - 1000 });
Reject(() => ManagementVerifier.Verify(expired, identity, "fresh"), "expired network state");
Check(ManagementVerifier.Verify(expired, identity, null, true).GetProperty("expiresAt").GetInt64() == now - 1000, "signed persisted policy restores offline");
var budget = new TimeBudget();
budget.Apply(1, 61000, false, 1000, 5000);
Check(budget.Remaining(31000, 35000) == 30000, "countdown");
Check(budget.IsLocked(1000, 65001), "clock rollback cannot extend current runtime");
budget.Apply(1, 61000, false, 1000, 65001);
Check(budget.IsLocked(1000, 65001), "sync does not reset elapsed monotonic time");
Reject(() => budget.Apply(0, null, false, 1000, 65001), "old revision replay");
budget.Apply(2, null, true, 1000, 65001); Check(budget.IsLocked(1000, 65001), "manual pause lock");
budget.Apply(3, null, false, 1000, 65001); Check(!budget.IsLocked(1000, 65001), "explicit master unlock");
var rebooted = new TimeBudget(); rebooted.Apply(4, 5000, false, 6000, 10); Check(rebooted.IsLocked(6000, 10), "expired restored timer");
Console.WriteLine($"Management contracts: {checks} passed. No desktop lock or input was performed.");

sealed class ProbeDesktop : IManagedDesktop
{
    public int Count; public int Revision;
    public readonly TaskCompletionSource Completed = new(TaskCreationOptions.RunContinuationsAsynchronously);
    public Task<JsonElement> Manage(string signed, Identity identity, string nonce, CancellationToken ct)
    {
        if (signed.Length == 0) return Task.FromResult(JsonSerializer.SerializeToElement(new { revision = Revision }));
        var state = ManagementVerifier.Verify(signed, identity, nonce);
        Revision = state.GetProperty("revision").GetInt32(); Count++;
        if (Count >= 2) Completed.TrySetResult();
        return Task.FromResult(JsonSerializer.SerializeToElement(new { revision = Revision }));
    }
}
