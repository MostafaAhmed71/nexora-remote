using System.Security.Cryptography;
using System.Text.Json;
namespace Nexora.Remote;

public sealed record Identity(string Server, string OrganizationId, string DeviceId, string PrivateKey, string ServerPublicKey);
public static class IdentityStore
{
    static readonly string Folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "NexoraRemote");
    static readonly string FileName = Path.Combine(Folder, "identity.dpapi");
    public static void Save(Identity value) { Directory.CreateDirectory(Folder); var bytes = JsonSerializer.SerializeToUtf8Bytes(value); var encrypted = ProtectedData.Protect(bytes, null, DataProtectionScope.CurrentUser); File.WriteAllBytes(FileName + ".tmp", encrypted); File.Move(FileName + ".tmp", FileName, true); CryptographicOperations.ZeroMemory(bytes); }
    public static Identity? Load() { if (!File.Exists(FileName)) return null; var bytes = ProtectedData.Unprotect(File.ReadAllBytes(FileName), null, DataProtectionScope.CurrentUser); try { return JsonSerializer.Deserialize<Identity>(bytes); } finally { CryptographicOperations.ZeroMemory(bytes); } }
    public static void Delete() { if (File.Exists(FileName)) File.Delete(FileName); }
}
