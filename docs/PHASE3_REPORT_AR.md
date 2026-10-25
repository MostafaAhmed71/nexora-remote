# NEXORA Remote 0.3.0 — تقرير التنفيذ والتحقق

التاريخ: 25 أكتوبر 2026. هذا تطوير داخل المستودع الخاص نفسه، ولم يُنشأ مشروع آخر أو VPS أو نشر إنتاجي أو منفذ عام للاختبار أو مورد مدفوع أو اتصال بأجهزة المدرسة. النسخة Engineering Preview وليست اعتمادًا للبيع أو الاستخدام المؤسسي.

## ما تغير فعليًا

- Service تتلقى إشعارات SCM للقفل والخروج والانفصال وتبطل lease العامل؛ تبديل الجلسة أو SID ينهي العامل السابق. يوجد mutex لكل جلسة لمنع العامل المكرر، ومراقبة process وIPC بمهلة، وإيقاف عند shutdown. المفاتيح لا تخرج من الخدمة المحمية. إشعارات دورة الحياة واختبار سياساتها ليست تجربة Lock/Reboot كاملة.
- أُخرج انتظار إرسال الشاشة من قفل التفويض/الإدخال. Capture Bitmap تُعاد استعمالها وتتبدل عند تغير الأبعاد، وJPEG codec lookup مخزّن. البث بلا queue للإطارات؛ ACK من المتصفح يقيد relay بإطار واحد معلق، مع إسقاط الإطارات والحد من buffered bytes وفصل المستهلك المتوقف. توجد downshift/recovery للجودة والدقة وFPS وfingerprint لتقليل تكرار الإطارات الثابتة.
- فقد سطح المكتب التفاعلي ينهي التفويض بدل استئناف التحكم تلقائيًا بعد unlock. إعادة توثيق Agent تنظف منح قاعدة البيانات السابقة حتى بعد إعادة تشغيل backend. تظل الجلسات الجديدة بحاجة إلى إثبات وتذكرة ومنحة جديدة.
- استبدال رموز MFA recovery أصبح معاملة واحدة مقفلة على المستخدم. أضيفت صلاحيات جهاز `terminate` و`devices`، مع سقف الدور. الفني يستطيع تعديل/إلغاء جهاز مُنح له صراحة عند تفعيل ACL، ولا يستطيع تغيير ACL أو إدارة المؤسسة. تغييرات ACL تُدقق وتنهي الجلسات الجارية.
- العارض يضيف zoom ومدة الاتصال وتوقيت capture/encode، ويتفاوض على decoder ACK؛ يعرض «غير مقاس» قبل وصول البيانات. RTT موصوف للخادم ولا يقدم كزمن تحكم كامل. تبقى العربية RTL وfullscreen/fit والجودة ووضع المشاهدة.
- CI يبني المصدر الثابت 0.2.0 ويثبت مثبته ثم يرقّيه فعليًا إلى 0.3.0، ويتحقق من version والخدمة وملف بيانات محفوظ ثم الإزالة. بعد ذلك يثبت 0.3.0 تثبيتًا نظيفًا ويزيله. لا rollback أو Code Signing أو Release تلقائي.

## تصنيف المكونات

