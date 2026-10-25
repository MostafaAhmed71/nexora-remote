namespace Nexora.Remote;
public sealed record CaptureOptions(int Width = 1280, int Quality = 55, int Fps = 5, int Monitor = 0) { public CaptureOptions Validate() => this with { Width = Math.Clamp(Width, 320, 2560), Quality = Math.Clamp(Quality, 15, 85), Fps = Math.Clamp(Fps, 1, 15), Monitor = Math.Clamp(Monitor, 0, 31) }; }
