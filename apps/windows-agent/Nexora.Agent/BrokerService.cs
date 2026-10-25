using System.ServiceProcess;
namespace Nexora.Remote;

public sealed class BrokerService : ServiceBase
{
    CancellationTokenSource? stop; Task? running;
    public BrokerService() { ServiceName = "NexoraRemote"; CanStop = true; CanHandleSessionChangeEvent = true; CanShutdown = true; AutoLog = false; }
    protected override void OnStart(string[] args) { stop = new(); running = Task.Run(() => Run(stop.Token)); AgentLog.Write("service.started"); }
    async Task Run(CancellationToken ct) { while (!ct.IsCancellationRequested) { try { var identity = MachineIdentity.Load(); if (identity != null) { var desktop = new SessionBroker(); using var engine = new Engine(identity, _ => { }, desktop); await engine.Run(ct); } } catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; } catch (Exception ex) { AgentLog.Write("service.error", ex.GetType().Name); } await Task.Delay(2000, ct); } }
    protected override void OnSessionChange(SessionChangeDescription change)
    {
        bool blocked = change.Reason is SessionChangeReason.SessionLock or SessionChangeReason.SessionLogoff or SessionChangeReason.ConsoleDisconnect or SessionChangeReason.RemoteDisconnect;
        SessionLifecycle.Change((uint)change.SessionId, blocked);
        AgentLog.Write("service.session_change", change.Reason.ToString());
    }
    protected override void OnShutdown() { OnStop(); base.OnShutdown(); }
    protected override void OnStop() { stop?.Cancel(); if (running != null) { RequestAdditionalTime(15000); try { running.Wait(12000); } catch (AggregateException e) when (e.InnerExceptions.All(x => x is OperationCanceledException)) { } } stop?.Dispose(); AgentLog.Write("service.stopped"); }
}
