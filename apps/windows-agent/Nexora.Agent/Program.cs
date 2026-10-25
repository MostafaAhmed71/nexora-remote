using System.ServiceProcess;
namespace Nexora.Remote;

internal static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        if (args is ["--service"]) { ServiceBase.Run(new BrokerService()); return; }
        if (args is ["--install-service"]) { try { ServiceRegistration.Install(); } catch (Exception ex) { AgentLog.Write("service.install_failed", ex.GetType().Name); Environment.ExitCode = 1; } return; }
        if (args is ["--start-service"]) { try { using var service = new ServiceController("NexoraRemote"); if (service.Status == ServiceControllerStatus.Stopped) service.Start(); service.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(20)); } catch { Environment.ExitCode = 1; } return; }
        if (args is ["--stop-service"]) { try { ServiceRegistration.Stop(); } catch { Environment.ExitCode = 1; } return; }
        if (args is ["--uninstall-service"]) { try { ServiceRegistration.Remove(); } catch { Environment.ExitCode = 1; } return; }
        ApplicationConfiguration.Initialize(); if (args is ["--worker", var pipe]) { if (!pipe.StartsWith("NexoraRemote-", StringComparison.Ordinal) || pipe.Length > 100) throw new ArgumentException("Invalid worker pipe"); using var single = new Mutex(true, @"Local\NexoraRemote-InteractiveWorker", out bool created); if (!created) { AgentLog.Write("worker.duplicate_refused"); return; } try { Application.Run(new DesktopWorker(pipe)); } finally { single.ReleaseMutex(); } return; }
        if (args.Contains("--configure-service") && !MachineIdentity.IsAdministrator) { try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(Environment.ProcessPath!) { UseShellExecute = true, Verb = "runas", Arguments = "--configure-service" }); } catch { MessageBox.Show("Administrator approval is required for machine enrollment and service controls."); } return; }
        Application.Run(new AgentWindow(args.Contains("--configure-service")));
    }
}
