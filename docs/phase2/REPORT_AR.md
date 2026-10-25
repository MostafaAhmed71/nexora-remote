# NEXORA Remote — تقرير المرحلة الثانية

التاريخ: 25 أكتوبر 2026. المستودع نفسه بقي خاصًا، ولم يُنشأ مستودع آخر أو VPS أو نشر عام أو اتصال بأجهزة المدرسة. هذا إصدار هندسي 0.2.0، وليس إعلان جاهزية للبيع أو للاستخدام المؤسسي.

## النتيجة المثبتة

تم تشغيل محرك NEXORA الفعلي على سطح مكتب Windows Runner تفاعلي: التقاط GDI لشاشة حقيقية، ضغط JPEG، تمرير عبر Fastify الحقيقي، استقبال الإطارات، إرسال نص عربي ونقرة ماوس إلى نافذة اختبار مملوكة للاختبار، تغيير حجم الإطار المشفر، قطع اتصال Agent وإعادة التوثيق بتفويض جديد، ثم إلغاء الجلسة. هذا يتجاوز نجاح البناء، ولكنه اختبار loopback داخل جهاز واحد. اختبار المتصفح مستقل ويستخدم إطارات اختبار؛ لم يُثبت بعد المسار المتكامل من متصفح على جهاز ثان إلى Agent المثبت كخدمة وعامل WTS.

