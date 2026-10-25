import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { pointInFrame, virtualKey } from "./remote-input";
const presets = {
  low: { width: 800, quality: 35, fps: 3 },
  balanced: { width: 1280, quality: 55, fps: 8 },
  high: { width: 1920, quality: 75, fps: 12 },
};
export function Viewer({
  id,
  mode,
  onClose,
}: {
  id: string;
  mode: string;
  onClose: () => void;
}) {
  const root = useRef<HTMLElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    socket = useRef<WebSocket | null>(null),
    seq = useRef(0),
    lastMove = useRef(0),
    physicalKeys = useRef(new Set<number>()),
    activeId = useRef(id),
    device = useRef(""),
    intentional = useRef(false),
    ready = useRef(false),
    totals = useRef({ frames: 0, bytes: 0 });
  const [status, setStatus] = useState("جارٍ التفويض…"),
    [metrics, setMetrics] = useState({ fps: 0, kbps: 0, mb: 0 }),
    [rtt, setRtt] = useState<number | null>(null),
    [size, setSize] = useState(""),
    [fit, setFit] = useState(true),
    [zoom, setZoom] = useState(100),
    [duration, setDuration] = useState(0),
    [agentTiming, setAgentTiming] = useState<{
      capture: number;
      encode: number;
    } | null>(null),
    [preset, setPreset] = useState<keyof typeof presets>("balanced"),
    [monitor, setMonitor] = useState(0),
    [retry, setRetry] = useState(0),
    [text, setText] = useState(""),
    [connected, setConnected] = useState(false),
    [error, setError] = useState("");
  const quality = useRef({ ...presets.balanced, monitor: 0 });
  useEffect(() => {
    quality.current = { ...presets[preset], monitor };
    if (ready.current)
      socket.current?.send(
        JSON.stringify({ type: "quality", settings: quality.current }),
      );
  }, [preset, monitor]);
  useEffect(() => {
    let stopped = false,
      attempt = 0,
      timer: ReturnType<typeof setTimeout> | undefined;
    intentional.current = false;
    let drawing = false;
    const started = Date.now();
    const durationTimer = setInterval(
      () => setDuration(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    async function connect() {
      try {
        setError("");
        if (!device.current) {
          const sessions = await api("/sessions");
          device.current =
            sessions.find((s: any) => s.id === id)?.device_id ?? "";
        }
        if (attempt > 0) {
          if (!device.current)
            throw new Error("تعذر تحديد الجهاز لإعادة التفويض");
          const fresh = await api("/sessions", "POST", {
            deviceId: device.current,
            mode,
          });
          activeId.current = fresh.id;
        }
        const t = await api(
          "/sessions/" + activeId.current + "/ticket",
          "POST",
          {},
        );
        if (stopped) return;
        const ws = new WebSocket(
          `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/socket`,
          ["nexora.v2", "ticket." + t.ticket],
        );
        socket.current = ws;
        ws.binaryType = "arraybuffer";
        ws.onopen = () => setStatus("متصل بالخادم — جارٍ تأكيد التفويض");
        ws.onerror = () => setError("تعذر الاتصال الآمن");
        ws.onclose = () => {
          ready.current = false;
          setConnected(false);
          if (stopped || intentional.current) return;
          if (attempt < 5) {
            setStatus("انقطع الاتصال — إعادة تفويض آمنة…");
            timer = setTimeout(
              () => {
                attempt++;
                void connect();
              },
              Math.min(15000, 1000 * 2 ** attempt),
            );
          } else setStatus("توقفت إعادة المحاولة؛ اضغط إعادة الاتصال");
        };
        ws.onmessage = async (e) => {
          if (stopped || socket.current !== ws) return;
          if (typeof e.data === "string") {
            try {
              const m = JSON.parse(e.data);
              if (m.type === "ready") {
                ready.current = true;
                setConnected(true);
                seq.current = 0;
                setRtt(null);
                setAgentTiming(null);
                ws.send(JSON.stringify({ type: "stream", acks: true }));
                setStatus("جلسة مصرح بها • تنتهي تلقائيًا خلال ٥ دقائق");
                ws.send(
                  JSON.stringify({
                    type: "quality",
                    settings: quality.current,
                  }),
                );
              }
              if (m.type === "pong")
                setRtt(Math.max(0, Math.round(performance.now() - m.sentAt)));
              if (
                m.type === "health" &&
                m.timing &&
                Number.isFinite(m.timing.CaptureMs) &&
                Number.isFinite(m.timing.EncodeMs)
              )
                setAgentTiming({
                  capture: m.timing.CaptureMs,
                  encode: m.timing.EncodeMs,
                });
              if (m.type === "health" && !m.interactive)
                setStatus("لا توجد جلسة مستخدم تفاعلية قابلة للتحكم");
            } catch {
              setError("رسالة حالة غير صالحة");
            }
            return;
          }
          if (!(e.data instanceof ArrayBuffer)) return;
          totals.current.bytes += e.data.byteLength;
          if (drawing) return;
          drawing = true;
          try {
            const image = await createImageBitmap(
              new Blob([e.data], { type: "image/jpeg" }),
            );
            if (stopped || socket.current !== ws) {
              image.close();
              return;
            }
            const c = canvas.current;
            if (c) {
              if (c.width !== image.width || c.height !== image.height) {
                c.width = image.width;
                c.height = image.height;
                setSize(image.width + " × " + image.height);
              }
              c.getContext("2d")?.drawImage(image, 0, 0);
              totals.current.frames++;
            }
            image.close();
          } catch {
            setError("تعذر فك إطار الشاشة");
          } finally {
            drawing = false;
            if (socket.current === ws && ws.readyState === WebSocket.OPEN)
              ws.send(JSON.stringify({ type: "frameAck" }));
          }
        };
      } catch (e) {
        if (stopped) return;
        setError((e as Error).message);
        if (attempt < 5 && !intentional.current)
          timer = setTimeout(
            () => {
              attempt++;
              void connect();
            },
            Math.min(15000, 1000 * 2 ** attempt),
          );
        else setStatus("تعذرت إعادة الجلسة؛ يلزم تسجيل الدخول أو جهاز متصل");
      }
    }
    void connect();
    return () => {
      stopped = true;
      ready.current = false;
      clearTimeout(timer);
      clearInterval(durationTimer);
      socket.current?.close();
      socket.current = null;
    };
  }, [id, mode, retry]);
  useEffect(() => {
    let last = { ...totals.current },
      stamp = performance.now();
    const t = setInterval(() => {
      const now = performance.now(),
        seconds = (now - stamp) / 1000,
        v = totals.current;
      setMetrics({
        fps: (v.frames - last.frames) / seconds,
        kbps: ((v.bytes - last.bytes) * 8) / 1000 / seconds,
        mb: v.bytes / 1048576,
      });
      last = { ...v };
      stamp = now;
      if (ready.current)
        socket.current?.send(JSON.stringify({ type: "ping", sentAt: now }));
    }, 1000);
    return () => clearInterval(t);
  }, []);
  function send(event: object) {
    if (
      mode === "control" &&
      ready.current &&
      socket.current?.readyState === WebSocket.OPEN
    )
      socket.current.send(JSON.stringify({ ...event, seq: ++seq.current }));
  }
  useEffect(() => {
    const release = () => send({ kind: "release" });
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    return () => {
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", release);
    };
  }, [mode]);
  return (
    <section ref={root} className="viewer">
      <header>
        <div>
          <strong>سطح المكتب البعيد</strong>
          <p role="status">{status}</p>
        </div>
        <span>
          {metrics.fps.toFixed(1)} FPS · {metrics.kbps.toFixed(0)} kbps ·{" "}
          {metrics.mb.toFixed(2)} MB ·{" "}
          {rtt === null || !connected ? "RTT غير مقاس" : rtt + " ms RTT للخادم"}{" "}
          · {size} · {duration} ث · {mode === "view" ? "مشاهدة فقط" : "تحكم"}
          {agentTiming
            ? ` · التقاط ${agentTiming.capture.toFixed(1)} ms · ترميز ${agentTiming.encode.toFixed(1)} ms`
            : " · توقيت Agent غير مقاس"}
        </span>
        <button
          onClick={() => {
            intentional.current = true;
            send({ kind: "release" });
            void api("/sessions/" + activeId.current, "DELETE")
              .then(() => {
                socket.current?.close();
                onClose();
              })
              .catch((e) => {
                setError(e.message);
                socket.current?.close();
              });
          }}
        >
          إنهاء الجلسة
        </button>
      </header>
      <div className="remote-toolbar">
        <button
          onClick={() => {
            void root.current
              ?.requestFullscreen()
              .catch(() => setError("تعذر فتح ملء الشاشة"));
          }}
        >
          ملء الشاشة
        </button>
        <button onClick={() => setFit(!fit)}>
          {fit ? "حجم الإطار الأصلي" : "ملاءمة الشاشة"}
        </button>
        <label>
          تكبير {zoom}%
          <input
            aria-label="تكبير"
            type="range"
            min="50"
            max="200"
            step="25"
            value={zoom}
            onChange={(e) => {
              setZoom(Number(e.target.value));
              setFit(false);
            }}
          />
        </label>
        <label>
          الجودة
          <select
            aria-label="الجودة"
            value={preset}
            onChange={(e) => setPreset(e.target.value as keyof typeof presets)}
          >
            <option value="low">اتصال ضعيف</option>
            <option value="balanced">متوازنة</option>
            <option value="high">مرتفعة</option>
          </select>
        </label>
        <label>
          رقم الشاشة (٠ = الأولى)
          <input
            type="number"
            min="0"
            max="31"
            value={monitor}
            onChange={(e) =>
              setMonitor(Math.min(31, Math.max(0, Number(e.target.value))))
            }
          />
        </label>
        <button
          disabled={connected}
          onClick={() => {
            socket.current?.close();
            setRetry((v) => v + 1);
          }}
        >
          إعادة الاتصال
        </button>
        <button disabled title="نقل الملفات غير منفذ">
          الملفات — غير متاح
        </button>
        <button disabled title="مزامنة الحافظة غير منفذة">
          الحافظة — غير متاحة
        </button>
      </div>
      <p>
        القياسات تخص الإطارات المستلمة وزمن الخادم؛ زمن الإدخال إلى Windows غير
        مقاس. UAC وشاشة تسجيل الدخول غير مدعومتين.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="remote-screen">
        <canvas
          ref={canvas}
          className={fit ? "fit" : "actual"}
          style={fit ? undefined : { width: `${zoom}%`, maxWidth: "none" }}
          tabIndex={0}
          aria-label="سطح المكتب البعيد"
          onBlur={() => send({ kind: "release" })}
          onContextMenu={(e) => e.preventDefault()}
          onPointerMove={(e) => {
            if (performance.now() - lastMove.current < 33) return;
            lastMove.current = performance.now();
            send({
              kind: "move",
              ...pointInFrame(
                e.clientX,
                e.clientY,
                e.currentTarget.getBoundingClientRect(),
              ),
            });
          }}
          onPointerDown={(e) => {
            e.currentTarget.focus();
            e.currentTarget.setPointerCapture(e.pointerId);
            send({
              kind: "move",
              ...pointInFrame(
                e.clientX,
                e.clientY,
                e.currentTarget.getBoundingClientRect(),
              ),
            });
            if (e.button === 0 || e.button === 2)
              send({
                kind: "button",
                button: e.button === 0 ? "left" : "right",
                down: true,
              });
          }}
          onPointerUp={(e) => {
            if (e.button === 0 || e.button === 2)
              send({
                kind: "button",
                button: e.button === 0 ? "left" : "right",
                down: false,
              });
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={() => send({ kind: "release" })}
          onWheel={(e) => {
            e.preventDefault();
            send({
              kind: "wheel",
              delta: Math.max(-1200, Math.min(1200, -Math.round(e.deltaY))),
            });
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            e.preventDefault();
            if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
              send({ kind: "text", text: e.key });
              return;
            }
            const code = virtualKey(e.code);
            if (code) {
              physicalKeys.current.add(code);
              send({ kind: "key", code, down: true });
            }
          }}
          onKeyUp={(e) => {
            e.preventDefault();
            const code = virtualKey(e.code);
            if (code && physicalKeys.current.delete(code))
              send({ kind: "key", code, down: false });
          }}
        />
      </div>
      {mode === "control" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text) send({ kind: "text", text });
            setText("");
          }}
        >
          <label>
            كتابة Unicode / عربي من لوحة هاتف أو IME
            <textarea
              maxLength={1024}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <button disabled={!connected || !text}>كتابة النص على الجهاز</button>
        </form>
      )}
      <button
        className="secondary"
        onClick={() => {
          intentional.current = true;
          socket.current?.close();
          onClose();
        }}
      >
        العودة وإغلاق الاتصال
      </button>
    </section>
  );
}
