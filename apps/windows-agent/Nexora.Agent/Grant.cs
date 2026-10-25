using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
namespace Nexora.Remote;

public sealed record Grant(string SessionId, string DeviceId, string OrganizationId, string Mode, long ExpiresAt, int Protocol);
public static class GrantVerifier
{
    public static Grant Verify(string value, string publicKey, Identity identity)
    {
        var parts = value.Split('.'); if (parts.Length != 2) throw new InvalidDataException("Malformed grant");
        using var rsa = RSA.Create(); rsa.ImportFromPem(publicKey);
        var sig = Decode(parts[1]); if (!rsa.VerifyData(Encoding.ASCII.GetBytes(parts[0]), sig, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1)) throw new CryptographicException("Invalid grant signature");
        var g = JsonSerializer.Deserialize<Grant>(Decode(parts[0]), new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? throw new InvalidDataException();
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (g.DeviceId != identity.DeviceId || g.OrganizationId != identity.OrganizationId || g.ExpiresAt <= now || g.ExpiresAt > now + 301000 || g.Protocol != 1 || !Guid.TryParse(g.SessionId, out _) || g.Mode is not ("view" or "control")) throw new UnauthorizedAccessException("Grant scope or lifetime invalid"); return g;
    }
    static byte[] Decode(string s) { s = s.Replace('-', '+').Replace('_', '/'); return Convert.FromBase64String(s.PadRight((s.Length + 3) / 4 * 4, '=')); }
}