| الوظيفة                                    | التصنيف                       | نطاق الدليل والحدود                                                                                                                                              |
| ------------------------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend/Backend/Agent builds              | Implemented & Validated       | بناء وTypecheck وفحوص المصدر على exact commit في دليل CI أدناه.                                                                                                  |
| Authentication/RBAC/Tenant Isolation       | Implemented & Validated       | API حقيقية بقاعدة PGlite وPostgreSQL أصلي لـRLS/migrations والقيود؛ ليس تدقيق اختراق مستقلًا.                                                                    |
| Device Enrollment/Identity                 | Implemented & Validated       | RSA challenge/prove، nonce وتذكرة أحادية، رفض تزوير وإلغاء ثقة، DPAPI/DACL Windows. بقاء الهوية عبر reboot وترقية جهاز مسجل غير مثبت.                            |
| Device ACL                                 | Implemented & Validated       | مشاهدة/تحكم/إدارة جهاز وإنهاء ضمن سقف الدور؛ اختبار فني بلا grant مرفوض، بعد grant يستطيع تعديل/إلغاء الجهاز، ولا يستطيع تعديل ACL. لا file/clipboard endpoints. |
| Signed grants/expiry/revocation            | Implemented & Validated       | انتهاء تسجيل الدخول يقيد المنحة؛ رفض إدخال بعد DB expiry/إلغاء، وتذاكر مستهلكة/حساب آخر مرفوضة.                                                                  |
| Concurrent session policy                  | Implemented & Validated       | طلبان متزامنان: نجاح واحد و409 للآخر؛ فحص socket بعد await يمنع إدخال viewer مستبدل.                                                                             |
| SCM service lifecycle                      | Implemented & Validated       | install/start/stop/restart/registration/recovery configuration/upgrade/uninstall على Windows Runner.                                                             |
| Worker session policy وSecure IPC          | Partially Implemented         | إبطال lease بالقفل/التبديل مختبر كسياسة؛ framing وPID وDACL مختبرة أصليًا. المسار الخدمة→WTS worker→IPC بعد تسجيل فعلي لم يثبت E2E.                              |
| Reboot                                     | Not Implemented               | الاختبار غير منفذ؛ لا VM مستمرة/orchestrator يعيد متابعة المهمة بعد reboot ضمن الأدوات المتاحة. لا تعني إعادة تشغيل الخدمة reboot.                               |
| Windows Interactive Engine                 | Implemented & Validated       | شاشة Windows فعلية وJPEG عبر Fastify حقيقي وإدخال عربي ونقرة وتغيير حجم مشفر وإلغاء وإعادة توثيق على loopback. لا متصفح ثان أمام جهاز Windows مستقل.             |
| Capture reuse وtiming                      | Implemented & Validated       | قياس GDI فعلي لمقارنة تخصيص bitmap لكل إطار وإعادة الاستخدام، وقياسات CPU/RAM/allocations. لا ادعاء خفض شامل لكل التخصيصات.                                      |
| Backpressure/frame dropping                | Implemented & Validated       | gate محدود بلا queue واختبار relay/ACK للمستهلك البطيء، واختبارات تداخل/قطع WebSocket. لا soak طويل لمتصفح حقيقي بطيء.                                           |
| Adaptive FPS/resolution/JPEG               | Partially Implemented         | الخوارزمية وحدودها والتعافي مختبرة، والتحكم في الجودة/downscaling يعمل في Windows؛ لا اختبار WAN متكامل يثبت جودة التكيف تحت كل حالة.                            |
| Static-frame suppression                   | Implemented but Not Validated | SHA-256 للإطار المشفر وتجديد كل ثانيتين ومسح مع المنحة؛ لا قياس مستقل لمعدل التوفير على شاشة ساكنة/متحركة. لا يوقف capture/encode بالكامل.                       |
| Physical display/DPI/multi-monitor changes | Partially Implemented         | التعامل بالأبعاد الحالية واختيار monitor موجود؛ تغيير وضع Windows/الشاشات/DPI فعليًا غير متحقق.                                                                  |
| Mouse/keyboard                             | Partially Implemented         | كتابة عربية ونقرة مثبتتان فعليًا؛ wheel/modifiers/extended keys/IME كاملة وتبديل التخطيط ومصفوفة DPI ما زالت بوابات مختبر.                                       |
| Remote Viewer                              | Partially Implemented         | 4 E2E للواجهات ومسار backend بإطارات اختبار، وقياسات/zoom/ACK/عرض فقط؛ لا browser→Windows على جهازين، ولا مصفوفة اختصارات كاملة.                                 |
| Network impairment                         | Implemented & Validated       | TCP/WebSocket فعلي عبر veth/netns وkernel netem: delay/loss/rate؛ ليس FPS Windows تحت WAN.                                                                       |
| Automatic reconnect                        | Implemented & Validated       | محرك Windows يعيد proof ثم grant جديدة بعد قطع فعلي؛ اختبار Node يقيس fresh socket reconnect بشكل منفصل. لا SLA أو reboot reconnect.                             |
| Unattended Access                          | Partially Implemented         | خدمة تلقائية وهوية آلة وعامل ظاهر وإيقاف محلي؛ التشغيل بعد reboot/login/user switch يحتاج تجربة كاملة.                                                           |
| H.264/WebRTC/WGC/DXGI                      | Not Implemented               | قرار الاحتفاظ بمسار GDI/JPEG موثق؛ لا codec وهمي أو benchmark مقارن مخترع.                                                                                       |
| File Transfer                              | Not Implemented               | Upload/Download/progress/cancel غير موجودة؛ الأزرار معطلة. صلاحية محجوزة لا تعني تنفيذًا.                                                                        |
| Clipboard                                  | Not Implemented               | لا مزامنة نصوص، والزر معطل.                                                                                                                                      |
| MFA recovery atomicity                     | Implemented & Validated       | استبدال كامل لمجموعة واحدة تحت طلبات متزامنة، وبصمات واستخدام أحادي؛ provider recovery الإنتاجي لم يُوصل.                                                        |
| Installer fresh/0.2→0.3 upgrade            | Implemented & Validated       | تحقق نسخ/خدمة/إزالة وملف بيانات؛ اختبار identity مسجلة عبر الترقية وreboot غير منفذ. المثبت غير موقع.                                                            |
| Rollback                                   | Not Implemented               | لا وعد بتراجع آلي بعد فشل ترقية جزئي.                                                                                                                            |
| Windows-to-Windows                         | Not Implemented               | الاختبار غير منفذ؛ بيئتا Linux وloopback لا تسميان جهازين Windows.                                                                                               |

