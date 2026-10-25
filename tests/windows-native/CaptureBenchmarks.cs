using Nexora.Remote;
using System.Diagnostics;
using System.Drawing.Imaging;
internal static class CaptureBenchmarks
{
    public static async Task<object> Run(LocalDesktop desktop)
    {
        var results = new List<object>(); var options = new CaptureOptions();
        foreach(bool legacy in new[]{true,false})
        {
            await desktop.Capture(options,CancellationToken.None); // warm up managed encoder/JIT
            long allocation=GC.GetTotalAllocatedBytes(), bytes=0; var process=Process.GetCurrentProcess(); var cpu=process.TotalProcessorTime; var watch=Stopwatch.StartNew();
            double capture=0, encode=0;
            for(int i=0;i<10;i++)
            {
                byte[]? jpeg;
                if(legacy)
                {
                    var timer=Stopwatch.StartNew(); var b=Screen.PrimaryScreen!.Bounds;
                    using var bitmap=new Bitmap(b.Width,b.Height,PixelFormat.Format24bppRgb);
                    using(var g=Graphics.FromImage(bitmap))g.CopyFromScreen(b.Location,Point.Empty,b.Size,CopyPixelOperation.SourceCopy);
                    capture+=timer.Elapsed.TotalMilliseconds; timer.Restart(); jpeg=JpegEncoder.Encode(bitmap,options); encode+=timer.Elapsed.TotalMilliseconds;
                }
                else { jpeg=await desktop.Capture(options,CancellationToken.None); capture+=desktop.Timing.CaptureMs; encode+=desktop.Timing.EncodeMs; }
                if(jpeg==null)throw new Exception("Authorized capture benchmark unavailable"); bytes+=jpeg.Length;
            }
            results.Add(new{profile=legacy?"allocation-per-frame baseline":"reused capture bitmap",frames=10,elapsedMs=watch.Elapsed.TotalMilliseconds,meanCaptureMs=capture/10,meanEncodeMs=encode/10,bytes,averageFrameBytes=bytes/10.0,cpuMs=(process.TotalProcessorTime-cpu).TotalMilliseconds,managedAllocationBytes=GC.GetTotalAllocatedBytes()-allocation,rssBytes=process.WorkingSet64,realWindowsCapture=true,networkMeasured=false});
        }
        return new{scope="Sequential same-run real desktop microbenchmark; baseline retains current shared JPEG encoder; not a historical 0.2 binary, WAN or service-worker benchmark",results};
    }
}
