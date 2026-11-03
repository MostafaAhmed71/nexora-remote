import { DeviceAclEditor } from "./DeviceAclEditor";
import { MasterConsole } from "./MasterConsole";
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  NavLink,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Monitor,
  Shield,
  Users,
  Activity,
  LayoutDashboard,
  Sun,
  Moon,
  LogOut,
  Layers,
  KeyRound,
  ScrollText,
  Building2,
} from "lucide-react";
import { api, organizationId, setOrganization } from "./api";
import { Viewer } from "./Viewer";
import "./style.css";
const resetToken = new URLSearchParams(location.search).get("token") ?? "";
if (location.pathname === "/reset" && resetToken)
  history.replaceState(null, "", "/reset");
const qc = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
function Form({
  title,
  fields,
  onSubmit,
  label = "حفظ",
}: {
  title: string;
  fields: {
    name: string;
    label: string;
    type?: string;
    defaultValue?: string;
    options?: string[];
  }[];
  onSubmit: (v: any) => Promise<any>;
  label?: string;
}) {
  const [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="card form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        setSuccess("");
        const data = Object.fromEntries(new FormData(e.currentTarget));
        try {
          await onSubmit(data);
          setSuccess("تم بنجاح");
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>{title}</h2>
      {fields.map((f) => (
        <label key={f.name}>
          {f.label}
          {f.options ? (
            <select name={f.name}>
              {f.options.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          ) : (
            <input
              required={!["otp", "recoveryCode"].includes(f.name)}
              name={f.name}
              defaultValue={f.defaultValue}
              type={f.type ?? "text"}
              autoComplete={
                f.type === "password" ? "current-password" : undefined
              }
            />
          )}
        </label>
      ))}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {success && <p role="status">{success}</p>}
      <button disabled={busy}>{busy ? "جارٍ التنفيذ…" : label}</button>
    </form>
  );
}
function Data({
  path,
  columns,
}: {
  path: string;
  columns: { key: string; label: string }[];
}) {
  const q = useQuery({
    queryKey: [organizationId, path],
    queryFn: () => api(path),
    enabled: !!organizationId,
  });
  if (!organizationId)
    return (
      <div className="card" role="status">
        اختر المؤسسة من القائمة لعرض البيانات.
      </div>
    );
  if (q.isPending)
    return (
      <div className="card" role="status">
        جارٍ التحميل…
      </div>
    );
  if (q.error)
    return (
      <div className="card error" role="alert">
        {q.error.message}
      </div>
    );
  const rows = Array.isArray(q.data) ? q.data : q.data ? [q.data] : [];
  return (
    <div className="card table">
      {!rows.length ? (
        <div className="empty">
          <Layers />
          <h3>لا توجد سجلات بعد</h3>
          <p>ستظهر البيانات المسجلة فعليًا هنا.</p>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any, i: number) => (
              <tr key={r.id ?? i}>
                {columns.map((c) => (
                  <td key={c.key}>
                    {typeof r[c.key] === "boolean"
                      ? r[c.key]
                        ? "متصل"
                        : "غير متصل"
                      : c.key === "desktopStatus"
                        ? ((
                            {
                              available: "متاح",
                              unavailable: "لا توجد جلسة تفاعلية",
                              offline: "غير متصل",
                            } as Record<string, string>
                          )[r[c.key]] ?? "غير معلوم")
                        : String(r[c.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
const nav = [
  ["/master", "لوحة الماستر", Monitor],
  ["/", "نظرة عامة", LayoutDashboard],
  ["/devices", "الأجهزة", Monitor],
  ["/groups", "مجموعات الأجهزة", Layers],
  ["/enrollment", "تسجيل جهاز", KeyRound],
  ["/sessions", "الجلسات", Activity],
  ["/users", "مستخدمو المنصة", Users],
  ["/platform", "إعدادات المنصة", Shield],
  ["/members", "أعضاء المؤسسة", Users],
  ["/roles", "الأدوار والصلاحيات", Shield],
  ["/audit", "سجل التدقيق", ScrollText],
  ["/organization", "المؤسسة", Building2],
  ["/security", "أمان الحساب", Shield],
  ["/versions", "إصدارات Agent", Layers],
  ["/plans", "الخطط والاشتراكات", Layers],
] as const;
function PlatformSettings() {
  const q = useQuery({
    queryKey: ["platform-settings"],
    queryFn: () => api("/platform/settings"),
  });
  return (
    <pre dir="ltr">
      {q.error ? q.error.message : JSON.stringify(q.data ?? "Loading", null, 2)}
    </pre>
  );
}
function Dashboard() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api("/auth/me") });
  const orgs = useQuery({
    queryKey: ["orgs"],
    queryFn: () => api("/organizations"),
    enabled: !!me.data,
  });
  const [org, setOrg] = useState(organizationId),
    [dark, setDark] = useState(false),
    [viewer, setViewer] = useState(""),
    [viewerMode, setViewerMode] = useState("view"),
    [notice, setNotice] = useState(""),
    [enrollment, setEnrollment] = useState<any>(null),
    [mfa, setMfa] = useState<any>(null),
    [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const client = useQueryClient(),
    location = useLocation(),
    navigate = useNavigate();
  const p = location.pathname;
  async function mutate(path: string, method: string, data?: unknown) {
    const v = await api(path, method, data);
    await client.invalidateQueries();
    return v;
  }
  if (me.isPending) return <main className="auth">جارٍ التحقق…</main>;
  if (!me.data) {
    return (
      <main className="auth">
        <div className="brand">
          <Monitor />
          <strong>
            NEXORA <em>Remote</em>
          </strong>
        </div>
        <p>وصول واضح. صلاحيات محددة. أجهزة تحت إدارتك.</p>
        {p === "/reset" ? (
          <Form
            title="إعادة تعيين كلمة المرور"
            fields={[
              {
                name: "token",
                label: "رمز الاستعادة",
                defaultValue: resetToken,
              },
              {
                name: "password",
                label: "كلمة المرور الجديدة (١٢ حرفًا على الأقل)",
                type: "password",
              },
            ]}
            onSubmit={(v) => api("/auth/reset", "POST", v)}
          />
        ) : p === "/forgot" ? (
          <Form
            title="استعادة الحساب"
            fields={[
              { name: "email", label: "البريد الإلكتروني", type: "email" },
            ]}
            onSubmit={(v) => api("/auth/forgot", "POST", v)}
          />
        ) : (
          <Form
            title="تسجيل الدخول"
            label="دخول آمن"
            fields={[
              { name: "email", label: "البريد الإلكتروني", type: "email" },
              { name: "password", label: "كلمة المرور", type: "password" },
              { name: "otp", label: "رمز MFA (إن كان مفعّلًا)" },
              {
                name: "recoveryCode",
                label: "كود الاستعادة الاحتياطي (اختياري)",
                type: "password",
              },
            ]}
            onSubmit={async (v) => {
              await api("/auth/login", "POST", v);
              await client.invalidateQueries();
            }}
          />
        )}
        <NavLink to={p === "/forgot" ? "/" : "/forgot"}>
          {p === "/forgot" ? "تسجيل الدخول" : "نسيت كلمة المرور؟"}
        </NavLink>
        <small>نسخة هندسية قيد التحقق • لا يتم إنشاء حسابات تلقائيًا</small>
      </main>
    );
  }
  if (viewer)
    return (
      <Viewer
        id={viewer}
        mode={viewerMode}
        onClose={() => {
          setViewer("");
          void client.invalidateQueries();
        }}
      />
    );
  const title = nav.find((n) => n[0] === p)?.[1] ?? "NEXORA Remote";
  return (
    <div className={dark ? "shell dark" : "shell"}>
      <aside>
        <div className="brand">
          <Monitor />
          <strong>
            NEXORA <em>Remote</em>
          </strong>
        </div>
        <div className="workspace">
          مساحة العمل
          <select
            aria-label="المؤسسة"
            value={org}
            onChange={(e) => {
              setOrganization(e.target.value);
              setOrg(e.target.value);
              void client.invalidateQueries();
            }}
          >
            <option value="">اختر المؤسسة</option>
            {orgs.data?.map((o: any) => (
              <option value={o.id} key={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <nav>
          {nav.map(([to, label, Icon]) => (
            <NavLink key={to} to={to} end>
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <footer>
          <span className="tag">ENGINEERING PREVIEW · 0.1</span>
          <p>اتصال مصرح به وقابل للتدقيق</p>
        </footer>
      </aside>
      <main>
        <header className="top">
          <span>منصة إدارة الوصول والأجهزة</span>
          <div>
            <button
              className="icon"
              aria-label="تغيير المظهر"
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun /> : <Moon />}
            </button>
            <button
              className="secondary"
              onClick={() => {
                void api("/auth/logout", "POST", {}).then(() => {
                  void client.invalidateQueries();
                  navigate("/");
                });
              }}
            >
              <LogOut size={16} /> خروج
            </button>
          </div>
        </header>
        <div className="content">
          <div className="heading">
            <div>
              <p className="eyebrow">NEXORA CONTROL CENTER</p>
              <h1>{title}</h1>
              <p>إدارة مؤسستك من مكان واحد، بصلاحيات واضحة.</p>
            </div>
            <span className="badge">
              <Shield size={16} /> وصول قابل للإلغاء
            </span>
          </div>
          {notice && (
            <div role="status" className="card">
              {notice}
            </div>
          )}
          {p === "/master" && <MasterConsole key={org} />}
          {!org && p !== "/organization" && (
            <div className="card">
              اختر مؤسسة من القائمة، أو أنشئ مؤسسة من صفحة المؤسسة.
            </div>
          )}
          {p === "/" && (
            <>
              <div className="hero">
                <div>
                  <span className="tag">NEXORA REMOTE ENGINE</span>
                  <h2>
                    أجهزتك أقرب.
                    <br />
                    وصولك تحت السيطرة.
                  </h2>
                  <p>
                    ابدأ بتسجيل جهاز مصرح به، ثم امنح جلسة مشاهدة أو تحكم محدودة
                    المدة.
                  </p>
                  <button onClick={() => navigate("/enrollment")}>
                    تسجيل جهاز جديد
                  </button>
                </div>
                <Monitor size={130} strokeWidth={1} />
              </div>
              <div className="grid">
                <div className="card">
                  <Shield />
                  <h3>حدود أمان صريحة</h3>
                  <p>عزل المؤسسات، MFA، رموز لمرة واحدة وتفويض جلسة موقّع.</p>
                </div>
                <div className="card">
                  <Activity />
                  <h3>حالة المشروع</h3>
                  <p>
                    نسخة هندسية. التحكم على Windows يحتاج تحققًا تفاعليًا قبل
                    الاعتماد.
                  </p>
                </div>
              </div>
              <Data
                path="/devices"
                columns={[
                  { key: "name", label: "الجهاز" },
                  { key: "os", label: "النظام" },
                  { key: "online", label: "الاتصال" },
                  { key: "desktopStatus", label: "سطح المكتب" },
                  { key: "last_seen", label: "آخر ظهور" },
                ]}
              />
            </>
          )}
          {p === "/devices" && (
            <>
              <Data
                path="/devices"
                columns={[
                  { key: "id", label: "المعرف" },
                  { key: "name", label: "اسم الجهاز" },
                  { key: "os", label: "النظام" },
                  { key: "agent_version", label: "Agent" },
                  { key: "online", label: "الحالة" },
                  { key: "desktopStatus", label: "سطح المكتب" },
                  { key: "revoked_at", label: "إلغاء الثقة" },
                ]}
              />
              <Form
                title="بدء جلسة على جهاز"
                label="اتصال"
                fields={[
                  { name: "deviceId", label: "معرف الجهاز" },
                  {
                    name: "mode",
                    label: "نوع الوصول",
                    options: ["view", "control"],
                  },
                ]}
                onSubmit={async (v) => {
                  const s = await mutate("/sessions", "POST", v);
                  setViewerMode(v.mode);
                  setViewer(s.id);
                }}
              />
              <DeviceAclEditor />
              <Form
                title="إلغاء الثقة بالجهاز"
                label="إلغاء الثقة وإنهاء الجلسات"
                fields={[{ name: "id", label: "معرف الجهاز" }]}
                onSubmit={(v) => mutate("/devices/" + v.id, "DELETE")}
              />
            </>
          )}
          {p === "/groups" && (
            <>
              <Data
                path="/groups"
                columns={[
                  { key: "id", label: "المعرف" },
                  { key: "name", label: "المجموعة" },
                ]}
              />
              <Form
                title="مجموعة جديدة"
                fields={[{ name: "name", label: "الاسم" }]}
                onSubmit={(v) => mutate("/groups", "POST", v)}
              />
            </>
          )}
          {p === "/enrollment" && (
            <>
              <div className="card">
                <h2>تسجيل جهاز مصرح به</h2>
                <p>
                  الرمز صالح ١٠ دقائق ولمرة واحدة. لا تشاركه مع جهة غير مخولة.
                  Agent ظاهر للمستخدم، ولا يتحكم في شاشة الدخول أو UAC.
                </p>
                <button
                  onClick={() => {
                    void mutate("/enrollments", "POST", {})
                      .then(setEnrollment)
                      .catch((e) => setNotice(e.message));
                  }}
                >
                  إنشاء رمز تسجيل
                </button>
                {enrollment && (
                  <pre dir="ltr">{JSON.stringify(enrollment, null, 2)}</pre>
                )}
              </div>
            </>
          )}
          {p === "/sessions" && (
            <>
              <Data
                path="/sessions"
                columns={[
                  { key: "id", label: "الجلسة" },
                  { key: "device_id", label: "الجهاز" },
                  { key: "mode", label: "الوصول" },
                  { key: "state", label: "الحالة" },
                  { key: "created_at", label: "البداية" },
                ]}
              />
              <Form
                title="إنهاء جلسة"
                fields={[{ name: "id", label: "معرف الجلسة" }]}
                onSubmit={(v) => mutate("/sessions/" + v.id, "DELETE")}
              />
            </>
          )}
          {p === "/members" && (
            <>
              <Data
                path="/members"
                columns={[
                  { key: "email", label: "البريد" },
                  { key: "role", label: "الدور" },
                  { key: "id", label: "المعرف" },
                ]}
              />
              <Form
                title="إضافة مستخدم موجود إلى المؤسسة"
                fields={[
                  { name: "email", label: "البريد", type: "email" },
                  {
                    name: "role",
                    label: "الدور",
                    options: ["technician", "employee", "viewer", "admin"],
                  },
                ]}
                onSubmit={(v) => mutate("/members", "POST", v)}
              />
              <Form
                title="تغيير دور عضو وإنهاء جلساته"
                fields={[
                  { name: "id", label: "معرف العضو" },
                  {
                    name: "role",
                    label: "الدور",
                    options: ["technician", "employee", "viewer", "admin"],
                  },
                ]}
                onSubmit={(v) =>
                  mutate("/members/" + v.id, "PATCH", { role: v.role })
                }
              />
            </>
          )}
          {p === "/users" && (
            <>
              <Data
                path="/platform/users"
                columns={[
                  { key: "email", label: "البريد" },
                  { key: "id", label: "المعرف" },
                  { key: "platform_admin", label: "مسؤول المنصة" },
                ]}
              />
              <Form
                title="إنشاء مستخدم — لمسؤول المنصة فقط"
                fields={[
                  { name: "email", label: "البريد", type: "email" },
                  {
                    name: "password",
                    label: "كلمة مرور مؤقتة (١٢ حرفًا على الأقل)",
                    type: "password",
                  },
                ]}
                onSubmit={(v) => mutate("/platform/users", "POST", v)}
              />
            </>
          )}
          {p === "/platform" && (
            <div className="card">
              <h2>قدرات النسخة الحالية</h2>
              <p>
                الإعدادات ثابتة في الكود لهذا الإصدار. تغيير سياسات المنصة من
                الواجهة غير مدعوم بعد.
              </p>
              <PlatformSettings />
            </div>
          )}
          {p === "/roles" && (
            <Data
              path="/roles"
              columns={[
                { key: "role", label: "الدور" },
                { key: "permission", label: "الصلاحية" },
              ]}
            />
          )}
          {p === "/audit" && (
            <Data
              path="/audit"
              columns={[
                { key: "event", label: "الحدث" },
                { key: "actor_id", label: "المستخدم" },
                { key: "target_id", label: "الهدف" },
                { key: "created_at", label: "الوقت" },
              ]}
            />
          )}
          {p === "/organization" && (
            <>
              <Data
                path="/organizations"
                columns={[
                  { key: "name", label: "المؤسسة" },
                  { key: "role", label: "دورك" },
                ]}
              />
              <Form
                title="تعديل اسم المؤسسة الحالية"
                fields={[{ name: "name", label: "اسم المؤسسة" }]}
                onSubmit={(v) => mutate("/organization", "PATCH", v)}
              />
              <Form
                title="إنشاء مؤسسة"
                fields={[{ name: "name", label: "اسم المؤسسة" }]}
                onSubmit={(v) => mutate("/organizations", "POST", v)}
              />
            </>
          )}
          {p === "/security" && (
            <>
              <div className="card">
                <h2>المصادقة متعددة العوامل</h2>
                <p>{me.data.mfaEnabled ? "MFA مفعّل" : "MFA غير مفعّل"}</p>
                {!me.data.mfaEnabled && (
                  <button
                    onClick={() => {
                      void api("/auth/mfa/setup", "POST", {})
                        .then(setMfa)
                        .catch((e) => setNotice(e.message));
                    }}
                  >
                    بدء إعداد MFA
                  </button>
                )}
                {mfa && (
                  <>
                    <p>
                      أضف المفتاح في تطبيق المصادقة، ثم أكد الرمز. احفظه بأمان
                      قبل التأكيد.
                    </p>
                    <code dir="ltr">{mfa.secret}</code>
                    <Form
                      title="تأكيد MFA"
                      fields={[{ name: "otp", label: "الرمز" }]}
                      onSubmit={(v) => mutate("/auth/mfa/confirm", "POST", v)}
                    />
                  </>
                )}
              </div>
              <Form
                title="توليد أكواد استعادة MFA"
                fields={[
                  {
                    name: "password",
                    label: "كلمة المرور الحالية",
                    type: "password",
                  },
                  { name: "otp", label: "رمز MFA الحالي" },
                ]}
                onSubmit={async (v) => {
                  const result = await api(
                    "/auth/mfa/recovery-codes",
                    "POST",
                    v,
                  );
                  setRecoveryCodes(result.codes);
                }}
              />
              {recoveryCodes.length > 0 && (
                <div className="card">
                  <p>
                    كل كود لمرة واحدة. احفظها بأمان؛ التوليد يلغي الأكواد
                    السابقة.
                  </p>
                  <pre dir="ltr">{recoveryCodes.join("\n")}</pre>
                </div>
              )}
              <Data
                path="/auth/sessions"
                columns={[
                  { key: "created_at", label: "بداية الدخول" },
                  { key: "expires_at", label: "الانتهاء" },
                ]}
              />
              <button
                onClick={() => {
                  void mutate("/auth/sessions", "DELETE").then(() =>
                    client.clear(),
                  );
                }}
              >
                إلغاء جميع جلسات الدخول
              </button>
            </>
          )}
          {p === "/versions" && (
            <Data
              path="/agent-versions"
              columns={[
                { key: "version", label: "الإصدار" },
                { key: "approved", label: "معتمد" },
                { key: "sha256", label: "SHA256" },
              ]}
            />
          )}
          {p === "/plans" && (
            <>
              <div className="card">
                <p>
                  مخطط الخطط والاشتراكات موجود. فرض الحدود وإدارة التراخيص غير
                  منفذين بعد. لا توجد عمليات دفع.
                </p>
              </div>
              <Data
                path="/plans"
                columns={[
                  { key: "name", label: "الخطة" },
                  { key: "device_limit", label: "حد الأجهزة" },
                  { key: "member_limit", label: "حد الأعضاء" },
                ]}
              />
              <Data
                path="/subscription"
                columns={[
                  { key: "plan_id", label: "الخطة الحالية" },
                  { key: "status", label: "الحالة" },
                  { key: "expires_at", label: "الانتهاء" },
                ]}
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