## نتائج الأمان الفعلية

40 اختبارًا آليًا في خمس ملفات، و4 Playwright E2E، و5 فحوص PostgreSQL، و5 عقود grants C# + 5 فحوص سياسة streaming/lifecycle. توجد فحوص Windows أصلية للـ IPC/DPAPI/capture/input، واختبارات تثبيت/ترقية/إزالة. العدد لا يجعل كل ميزة إنتاجية متحققة؛ راجع النطاق في التصنيف. نتائج التشغيل النهائي وروابطه محفوظة في `phase3/CI_VERIFICATION.json`.

الرفض مغطى للمستخدم غير المصرح، المؤسسة المختلفة، التذكرة المكررة/URL/حساب آخر، إثبات الجهاز المزور وإلغاء الثقة، المنحة المنتهية وإدخال بعد الانتهاء، viewer قديم أثناء await، ومحاولات الجلسات المتزامنة. اختبارات تبطل الوصول عند unavailable وتتحقق من تغيير صلاحيات الجهاز والتدقيق. [SECURITY_VALIDATION.md](SECURITY_VALIDATION.md) يربط المسارات بالفحوص وحدودها.

سجل التنفيذ: تشغيل أول فشل بسبب تعديل غير مقصود لثلاثة مراجع dependency أثناء تحديث version؛ صُحح lockfile دون تغيير اعتماداته. تشغيل لاحق كشف انتهاء TOTP عند حد الثلاثين ثانية في اختبار التزامن؛ عُدل توقيت fixture لبدء نافذة صالحة دون توسيع نافذة التحقق الإنتاجية. لا تُعرض التشغيلات الفاشلة كنجاح. فحص npm runtime audit وفحص المصدر لا يعادلان تدقيق أسرار/اختراق شاملًا.

## القياسات والقرار الهندسي

تفاصيل المنهجية والقياسات الخام في [STREAMING_BENCHMARKS.md](STREAMING_BENCHMARKS.md) و`phase3/*.json`. التصنيف Measured/Simulated/Not Measured واضح هناك. لا توجد تقديرات مقدمة كقياس. أرقام netem تخص echo رسائل 8192 بايت عبر TCP/Linux؛ تتحمل retransmission، ولا تعني FPS الشاشة أو زمن ماوس إلى صورة. توقيت Windows إلى textbox عينة loopback بفحص كل 50 ms؛ ليس photon latency.

لم نقس WebRTC/H.264 أو GPU أو WAN أو استهلاكًا طويل المدة أو خدمة العامل E2E. الاحتفاظ بـ GDI/JPEG قرار للاستقرار والتحقق، مع ACK/backpressure وتكيف محدود، وليس ادعاء أنه الخيار الأفضل لكل شبكة أو جهاز.

## القيود وخطوة التحقق التالية

لا يتوفر مسار شبكة خاص معطى بين Windows Runner مستقلين ولا VM مستمرة مع orchestrator لـreboot؛ لم يُنشأ public tunnel أو منفذ غير محمي لتجاوز ذلك. [WINDOWS_TWO_DEVICE_TEST.md](WINDOWS_TWO_DEVICE_TEST.md) يحدد المختبر والمعايير المطلوبة لاحقًا، دون تكليف المستخدم الحالي بأوامر محلية.

