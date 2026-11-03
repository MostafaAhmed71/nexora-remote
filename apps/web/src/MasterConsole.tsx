import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, organizationId } from "./api";

type Device = {
  id: string;
  name: string;
  group_id: string | null;
  room: string | null;
  seat_x: number | null;
  seat_y: number | null;
  notes: string | null;
  online: boolean;
  effectiveLocked: boolean;
  ends_at: string | null;
  paused_seconds: number | null;
  revision: number;
  agent_revision: number | null;
  agent_error: string | null;
  managementReady: boolean;
  profile_id: string | null;
};
type Package = { id: string; name: string; minutes: number };
type Profile = { id: string; name: string; apps: string[]; sites: string[] };
type FileRow = {
  id: string;
  name: string;
  size: number;
  direction: string;
  status: string;
  transferred: number;
};
export function MasterConsole() {
  const client = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]),
    [search, setSearch] = useState(""),
    [room, setRoom] = useState("*"),
    [group, setGroup] = useState("*"),
    [minutes, setMinutes] = useState(60),
    [packageId, setPackage] = useState(""),
    [profileId, setProfile] = useState(""),
    [batchGroup, setBatchGroup] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [now, setNow] = useState(Date.now());
  const [layoutDevice, setLayoutDevice] = useState(""),
    [fileDevice, setFileDevice] = useState("");
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const devices = useQuery<Device[]>({
    queryKey: [organizationId, "master-devices"],
    queryFn: () => api("/master/devices"),
    enabled: !!organizationId,
    refetchInterval: 5000,
  });
  const packages = useQuery<Package[]>({
    queryKey: [organizationId, "master-packages"],
    queryFn: () => api("/master/packages"),
    enabled: !!organizationId,
  });
  const profiles = useQuery<Profile[]>({
    queryKey: [organizationId, "master-profiles"],
    queryFn: () => api("/master/profiles"),
    enabled: !!organizationId,
  });
  const groups = useQuery<{ id: string; name: string }[]>({
    queryKey: [organizationId, "master-groups"],
    queryFn: () => api("/groups"),
    enabled: !!organizationId,
  });
  const files = useQuery<FileRow[]>({
    queryKey: [organizationId, "master-files", fileDevice],
    queryFn: () => api(`/master/devices/${fileDevice}/files`),
    enabled: !!organizationId && !!fileDevice,
    refetchInterval: 2000,
  });
  async function act(
    fn: () => Promise<unknown>,
    success = "تم حفظ الطلب؛ تابع حالة تطبيقه على الأجهزة.",
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage(success);
      await client.invalidateQueries({
        predicate: (q) => q.queryKey[0] === organizationId,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function batch(action: string, extra: object = {}) {
    await act(() =>
      api("/master/batch", "POST", { deviceIds: selected, action, ...extra }),
    );
  }
  const all = devices.data ?? [],
    visible = all.filter(
      (d) =>
        d.name.toLowerCase().includes(search.toLowerCase()) &&
        (room === "*" || (d.room ?? "") === room) &&
        (group === "*" || (d.group_id ?? "") === group),
    );
  const rooms = [...new Set(all.map((d) => d.room ?? ""))];
  const remaining = (d: Device) =>
    d.paused_seconds !== null && d.paused_seconds !== undefined
      ? `متوقف: ${Math.ceil(d.paused_seconds / 60)} دقيقة`
      : d.ends_at
        ? `${Math.floor(Math.max(0, new Date(d.ends_at).getTime() - now) / 60000)}:${String(Math.floor(Math.max(0, new Date(d.ends_at).getTime() - now) / 1000) % 60).padStart(2, "0")}`
        : "وقت مفتوح";
  function toggle(id: string) {
    setSelected((old) =>
      old.includes(id) ? old.filter((x) => x !== id) : [...old, id],
    );
  }
  if (!organizationId)
    return <div className="card">اختر المؤسسة لفتح لوحة الماستر.</div>;
  const queryError =
    devices.error ?? packages.error ?? profiles.error ?? groups.error;
  return (
    <div className="master-console">
      <p className="card">
        الوقت والقفل يُطبّقان بواسطة وكيل Windows المحدث، بعد تفعيل الإدارة
        محليًا. «بانتظار التطبيق» تعني أن الجهاز لم يؤكد التنفيذ بعد. صلاحيات
        الماستر للمالك والمدير.
      </p>
      {(error || queryError) && (
        <p className="error card" role="alert">
          {error || queryError?.message}
        </p>
      )}
      {message && (
        <p className="card" role="status">
          {message}
        </p>
      )}
      <section className="card">
        <h2>الأجهزة وإدارة المجموعات</h2>
        <div className="remote-toolbar">
          <label>
            بحث باسم الجهاز
            <input value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <label>
            القاعة
            <select value={room} onChange={(e) => setRoom(e.target.value)}>
              <option value="*">كل القاعات</option>
              {rooms.map((r) => (
                <option key={r} value={r}>
                  {r || "بدون قاعة"}
                </option>
              ))}
            </select>
          </label>
          <label>
            المجموعة
            <select value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="*">كل المجموعات</option>
              <option value="">بدون مجموعة</option>
              {groups.data?.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => setSelected(visible.map((d) => d.id))}>
            تحديد الظاهر
          </button>
          <button onClick={() => setSelected([])}>إلغاء التحديد</button>
          <span>المحدد: {selected.length}</span>
        </div>
        {devices.isPending ? (
          <p>جارٍ تحميل الأجهزة…</p>
        ) : !all.length ? (
          <p>لا توجد أجهزة مسجلة. سجّل جهازًا من صفحة تسجيل جهاز.</p>
        ) : (
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>اختيار</th>
                  <th>الجهاز</th>
                  <th>الحالة المطلوبة</th>
                  <th>الوقت</th>
                  <th>التطبيق على الجهاز</th>
                  <th>القاعة</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`تحديد ${d.name}`}
                        checked={selected.includes(d.id)}
                        onChange={() => toggle(d.id)}
                      />
                    </td>
                    <td>
                      {d.name}
                      <small className="master-detail">{d.notes}</small>
                    </td>
                    <td>{d.effectiveLocked ? "مقفل" : "متاح"}</td>
                    <td dir="ltr">{remaining(d)}</td>
                    <td>
                      {d.agent_error ||
                        (!d.managementReady
                          ? "الإدارة غير متصلة"
                          : d.agent_revision === d.revision
                            ? "تم التطبيق"
                            : "بانتظار التطبيق")}
                    </td>
                    <td>{d.room || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <fieldset disabled={busy || !selected.length}>
          <legend>إجراءات على الأجهزة المحددة</legend>
          <div className="remote-toolbar">
            <label>
              الدقائق
              <input
                type="number"
                min={1}
                max={10080}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
              />
            </label>
            <label>
              باقة الوقت
              <select
                value={packageId}
                onChange={(e) => setPackage(e.target.value)}
              >
                <option value="">مدة مخصصة</option>
                {packages.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.minutes} دقيقة
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() =>
                void batch("start", packageId ? { packageId } : { minutes })
              }
            >
              بدء الوقت
            </button>
            <button
              onClick={() =>
                void batch("extend", packageId ? { packageId } : { minutes })
              }
            >
              زيادة الوقت
            </button>
            <button onClick={() => void batch("pause")}>إيقاف مؤقت وقفل</button>
            <button onClick={() => void batch("resume")}>استئناف الوقت</button>
            <button onClick={() => void batch("lock")}>قفل جماعي</button>
            <button onClick={() => void batch("unlock")}>
              فتح وإلغاء المؤقت
            </button>
            <label>
              وضع الحصة
              <select
                value={profileId}
                onChange={(e) => setProfile(e.target.value)}
              >
                <option value="">إلغاء وضع الحصة</option>
                {profiles.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() =>
                void batch("profile", { profileId: profileId || null })
              }
            >
              تطبيق الوضع
            </button>
            <label>
              نقل إلى مجموعة
              <select
                value={batchGroup}
                onChange={(e) => setBatchGroup(e.target.value)}
              >
                <option value="">بدون مجموعة</option>
                {groups.data?.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() =>
                void batch("group", { groupId: batchGroup || null })
              }
            >
              تغيير المجموعة
            </button>
          </div>
        </fieldset>
      </section>
      <section className="card">
        <h2>خريطة الأجهزة</h2>
        <p>
          أخضر: متاح · أحمر: مقفل · رمادي: غير متصل بالإدارة. الحالة المعروضة
          مطلوبة؛ تأكيد التطبيق في الجدول.
        </p>
        {[...new Set(visible.map((d) => d.room || ""))].map((roomName) => (
          <div key={roomName}>
            <h3>{roomName || "أجهزة بدون قاعة"}</h3>
            <div
              className="room-map"
              role="group"
              aria-label={`خريطة ${roomName || "الأجهزة"}`}
              style={{
                gridTemplateColumns: `repeat(${roomName ? Math.max(1, ...visible.filter((d) => d.room === roomName).map((d) => (d.seat_x ?? 0) + 1)) : Math.min(4, visible.filter((d) => !d.room).length)}, minmax(75px, 145px))`,
              }}
            >
              {visible
                .filter((d) => (d.room || "") === roomName)
                .map((d, index) => (
                  <button
                    key={d.id}
                    className={`seat ${!d.managementReady ? "offline" : d.effectiveLocked ? "locked" : "available"} ${selected.includes(d.id) ? "chosen" : ""}`}
                    style={{
                      gridColumn: roomName
                        ? (d.seat_x ?? 0) + 1
                        : (index % 4) + 1,
                      gridRow: roomName
                        ? (d.seat_y ?? 0) + 1
                        : Math.floor(index / 4) + 1,
                    }}
                    onClick={() => toggle(d.id)}
                    aria-pressed={selected.includes(d.id)}
                  >
                    {d.name}
                    <small>{remaining(d)}</small>
                  </button>
                ))}
            </div>
          </div>
        ))}
        <label>
          تعديل مكان جهاز
          <select
            value={layoutDevice}
            onChange={(e) => setLayoutDevice(e.target.value)}
          >
            <option value="">اختر جهازًا</option>
            {all.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        {layoutDevice && (
          <form
            key={layoutDevice}
            className="remote-toolbar"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act(() =>
                api(`/master/devices/${layoutDevice}/layout`, "PATCH", {
                  room: f.get("room"),
                  x: Number(f.get("x")),
                  y: Number(f.get("y")),
                  notes: f.get("notes"),
                }),
              );
            }}
          >
            <label>
              اسم القاعة
              <input
                name="room"
                maxLength={80}
                defaultValue={
                  all.find((d) => d.id === layoutDevice)?.room ?? ""
                }
              />
            </label>
            <label>
              العمود (0–20)
              <input
                name="x"
                type="number"
                min={0}
                max={20}
                defaultValue={
                  all.find((d) => d.id === layoutDevice)?.seat_x ?? 0
                }
              />
            </label>
            <label>
              الصف (0–20)
              <input
                name="y"
                type="number"
                min={0}
                max={20}
                defaultValue={
                  all.find((d) => d.id === layoutDevice)?.seat_y ?? 0
                }
              />
            </label>
            <label>
              ملاحظات
              <input
                name="notes"
                maxLength={1000}
                defaultValue={
                  all.find((d) => d.id === layoutDevice)?.notes ?? ""
                }
              />
            </label>
            <button disabled={busy}>حفظ المكان</button>
          </form>
        )}
      </section>
      <div className="grid">
        <section className="card">
          <h2>باقات الوقت</h2>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act(() =>
                api("/master/packages", "POST", {
                  name: f.get("name"),
                  minutes: Number(f.get("minutes")),
                }),
              );
            }}
          >
            <label>
              اسم الباقة
              <input name="name" required maxLength={80} />
            </label>
            <label>
              مدة الباقة بالدقائق
              <input
                name="minutes"
                type="number"
                min={1}
                max={10080}
                required
                defaultValue={60}
              />
            </label>
            <button disabled={busy}>إضافة باقة</button>
          </form>
          {packages.data?.map((p) => (
            <p key={p.id}>
              {p.name}: {p.minutes} دقيقة{" "}
              <button
                disabled={busy}
                onClick={() =>
                  void act(() => api(`/master/packages/${p.id}`, "DELETE"))
                }
              >
                حذف الباقة
              </button>
            </p>
          ))}
        </section>
        <section className="card">
          <h2>وضع الحصة أو الامتحان</h2>
          <p>
            قائمة تشغيل موجهة للبرامج والمواقع. ليست عزل امتحان آمنًا على مستوى
            Windows؛ تتطلب السياسات المؤسسية إعدادًا منفصلًا.
          </p>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                lines = (key: string) =>
                  String(f.get(key))
                    .split(/\r?\n/)
                    .map((s) => s.trim())
                    .filter(Boolean);
              void act(() =>
                api("/master/profiles", "POST", {
                  name: f.get("name"),
                  apps: lines("apps"),
                  sites: lines("sites"),
                }),
              );
            }}
          >
            <label>
              اسم الوضع
              <input name="name" required maxLength={80} />
            </label>
            <label>
              مسارات البرامج الكاملة (مسار exe في كل سطر)
              <textarea
                name="apps"
                placeholder={"C:\\Program Files\\Example\\app.exe"}
              />
            </label>
            <label>
              مواقع HTTPS (موقع في كل سطر)
              <textarea name="sites" placeholder="https://example.org" />
            </label>
            <button disabled={busy}>حفظ وضع الحصة</button>
          </form>
          {profiles.data?.map((p) => (
            <p key={p.id}>
              {p.name}{" "}
              <button
                disabled={busy}
                onClick={() =>
                  void act(() => api(`/master/profiles/${p.id}`, "DELETE"))
                }
              >
                حذف الوضع
              </button>
            </p>
          ))}
        </section>
      </div>
      <section className="card">
        <h2>نقل الملفات</h2>
        <p>
          حتى 10 MiB للملف، وبحد 50 MiB لكل جهاز. الملفات تنتهي بعد 24 ساعة.
          المستخدم يوافق محليًا على الاستلام، ويختار بنفسه الملفات المرسلة
          للماستر.
        </p>
        <label>
          جهاز نقل الملفات
          <select
            value={fileDevice}
            onChange={(e) => setFileDevice(e.target.value)}
          >
            <option value="">اختر جهازًا</option>
            {all.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        {fileDevice && (
          <>
            <label>
              إرسال ملف للجهاز
              <input
                key={fileDevice}
                type="file"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 10 * 1024 * 1024) {
                    setError("الحد الأقصى للملف 10 MiB");
                    return;
                  }
                  void act(async () => {
                    const bytes = new Uint8Array(await f.arrayBuffer());
                    let binary = "";
                    for (let i = 0; i < bytes.length; i += 8192)
                      binary += String.fromCharCode(
                        ...bytes.subarray(i, i + 8192),
                      );
                    await api(`/master/devices/${fileDevice}/files`, "POST", {
                      name: f.name,
                      data: btoa(binary),
                    });
                  }, "تمت إضافة الملف؛ في انتظار موافقة المستخدم على الجهاز.");
                }}
              />
            </label>
            {files.error && <p role="alert">{files.error.message}</p>}
            {files.data?.map((f) => (
              <div key={f.id} className="file-row">
                <strong>{f.name}</strong>
                <span>
                  {f.direction === "to_device" ? "إلى الجهاز" : "من الجهاز"} ·{" "}
                  {f.status}
                </span>
                <progress
                  aria-label={`تقدم ${f.name}`}
                  max={Math.max(1, f.size)}
                  value={f.transferred}
                />
                <span>
                  {f.transferred} / {f.size} بايت
                </span>
                {f.direction === "from_device" && f.status === "complete" && (
                  <a
                    href={`/api/master/devices/${fileDevice}/files/${f.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      void act(async () => {
                        const r = await fetch(
                          `/api/master/devices/${fileDevice}/files/${f.id}`,
                          { headers: { "X-Organization-Id": organizationId } },
                        );
                        if (!r.ok) throw new Error("تعذر تحميل الملف");
                        const url = URL.createObjectURL(await r.blob());
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = f.name;
                        a.click();
                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                      }, "تم تنزيل الملف.");
                    }}
                  >
                    تنزيل
                  </a>
                )}
                <button
                  disabled={busy || f.status === "cancelled"}
                  onClick={() =>
                    void act(() =>
                      api(
                        `/master/devices/${fileDevice}/files/${f.id}`,
                        "DELETE",
                      ),
                    )
                  }
                >
                  إلغاء وحذف المحتوى
                </button>
              </div>
            ))}
          </>
        )}
      </section>
    </div>
  );
}