- [الكود التنفيذي الذي اختُبر](https://github.com/MostafaAhmed71/nexora-remote/commit/7072a40efe11f47b016248a217b3a3e743ed4aeb).
- [GitHub Actions الناجح — أربع وظائف](https://github.com/MostafaAhmed71/nexora-remote/actions/runs/40186778292): node، e2e، postgres، windows.
- آخر commit الخاص بهذا التقرير يضيف وثائق وأدلة وإعدادات نموذجية فقط؛ البناء المشار إليه يخص commit الكود أعلاه، ولا يُنسب تلقائيًا إلى أي تغيير تنفيذي لاحق.
- الدليل المنظم: [CI_VERIFICATION.json](CI_VERIFICATION.json)، وبصمات البناء: [BUILD_ARTIFACTS.json](../BUILD_ARTIFACTS.json). أُبقيت أدلة المرحلة الأولى في `docs/phase1`.

## المعمارية النهائية

React/TypeScript/Vite RTL يتصل بـ Fastify/PostgreSQL مع عزل المؤسسات وRBAC وACL للأجهزة. يصدر الخادم منح جلسات RSA موقعة قصيرة العمر وتذاكر WebSocket أحادية الاستخدام، ويعيد فحص التفويض أثناء التدفق. يتصل Agent بالخادم اتصالًا صادرًا. Windows Service يحتفظ بهوية الجهاز المحمية بـ DPAPI وDACL، ويطلق عاملًا ظاهرًا داخل جلسة المستخدم عبر WTS؛ قناة named pipe محلية مؤمنة بـ SID/PID وحدود أحجام ومهل تربطهما. التقاط الشاشة والإدخال يجريان في العامل، وليس Session 0. يحتفظ البرنامج بمسار Agent مباشر للتطوير والاختبارات. راجع [المعمارية](../ARCHITECTURE.md) و[البروتوكول](../PROTOCOL.md).

## تصنيف الوظائف

التصنيف يخص النطاق المذكور في عمود الدليل، وليس جميع ظروف Windows الممكنة.

| المكون                                     | التصنيف                       | ما أُنجز وما بقي                                                                                                                                                                                |
| ------------------------------------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| بناء Frontend/Backend/Agent                | Implemented & Tested          | البناء وTypecheck وفحوص المصدر ناجحة على CI؛ نشر إنتاجي غير منفذ.                                                                                                                               |
| المصادقة وعزل المؤسسات وRBAC               | Implemented & Tested          | اختبارات API وPostgreSQL/RLS ومنع الوصول المتقاطع؛ ليست شهادة تدقيق أمني مستقل.                                                                                                                 |
| Device Enrollment وهوية الجهاز             | Implemented & Tested          | إثبات RSA وnonce والتذكرة الأحادية، ومفاتيح آلة DPAPI/DACL؛ يحتاج إعادة تشغيل فعلية بعد التسجيل.                                                                                                |
| Signed grants وSession Revocation          | Implemented & Tested          | فحص الإذن أثناء التدفق، انتهاء عمر تفويض المستخدم، إلغاء الجلسة ورفض الإدخال المتأخر.                                                                                                           |
| Device-level ACL                           | Implemented & Tested          | إدارة ACL فعلية وخيار المنع الافتراضي وإلغاء الجلسات عند التغيير؛ اختبارات رفض/سماح وعزل.                                                                                                       |
| Windows Service ودورة التثبيت              | Implemented & Tested          | تثبيت وتشغيل وإيقاف وإعادة تشغيل وخدمة تلقائية وrepair upgrade وإزالة داخل Runner. لا يثبت ذلك تحكم العامل بعد الإقلاع.                                                                         |
| Service → WTS worker → IPC متكامل          | Implemented but Not Validated | التنفيذ موجود، والـ IPC وDPAPI اختُبرا منفصلين؛ لم ينفذ E2E بخدمة مسجلة وعامل مستخدم بعد التسجيل/reboot.                                                                                        |
| GDI/JPEG Remote Engine                     | Implemented & Tested          | التقاط وإرسال شاشة حقيقية عبر الخادم على loopback، وتغيير دقة الترميز؛ تغيير وضع شاشة Windows الفعلي غير متحقق.                                                                                 |
| Remote Input                               | Partially Implemented         | الماوس والأزرار والعجلة والمفاتيح والمحارف العربية والـ modifiers والـ extended keys منفذة؛ الاختبار الفعلي أثبت نقرة ونصًا عربيًا فقط. مصفوفة IME/تخطيطات فعلية ورفع الأزرار وقت القفل مطلوبة. |
| Remote Viewer                              | Partially Implemented         | fullscreen/fit/حجم الإطار/جودة/FPS/bitrate/RTT وإعادة التفويض وحالات الخطأ منفذة؛ 4 اختبارات E2E ناجحة، دون متصفح على جهاز ثان أمام Agent Windows فعلي.                                         |
| Automatic Reconnection                     | Implemented & Tested          | أُجبر Agent على انقطاع فعلي ثم عاد بهوية موثقة ومنحة جديدة على loopback؛ انقطاع WAN طويل وإعادة تشغيل الخدمة غير مثبتين.                                                                        |
| Unattended Access                          | Partially Implemented         | اتصال الخدمة التلقائي وهوية مستمرة وعامل ظاهر وإيقاف محلي محفوظ؛ reboot/WTS/تبديل المستخدم/قفل الشاشة تحتاج تحققًا مستقلًا.                                                                     |
| Multi-monitor / High DPI                   | Partially Implemented         | اختيار monitor وPerMonitorV2 وتطبيع الإحداثيات منفذة؛ شاشات متعددة وتغيير DPI والانتقال بين الشاشات غير متحققة عمليًا.                                                                          |
| Quality / FPS controls                     | Implemented & Tested          | حدود جودة/عرض/FPS وإعادة التحجيم مختبرة؛ adaptation الحالية تأخير محافظ حسب زمن الالتقاط/الإرسال، وليست Adaptive Bitrate كاملة.                                                                 |
| WGC / DXGI / H.264 / WebRTC / GPU encoding | Not Implemented               | جرى التقييم الهندسي، ولم تُضف أسماء تقنيات كبديل عن تشغيلها. GDI/JPEG هو المسار الحقيقي الحالي.                                                                                                 |
| File Transfer                              | Not Implemented               | Upload/Download/Progress/Cancel غير منفذة؛ الأزرار معطلة ولا توجد صلاحية تشغيل مزعومة.                                                                                                          |
| Clipboard Text Sync                        | Not Implemented               | معطلة؛ لا مزامنة خفية ولا ادعاء اختبار.                                                                                                                                                         |
| MFA recovery                               | Partially Implemented         | رموز قوية مخزنة كبصمات واستخدام أحادي مع كلمة مرور، وواجهة واختبارات؛ يلزم إحكام عملية استبدال المجموعة ضد طلبات متزامنة.                                                                       |
| Password Recovery production delivery      | Partially Implemented         | واجهة إرسال HTTPS موثقة بمهلة ومنع redirects ومختبرة بمحاكاة؛ لا مزود بريد إنتاجي موصول.                                                                                                        |
| Secure IPC                                 | Implemented & Tested          | framing/حدود الحجم وACL ورفض Network SID وتحقق PID أصلي؛ لا يُستنتج منه نجاح كامل مسار WTS.                                                                                                     |
| TLS deployment                             | Implemented but Not Validated | اشتراط HTTPS للإنتاج وتجهيز الإعداد؛ لم يُنشر النظام أو يُختبر عبر شهادات ونطاق إنتاجيين.                                                                                                       |
| Audit retention                            | Partially Implemented         | سجلات تدقيق قائمة وتصميم احتفاظ؛ عامل الحذف/الأرشفة المجدول غير منفذ.                                                                                                                           |
| Windows Installer                          | Implemented & Tested          | self-contained x64، خدمة واضحة وإعداد وlogs وإزالة وrepair upgrade؛ غير موقع، وترقية 0.1 تتطلب إزالة واضحة وإعادة تسجيل.                                                                        |

## نتائج الاختبارات الفعلية

| الفحص                                              | النتيجة                                                                                                               |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Unit/API/security/protocol/network                 | 36 اختبارًا في 4 ملفات: ناجحة. تشمل replay وorigin/cookie وACL وcross-tenant وانتهاء التفويض وملكية socket بعد await. |
| Playwright                                         | 4 اختبارات ناجحة، منها جلسة عبر backend حقيقي وإطارات محاكاة وجودة ونص وفصل.                                          |
| PostgreSQL 17                                      | 5 فحوص migrations وRLS وقيود tenant ناجحة على PostgreSQL أصلي.                                                        |
| C# grant contracts                                 | 5 فحوص ناجحة.                                                                                                         |
| Windows native                                     | framing/ACL/PID وDPAPI ناجحة؛ GDI وJPEG وSendInput عربي وماوس ورفض بعد الإلغاء ناجحة.                                 |
| Real Engine loopback                               | خادم Fastify فعلي + .NET Engine + نافذة اختبار Windows حقيقية: ناجح، بما فيه الانقطاع ومنحة جديدة.                    |
| Service/Installer                                  | install/start/stop/restart/repair-upgrade/uninstall ناجحة؛ حفظ بيانات الآلة خلال repair مثبت.                         |
| npm runtime dependency audit                       | صفر ثغرات معلنة وقت التشغيل. لا يعني غياب جميع الثغرات أو اكتمال penetration test.                                    |
| جهازان Windows / service-worker E2E / reboot / WAN | لم تُنفذ؛ لا تُحسب ناجحة.                                                                                             |

لم تُختبر شاشة تسجيل الدخول أو Secure Desktop/UAC أو التحكم بتطبيق مرتفع الصلاحية. لا توجد آلية تجاوز لها. لا توجد شهادة مستقلة ضد Session Hijacking أو Privilege Escalation؛ توجد إصلاحات واختبارات محددة موثقة أدناه.

## الأمان: إصلاحات ومخاطر باقية

وثق [SECURITY_REVIEW.md](SECURITY_REVIEW.md) الثغرات المثبتة ومساراتها واختبارات منع الرجوع: تسريب التذاكر في URL، غياب ACL لكل جهاز، استمرار جلسة تتجاوز عمر تسجيل الدخول، تفويض الإدخال من socket مستبدل أثناء انتظار DB، تسابق الإغلاق، ضعف حدود الإدخال، وأخطاء الفصل وغياب جاهزية سطح المكتب. انتقل توثيق WebSocket إلى تذكرة أحادية في subprotocol للمتصفح وBearer للـ Agent مع redaction للرؤوس، وإعادة التحقق من المالك والإذن، وصار الجهاز متاحًا للتحكم فقط بعد إقرار صحة سطح المكتب.

المخاطر الباقية: صفوف جلسات نشطة بعد إعادة تشغيل backend قد تمنع جلسة جديدة حتى الانتهاء؛ تنسيق أفقي متعدد الخوادم غير منفذ؛ توليد مجموعة MFA recovery يحتاج معاملة ذرية لمقاومة التزامن؛ سياسة الاحتفاظ ليست عاملًا منفذًا؛ انتقالات monitor/DPI ومصفوفة IME وقفل الشاشة غير متحققة؛ WTS وامتيازات الخدمة تحتاج مراجعة وتجربة مستقلة؛ المثبت غير موقع. لا توجد أسرار إنتاجية أو كلمات مرور Windows في الكود، ولا مفاتيح إنتاجية صورية مقدمة كأمان فعلي.

## الأداء وحدود القياس

على run المشار إليه: زمن إرسال النص حتى ملاحظته داخل نافذة الاختبار **64.6213 ms** في عينة واحدة، بفحص كل 50 ms؛ ليس photon latency أو SLA. ترميز 20 صورة اصطناعية: **866.9536 ms** زمن حائط و**250 ms** CPU للعملية و**86140 bytes** JPEG و**49467392 bytes** working set. عينتا إطار شاشة بلغتا **56404 bytes**، وليستا مجموع استهلاك الشبكة. تختلف الأرقام بين تشغيل وآخر.

اختبار الشبكة قاس WebSocket loopback فعليًا مع pacing وتأخير وإسقاط إطارات تطبيقية وإعادة اتصال: baseline ستة إطارات/30.81565 إطار اصطناعي في الثانية، weak أربعة وصلت واثنان أُسقطا/3.295019 في الثانية. ليس إسقاط TCP حقيقيًا أو FPS لسطح مكتب أو اختبار إنترنت المدرسة. [PERFORMANCE.md](PERFORMANCE.md) و[القياسات الخام](network-benchmark.json) يشرحان المنهجية وحدود CPU/RAM والنطاق غير المقاس. لم نقس حمل شاشة متحركة طويل المدة أو جهازين أو WAN أو ABR/GPU.

## ملفات Windows والأدلة

كل الروابط خاصة وتتطلب حساب GitHub مخولًا، وتنتهي مدة احتفاظ Artifacts في 8 نوفمبر 2026 ما لم تُنزّل أو يُعاد البناء.

- [Windows Agent + Installer + logs](https://github.com/MostafaAhmed71/nexora-remote/actions/runs/40186778292/artifacts/12596530331).
- [Windows validation evidence](https://github.com/MostafaAhmed71/nexora-remote/actions/runs/40186778292/artifacts/12596224165).
- [Network benchmark](https://github.com/MostafaAhmed71/nexora-remote/actions/runs/40186778292/artifacts/12596348632).
- [Web/server build](https://github.com/MostafaAhmed71/nexora-remote/actions/runs/40186778292/artifacts/12595754972).

المثبت `NexoraRemote-0.2.0-win-x64-unsigned.exe`: الحجم 41,747,300 بايت؛ SHA-256: `b9e2a631910b7a105708c15ea50929be98fa4fe0842634f1c2757d696f2d3f19`. تم تنزيل أرشيف Artifact كاملًا والتحقق من SHA-256 المطابق لـ GitHub، وفحص ZIP ثم استخراج المثبت وحساب بصمته. لا شهادة Code Signing، ولا Release إنتاجي تلقائي، ولا ملفات بناء ضخمة في Git.

## الجاهزية والخطوة التالية

**جاهز لبدء تحقق هندسي مضبوط، وليس جاهزًا للاستخدام المؤسسي أو للبيع.** يوجد [TWO_WINDOWS_KIT.md](TWO_WINDOWS_KIT.md) يحدد خطوات ومعايير قبول لجهازين مصرح بهما: تسجيل وتثبيت واضح، خادم اختبار داخل شبكة معزولة مع TLS، متصفح ثان، اختبار خدمة وعامل بعد reboot، صورة وماوس ومفاتيح وتخطيطات عربية، دقة/DPI/شاشات، إلغاء وصول، انقطاع شبكة، logs وأرقام فعلية، إزالة نظيفة. هذه حزمة لاحقة؛ لم يُطلب من المستخدم تنفيذ أوامر محلية ولم تُجر التجربة على جهازه.

قبل VPS مستقبلًا: إكمال بوابات الجهازين والخدمة، إصلاح المخاطر الباقية، إعداد شهادة حقيقية وreverse proxy لـ HTTPS/WSS، قاعدة PostgreSQL بمستخدم runtime غير مالك ونسخ احتياطي/استرجاع مجرب، أسرار خارج Git وتدويرها، مزود recovery فعلي، مراقبة وتنبيهات واحتفاظ بالتدقيق، اختبار حمل وقرار توسعة relay، توقيع Installer إن توفر، ومراجعة أمنية مستقلة. التفاصيل في [DEPLOYMENT.md](../DEPLOYMENT.md). لم يُنفذ أي نشر في هذه المرحلة.
