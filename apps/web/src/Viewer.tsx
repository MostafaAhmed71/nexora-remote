import { useEffect, useRef, useState } from "react";
import { api } from "./api";
export function Viewer({
  id,
  mode,
  onClose,
}: {
  id: string;
  mode: string;
  onClose: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    socket = useRef<WebSocket | null>(null),
    seq = useRef(0);
  const [status, setStatus] = useState("جارٍ الاتصال…"),
    [bytes, setBytes] = useState(0),
    [frames, setFrames] = useState(0),
    [rtt, setRtt] = useState(0);
  useEffect(() => {
    let stopped = false;
    let ws: WebSocket | undefined;
    let drawing = false;
    void api("/sessions/" + id + "/ticket", "POST", {})
      .then((t) => {
        if (stopped) return;
        ws = new WebSocket(
          `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/socket?ticket=${encodeURIComponent(t.ticket)}`,
        );
        socket.current = ws;
        ws.binaryType = "arraybuffer";
        ws.onopen = () =>
          setStatus("متصل • تنتهي الجلسة تلقائيًا خلال ٥ دقائق");
        ws.onclose = () =>
          setStatus("انتهى الاتصال — ابدأ جلسة جديدة للمتابعة");
        ws.onerror = () => setStatus("تعذر الاتصال");
        ws.onmessage = async (e) => {
          if (typeof e.data === "string") {
            const m = JSON.parse(e.data);
            if (m.type === "pong")
              setRtt(Math.round(performance.now() - m.sentAt));
            return;
          }
          if (!(e.data instanceof ArrayBuffer) || drawing) return;
          drawing = true;
          try {
            const image = await createImageBitmap(
              new Blob([e.data], { type: "image/jpeg" }),
            );
            if (stopped) {
              image.close();
              return;
            }
            const c = canvas.current;
            if (c) {
              c.width = image.width;
              c.height = image.height;
              c.getContext("2d")?.drawImage(image, 0, 0);
              setBytes((v) => v + e.data.byteLength);
              setFrames((v) => v + 1);
            }
            image.close();
          } finally {
            drawing = false;
          }
        };
      })
      .catch((e) => setStatus(e.message));
    return () => {
      stopped = true;
      ws?.close();
      socket.current = null;
    };
  }, [id]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (socket.current?.readyState === WebSocket.OPEN)
        socket.current.send(
          JSON.stringify({ type: "ping", sentAt: performance.now() }),
        );
    }, 2000);
    return () => clearInterval(timer);
  }, []);
  function send(event: object) {
    if (mode === "control" && socket.current?.readyState === WebSocket.OPEN)
      socket.current.send(JSON.stringify({ ...event, seq: ++seq.current }));
  }
  return (
    <section className="viewer">
      <header>
        <div>
          <strong>سطح المكتب البعيد</strong>
          <p role="status">{status}</p>
        </div>
        <span>
          {(bytes / 1048576).toFixed(2)} MB · {frames} إطار · {rtt} ms (إلى
          الخادم)
        </span>
        <button
          onClick={() => {
            void api("/sessions/" + id, "DELETE")
              .then(onClose)
              .catch((e) => setStatus(e.message));
          }}
        >
          إنهاء الجلسة
        </button>
      </header>
      <p>
        التحكم حسب تفويض الجلسة. شاشة UAC وتسجيل الدخول غير مدعومتين. لا توجد
        حافظة أو نقل ملفات في هذا الإصدار.
      </p>
      <canvas
        ref={canvas}
        tabIndex={0}
        aria-label="سطح المكتب البعيد؛ انقر للتركيز واستخدام لوحة المفاتيح"
        onBlur={() => send({ kind: "release" })}
        onContextMenu={(e) => e.preventDefault()}
        onMouseMove={(e) => {
          const b = e.currentTarget.getBoundingClientRect();
          send({
            kind: "move",
            x: (e.clientX - b.left) / b.width,
            y: (e.clientY - b.top) / b.height,
          });
        }}
        onMouseDown={(e) => {
          e.currentTarget.focus();
          if (e.button === 0 || e.button === 2)
            send({
              kind: "button",
              button: e.button === 0 ? "left" : "right",
              down: true,
            });
        }}
        onMouseUp={(e) => {
          if (e.button === 0 || e.button === 2)
            send({
              kind: "button",
              button: e.button === 0 ? "left" : "right",
              down: false,
            });
        }}
        onKeyDown={(e) => {
          e.preventDefault();
          send({ kind: "key", code: e.keyCode, down: true });
        }}
        onKeyUp={(e) => {
          e.preventDefault();
          send({ kind: "key", code: e.keyCode, down: false });
        }}
      />
      <button className="secondary" onClick={onClose}>
        العودة
      </button>
    </section>
  );
}
