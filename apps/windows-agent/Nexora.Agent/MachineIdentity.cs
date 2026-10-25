using System.Security.AccessControl;
using System.Security.Principal;
using System.Security.Cryptography;
using System.Text.Json;
namespace Nexora.Remote;

public static class MachineIdentity
{
    public static string Folder => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "NexoraRemote");
    static string FileName => Path.Combine(Folder, "machine.dpapi");
    public static bool IsAdministrator => new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator);
    public static void Save(Identity value) { if (!IsAdministrator) throw new UnauthorizedAccessException("Administrator authorization required for machine enrollment"); var dir = Directory.CreateDirectory(Folder); var acl = new DirectorySecurity(); acl.SetAccessRuleProtection(true, false); foreach (var sid in new[] { new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null), new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null) }) acl.AddAccessRule(new FileSystemAccessRule(sid, FileSystemRights.FullControl, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow)); dir.SetAccessControl(acl); var bytes = JsonSerializer.SerializeToUtf8Bytes(value); try { File.WriteAllBytes(FileName + ".tmp", ProtectedData.Protect(bytes, null, DataProtectionScope.LocalMachine)); File.Move(FileName + ".tmp", FileName, true); } finally { CryptographicOperations.ZeroMemory(bytes); } }
    public static Identity? Load() { if (!File.Exists(FileName)) return null; var b = ProtectedData.Unprotect(File.ReadAllBytes(FileName), null, DataProtectionScope.LocalMachine); try { return JsonSerializer.Deserialize<Identity>(b); } finally { CryptographicOperations.ZeroMemory(b); } }
    public static void Delete() { if (!IsAdministrator) throw new UnauthorizedAccessException(); if (File.Exists(FileName)) File.Delete(FileName); }
}
