import { useState } from "react";
import { api } from "./api";
export function DeviceAclEditor() {
  const [id, setId] = useState(""),
    [loaded, setLoaded] = useState(""),
    [entries, setEntries] = useState<{ userId: string; permission: string }[]>(
      [],
    ),
    [user, setUser] = useState(""),
    [permission, setPermission] = useState("view"),
    [error, setError] = useState(""),
    [enforced, setEnforced] = useState(true),
    [busy, setBusy] = useState(false);
  return (
    <section className="card">
      <h2>صلاحيات الجهاز المستقلة</h2>
      <p>
        المالك والمسؤول يحتفظان بإدارة الجهاز. تفعيل التقييد يقصر وصول باقي
        الأعضاء على القائمة، وحفظها ينهي الجلسات الحالية.
      </p>
      <label>
        معرف الجهاز
        <input value={id} onChange={(e) => setId(e.target.value)} />
      </label>
      <button
        disabled={busy || !id}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const data = await api("/devices/" + id + "/acl");
            setEntries(
              data.entries.map((v: any) => ({
                userId: v.user_id,
                permission: v.permission,
              })),
            );
            setEnforced(data.enforced);
            setLoaded(id);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        تحميل الصلاحيات
      </button>
      {loaded === id && loaded && (
        <>
          <label>
            <input
              type="checkbox"
              checked={enforced}
              onChange={(e) => setEnforced(e.target.checked)}
            />
            تقييد الوصول بقائمة الجهاز
          </label>
          <ul>
            {entries.map((e, i) => (
              <li key={i}>
                {e.userId} · {e.permission}
                <button
                  onClick={() => setEntries((v) => v.filter((_, j) => j !== i))}
                >
                  إزالة من المسودة
                </button>
              </li>
            ))}
          </ul>
          <label>
            معرف العضو
            <input value={user} onChange={(e) => setUser(e.target.value)} />
          </label>
          <select
            value={permission}
            onChange={(e) => setPermission(e.target.value)}
          >
            <option value="view">مشاهدة</option>
            <option value="control">تحكم</option>
          </select>
          <button
            disabled={!user}
            onClick={() => {
              setEntries((v) => [
                ...v.filter(
                  (e) => e.userId !== user || e.permission !== permission,
                ),
                { userId: user, permission },
              ]);
              setUser("");
            }}
          >
            إضافة للمسودة
          </button>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await api("/devices/" + id + "/acl", "PUT", {
                  enforced,
                  entries,
                });
                setError("تم الحفظ وإلغاء الجلسات السابقة");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            حفظ الصلاحيات وإنهاء الجلسات
          </button>
        </>
      )}
      {error && <p role="status">{error}</p>}
    </section>
  );
}