النواقص: service-worker end-to-end، reboot، Windows-to-Windows/TLS، اختبارات القفل والخروج وتبديل المستخدم عمليًا، physical DPI/monitor/IME، استقرار طويل المدة، صلاحيات LocalSystem ومراجعة أمنية مستقلة، automated key rotation، audit retention/export worker، provider recovery إنتاجي، code signing وrollback، ملفات/حافظة وترميز متقدم. relay عقدة واحدة ويستطيع رؤية الشاشة بعد إنهاء TLS؛ لا E2E media encryption. قد يبقى صف جلسة authorized مؤقتًا إذا أُغلق العارض قبل إنشاء socket؛ ينتهي بمهلة المنحة ولا يمثل إذن إدخال ناجحًا.

**التقييم:** أقرب لتجربة هندسية مضبوطة بين جهازين، مع بنية ومحرك فعليين وأدلة قابلة للمراجعة. لا جاهزية مؤسسية أو بيع. قرار قبول engineering preview مقيد بنجاح التشغيل النهائي المرتبط بالكود وبالإفصاح عن البوابات الباقية في [RELEASE_0.3.0_READINESS.md](RELEASE_0.3.0_READINESS.md).

## روابط التسليم والقياسات النهائية

- [المستودع الخاص](https://github.com/MostafaAhmed71/nexora-remote).
- [الكود التنفيذي النهائي المختبر](https://github.com/MostafaAhmed71/nexora-remote/commit/6c3fdaa3dde3577c61b3aaff6f7d8acb3f1f7599).
- [GitHub Actions النهائي الناجح — الوظائف الخمس](https://github.com/MostafaAhmed71/nexora-remote/actions/runs/40221447469).
- [Windows Installer/Agent/logs](https://github.com/MostafaAhmed71/nexora-remote/actions/runs/40221447469/artifacts/12608564205).
- [Windows Interactive evidence](https://github.com/MostafaAhmed71/nexora-remote/actions/runs/40221447469/artifacts/12609344867).
- [Kernel netem evidence](https://github.com/MostafaAhmed71/nexora-remote/actions/runs/40221447469/artifacts/12608598845).
- [Application network benchmark](https://github.com/MostafaAhmed71/nexora-remote/actions/runs/40221447469/artifacts/12609616072).
- [Web/server builds](https://github.com/MostafaAhmed71/nexora-remote/actions/runs/40221447469/artifacts/12609830302).

روابط Artifacts خاصة وتتطلب GitHub مخولًا وتنتهي وفق expires_at في ملف الأدلة (8 نوفمبر 2026). تحتوي الحزمة على مثبّت unsigned x64 self-contained؛ لم يُرفع ملف بناء إلى Git. بصمات ZIP من GitHub محفوظة؛ لم تُحسب بصمة EXE منفصلة في هذه المرحلة. commit التوثيق الذي يضم هذا التقرير لاحق للكود المختبر، ويغير الوثائق فقط مع skip-ci، ولا يدعي بناء كود جديد.

القياسات النهائية: متوسط capture **37.425 → 33.118 ms**، وencode **12.806 → 12.604 ms** في عشر لقطات لكل مسار داخل نفس Runner. CPU للعملية **281.250 → 203.125 ms**؛ managed allocations ارتفعت **751352 → 766968 bytes** وworking set **69865472 → 71163904 bytes**. لذلك لم نثبت خفضًا عامًا للذاكرة. بيانات JPEG **376220 bytes** لكل مسار، ومتوسط الإطار **37622 bytes**.

عينة إدخال النص عبر محرك Windows/relay: **124.769 ms** حتى الملاحظة، وليس photon latency. عينة netem المحدود: **12 رسالة/98304 bytes**، متوسط echo **536.165 ms**، ومعدل **1.773 رسالة اصطناعية/ثانية**؛ هذه ليست FPS الشاشة. reconnect socket المنفصل **2.174 ms** على loopback؛ لا يُنسب إلى مصادقة Agent. raw JSON وبيانات المنهجية محفوظة للمراجعة. لا يوجد ضمان أداء أو مقارنة H.264 مخترعة.
