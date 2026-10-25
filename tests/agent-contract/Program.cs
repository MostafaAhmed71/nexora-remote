using System.Security.Cryptography;using System.Text;using System.Text.Json;using Nexora.Remote;
using var rsa=RSA.Create(3072);var id=new Identity("https://localhost",Guid.NewGuid().ToString(),Guid.NewGuid().ToString(),"",rsa.ExportSubjectPublicKeyInfoPem());
string Sign(object value){var body=Convert.ToBase64String(JsonSerializer.SerializeToUtf8Bytes(value)).TrimEnd('=').Replace('+','-').Replace('/','_');var sig=rsa.SignData(Encoding.ASCII.GetBytes(body),HashAlgorithmName.SHA256,RSASignaturePadding.Pkcs1);return body+"."+Convert.ToBase64String(sig).TrimEnd('=').Replace('+','-').Replace('/','_');}
var valid=new Grant(Guid.NewGuid().ToString(),id.DeviceId,id.OrganizationId,"control",DateTimeOffset.UtcNow.AddMinutes(2).ToUnixTimeMilliseconds(),2);GrantVerifier.Verify(Sign(valid),id.ServerPublicKey,id);
void Reject(Action action){try{action();}catch{return;}throw new Exception("Invalid grant accepted");}
Reject(()=>GrantVerifier.Verify(Sign(valid with{DeviceId=Guid.NewGuid().ToString()}),id.ServerPublicKey,id));Reject(()=>GrantVerifier.Verify(Sign(valid with{ExpiresAt=1}),id.ServerPublicKey,id));Reject(()=>GrantVerifier.Verify(Sign(valid with{Mode="shell"}),id.ServerPublicKey,id));Reject(()=>GrantVerifier.Verify(Sign(valid with{Protocol=99}),id.ServerPublicKey,id));Console.WriteLine("5 grant contract checks passed; no desktop capture/input tested");


var policy = new StreamPolicy(); var requested = new CaptureOptions(1280,55,12);
for(int i=0;i<10;i++) policy.Observe(500,requested,true);
Check(policy.Level==3 && policy.Effective(requested).Width<requested.Width && policy.Effective(requested).Quality<requested.Quality && policy.Effective(requested).Fps<requested.Fps,"Congestion downshift bounded");
for(int i=0;i<90;i++) policy.Observe(1,requested);
Check(policy.Level==0,"Sustained recovery");
Check(RecoveryDelay.Milliseconds(100,249)==30249 && RecoveryDelay.Milliseconds(-1,-1)==1000,"Bounded backoff");
uint session=9876; var generation=SessionLifecycle.Generation(session); SessionLifecycle.Change(session,true);
Check(!SessionLifecycle.Usable(session,generation),"Lock invalidates lease"); SessionLifecycle.Change(session,false);
Check(!SessionLifecycle.Usable(session,generation)&&SessionLifecycle.Usable(session,SessionLifecycle.Generation(session)),"Unlock requires fresh lease");
Console.WriteLine("5 streaming and session lifecycle policy checks passed");

void Check(bool value,string message) { if(!value)throw new Exception(message); }
namespace Nexora.Remote {public sealed record Identity(string Server,string OrganizationId,string DeviceId,string PrivateKey,string ServerPublicKey);}
