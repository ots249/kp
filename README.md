# কারিগরি পাঠশালা — Civil 4th Semester

ডিপ্লোমা ইন ইঞ্জিনিয়ারিং (সিভিল) ৪র্থ সেমিস্টারের লেকচার, PDF ও ভিডিও রিসোর্স এক জায়গায় দেখার জন্য তৈরি একটি lightweight Progressive Web App (PWA)।

**Repository:** [ots249/kp](https://github.com/ots249/kp)  
**Default branch:** `main`  
**Live data:** Google Sheets-ভিত্তিক API  
**ভাষা:** বাংলা UI

---

## সূচিপত্র

- [প্রকল্পের বৈশিষ্ট্য](#প্রকল্পের-বৈশিষ্ট্য)
- [প্রযুক্তি](#প্রযুক্তি)
- [Repository structure](#repository-structure)
- [ডেটা ও API](#ডেটা-ও-api)
- [লোকালি চালানো](#লোকালি-চালানো)
- [PWA ও offline behavior](#pwa-ও-offline-behavior)
- [Progress ও video tracking](#progress-ও-video-tracking)
- [Admin page](#admin-page)
- [Push notifications](#push-notifications)
- [Configuration](#configuration)
- [Security notes](#security-notes)
- [Troubleshooting](#troubleshooting)
- [Development notes](#development-notes)

## সাম্প্রতিক আপডেট (১৭ নভেম্বর ২০২৬)

- Class Notification চালু করার সম্পূর্ণ প্রক্রিয়া এখন Main page-এর একটিমাত্র popup থেকে হয়: browser permission এবং Push subscription একই flow-তে সম্পন্ন হয়।
- Footer-এর অতিরিক্ত Notification button সরানো হয়েছে, যাতে ব্যবহারকারীকে দুই জায়গায় আলাদা করে Notification চালু করতে না হয়।
- Popup আর না দেখানোর শর্ত: browser permission `granted` এবং Service Worker-এ সক্রিয় Push subscription—দুটিই থাকতে হবে।
- Admin page-এর **Instant Push Notification Secret** এখন `localStorage`-এ সংরক্ষিত হয়; page refresh বা পুনরায় খোলার পরও একই browser-এ input-এ ফিরে আসে।
- SheetAPI249 Write API Key-এর মতোই Instant Push Secret browser-local storage-এ থাকে; অন্য browser/device-এ স্বয়ংক্রিয়ভাবে sync হয় না।

## প্রকল্পের বৈশিষ্ট্য

- API থেকে কোর্সের section ও lecture data লোড করা।
- Course data-এর জন্য একটিমাত্র SheetAPI249 endpoint; GET request দিয়ে data load করা হয়।
- PDF resource in-app viewer-এ খোলা এবং YouTube ভিডিও in-app player-এ চালানো।
- YouTube ভিডিওর duration পাওয়া: database value প্রথমে, প্রয়োজন হলে YouTube Data API fallback।
- ভিডিওর watch progress সংরক্ষণ এবং ৯০% দেখা হলে lecture complete করা।
- Lecture completion ও overall/section progress browser-এর LocalStorage-এ রাখা।
- Light/dark theme এবং system theme preference।
- Mobile-friendly responsive interface।
- PWA install prompt, Web App Manifest ও Service Worker caching।
- Offline অবস্থায় আগে cache হওয়া static asset এবং API response ব্যবহার করার চেষ্টা।
- Admin page থেকে course data manage করার UI এবং নতুন class share করার সুবিধা।

## প্রযুক্তি

| প্রযুক্তি | ব্যবহার |
|---|---|
| HTML5 | Application structure |
| CSS3 | Responsive layout, theme ও animation |
| Vanilla JavaScript (ES6+) | UI, API, progress ও player logic |
| Font Awesome | Icons |
| Google Fonts (Inter) | Typography |
| REST APIs | Course data ও YouTube duration |
| LocalStorage | Theme, completion, watch progress ও duration cache |
| Service Worker + Cache API | Static asset ও API response caching |
| Web App Manifest | PWA metadata ও install configuration |
| YouTube IFrame Player API | Video playback ও watch tracking |

কোনো npm build step বা bundler configuration বর্তমানে প্রয়োজন হয় না।

## Repository structure

```text
kp/
├── index.html       # Main course application
├── style.css        # Main application stylesheet
├── script.js        # API, rendering, progress, PDF/YouTube player logic
├── sw.js            # Service Worker and cache strategies
├── manifest.json    # PWA metadata, icons and shortcut
├── new.html         # Course content management page
├── api/
│   └── push/        # Push subscribe, notify, reminder and acknowledgement APIs
├── .github/
│   └── workflows/  # Hourly class reminder workflow
└── README.md        # Project documentation
```

## ডেটা ও API

Main page ও Admin page—দুটিই একই endpoint ব্যবহার করে:

`https://sheetapi249.vercel.app/api/v1/diploma-tutor/Sheet1`

- Main page: GET
- Admin page: GET, POST, PUT, DELETE
- PUT ও DELETE-এর জন্য `?row=<sheet-row-number>` ব্যবহার হয় (প্রথম data row = 2; row 1 header)।
- Write request-এ `X-API-Key` header বাধ্যতামূলক। Admin page-এ key input দিলে `localStorage`-এ `sheetapi249_write_key` নামে সংরক্ষিত হয়; repository code-এ key hardcode করা হয় না।
- Write permission SheetAPI249 project settings-এ enable থাকতে হবে।

Response normalizer সরাসরি array এবং প্রচলিত wrapper key যেমন `data`, `classes`, `rows`, `results`, `result`, `payload`, `sheet1` থেকে row array বের করার চেষ্টা করে। Primary API-এর response shape বদলালে browser DevTools-এর Console-এ `[Course API]` group ও diagnostic table দেখুন।

### Expected data

প্রতিটি row-তে ব্যবহৃত field provider অনুযায়ী কিছুটা ভিন্ন হতে পারে। অ্যাপের মূল course mapping-এ সাধারণত নিচের তথ্যগুলো প্রয়োজন:

- Section/chapter identifier ও title
- Lecture/content identifier ও title
- Resource link (কখনও nested `resource.resourceable.link`)
- Content type বা link থেকে নির্ণয়যোগ্য resource type
- Optional row ID এবং video duration

API response-এর প্রকৃত schema পরিবর্তিত হতে পারে; নতুন provider যুক্ত করার আগে `normalizeApiResponse()` এবং `transformClassesToSections()` পরীক্ষা করুন।

## লোকালি চালানো

এটি static frontend project। কোনো dependency install করার প্রয়োজন নেই।

```bash
git clone https://github.com/ots249/kp.git
cd kp
```

এরপর VS Code Live Server বা অন্য কোনো local HTTP server দিয়ে project root serve করুন এবং browser-এ খুলুন।

> PWA Service Worker localhost বা HTTPS secure context-এ কাজ করে। সরাসরি `file://` দিয়ে খোলা অবস্থায় Service Worker/PWA behavior পরীক্ষা করবেন না।

## PWA ও offline behavior

- `manifest.json` app name, scalable same-origin SVG icon, theme color, standalone display ও reset shortcut নির্ধারণ করে।
- `sw.js` app shell, offline page, CSS/JS, icons এবং নির্বাচিত external fonts/images cache করে।
- Navigation এবং same-origin static assets network-first; network ব্যর্থ হলে cached copy দেওয়া হয়।
- SheetAPI249 ও YouTube Data API GET response Service Worker Cache API-তে network-first হিসেবে cache হয়।
- Course API request ব্যর্থ হলে `script.js` সর্বশেষ সফল course rows `localStorage`-এ সংরক্ষণ করে এবং offline-এ সেই data দেখায়। Progress ও settings আলাদা key-তে থাকে।
- Offline অবস্থায় আগে খোলা app shell এবং আগে সফলভাবে লোড করা course list ব্যবহার করা যায়। প্রথমবারের load-এর আগে cache না থাকলে course data পাওয়া যাবে না।
- YouTube player/embed এবং live video network-dependent; offline playback নিশ্চিত নয়। PDF-এর external source-ও offline নাও চলতে পারে।
- Install button Android/Desktop-এর native prompt থাকলে সেটি ব্যবহার করে; iOS ও অন্যান্য browser-এ manual install guide দেখায়।
- নতুন Service Worker প্রস্তুত হলে in-app update banner আসে। ব্যবহারকারী Update চাপলে নতুন version activate হয়ে page reload হয়।
- Network status indicator offline অবস্থা দেখায়। Cache পরিষ্কার button শুধু temporary/API/course cache মুছে; progress ও theme preference অক্ষত রাখে।
- Web Push notification সমর্থিত: popup থেকেই browser permission ও push subscription—দুটিই চালু হয়; আলাদা footer toggle নেই।
- নতুন Lecture/PDF যোগ হলে Admin page থেকে Instant Push পাঠানো যায়।
- ক্লাস না খোলা থাকলে GitHub Actions-এর hourly workflow প্রতি ঘণ্টায় reminder check করে।
- Push subscription ও reminder state Vercel Blob-এ সংরক্ষিত হয়।

নতুন deploy-এ `CACHE_NAME`, `API_CACHE_NAME` এবং `RUNTIME_CACHE_NAME` version review করুন। Cache version bump করলে পুরোনো app-shell cache activation-এর সময় মুছে যাবে।

## Progress ও video tracking

- Completed lecture এবং video watch percentage LocalStorage-এ থাকে; এগুলো browser/device-ভিত্তিক, server account sync নয়।
- Video completion threshold: `COMPLETION_THRESHOLD = 0.90`।
- Video duration প্রথমে course data থেকে নেওয়া হয়; না থাকলে YouTube Data API দিয়ে fetch করার চেষ্টা হয়।
- Duration cache LocalStorage-এ রাখা হয়।
- Database-এ duration write-back বর্তমানে `ENABLE_DB_WRITE = false`; server-side নিরাপদ write proxy ছাড়া এটি enable করবেন না।

## Admin page

`new.html` হলো course content manage করার আলাদা page। Main page-এর course title-এ একাধিকবার click করলে page-টি খোলার hidden navigation রয়েছে।

Admin page একই SheetAPI249 endpoint-এ POST, PUT ও DELETE request পাঠায়। Write API Key password field-এ দিতে হয়; key browser-এর `localStorage`-এ `sheetapi249_write_key` নামে থাকে। `Instant Push Notification Secret`-ও `localStorage`-এ `civil4th_push_admin_secret` নামে সংরক্ষিত হয়, তাই Admin page পুনরায় খুললেও input-এ ফিরে আসে। SheetAPI249 project settings-এ Write permission enable করে project key ব্যবহার করতে হবে।

**গুরুত্বপূর্ণ:** hidden click sequence কোনো authentication বা access control নয়। Write API Key public code-এ hardcode করা হয়নি, তবে Admin page ব্যবহারকারীর browser-এ key প্রবেশ করানো হয়। Public admin access সীমিত রাখতে হবে।

## Push notifications

### User-side setup

- Main page খোলার সময় browser notification permission `granted` না থাকলে অথবা Push subscription না থাকলে setup popup দেখায়।
- Popup-এর **Notification চালু করুন** button browser permission নেয় (যদি আগে দেওয়া না থাকে), Service Worker-এর Push subscription তৈরি/পুনরুদ্ধার করে এবং `/api/push/subscribe`-এ subscription save করে।
- Permission এবং subscription—দুটিই ঠিক থাকলে popup আর দেখায় না। Push setup-এর জন্য footer-এর দ্বিতীয় কোনো button নেই।
- Browser permission আগে থেকে `denied` হলে site থেকে পুনরায় permission prompt দেখানো সম্ভব নয়; browser/site settings থেকে notification allow করতে হবে।

### Immediate push

Admin page (`new.html`) থেকে নতুন Lecture/PDF submit করার সময় `/api/push/notify` endpoint-এ request পাঠানো হয়। Request-এ `X-Admin-Secret` header ব্যবহার হয়। Secretটি browser-এর localStorage-এ থাকে; shared/public device-এ সংরক্ষণ করা নিরাপদ নয়।

### Hourly reminders

- Workflow: `.github/workflows/hourly-class-reminders.yml`
- Schedule: প্রতি ঘণ্টায় `0 * * * *` (GitHub Actions scheduled workflow; GitHub-এর queue/load অনুযায়ী শুরুতে delay হতে পারে)।
- Workflow `https://civil4th.vercel.app/api/push/check-classes` endpoint-এ authenticated request পাঠায়।
- নতুন class শনাক্ত করতে SheetAPI249 rows-এর snapshot Vercel Blob-এ রাখা হয়।
- কোনো subscriber class না খুললে reminder state অনুযায়ী প্রতি ৬০ মিনিটে reminder পাঠানোর চেষ্টা হয়।
- Class খোলার acknowledgement `/api/push/acknowledge` endpoint-এ পাঠানো হয়; acknowledgement সফল হলে ঐ class-এর reminder বন্ধ হওয়ার কথা।
- Push notification tag একই class-এর duplicate notification কমাতে সাহায্য করে; OS/browser delivery behavior পুরোপুরি app-এর নিয়ন্ত্রণে নয়।

### Required Vercel environment variables

| Variable | Purpose |
|---|---|
| `CRON_SECRET` | GitHub Actions workflow থেকে hourly endpoint authorize করে |
| `PUSH_ADMIN_SECRET` | Admin page থেকে immediate push authorize করে |
| `VAPID_SUBJECT` | Web Push VAPID contact/subject |
| `VAPID_PUBLIC_KEY` | Browser push subscription এবং server VAPID public key |
| `VAPID_PRIVATE_KEY` | Server-side Web Push signing key |

`CRON_SECRET` একই value হিসেবে GitHub repository Actions Secrets এবং Vercel environment variables-এ রাখতে হবে। `PUSH_ADMIN_SECRET` ও VAPID keys শুধু Vercel server environment-এ থাকবে; এগুলো source code বা README-তে value হিসেবে commit করবেন না। Push subscription/reminder state রাখার জন্য Vercel Blob store configure থাকতে হবে।

## Configuration

প্রধান configuration `script.js`-এর শুরুতে রয়েছে:

- `API_ENDPOINT` / `API_ENDPOINTS` — একমাত্র SheetAPI249 course data endpoint।
- `ENABLE_DB_WRITE` — duration write-back on/off (বর্তমানে false)।
- `YOUTUBE_API_KEY` — YouTube Data API key।
- `COMPLETION_THRESHOLD` — video completion percentage।
- `ADMIN_PAGE` — admin page path।

API key কখনও unrestricted অবস্থায় public repository-তে রাখবেন না। Browser-এ ব্যবহৃত key যেকোনো visitor দেখতে পারে; Google Cloud Console-এ API restriction ও HTTP referrer restriction দিন, quota monitor করুন এবং key leak হয়ে থাকলে rotate করুন। Private credential server-side proxy/environment variable-এ রাখুন।

## Security notes

- API-provided title ও attribute render করার সময় escaping helper ব্যবহার করা হয়েছে; নতুন dynamic HTML যোগ করার সময় একই নিরাপত্তা বজায় রাখুন।
- External link নতুন tab-এ খোলার সময় `noopener` ব্যবহার করুন।
- Browser-side write API disabled রাখা হয়েছে।
- Admin UI-কে secret URL বা hidden click দিয়ে secure ধরে নেওয়া যাবে না।
- Analytics scripts (Google Analytics ও Umami) `index.html`-এ যুক্ত আছে; deployment-এর আগে privacy notice ও consent requirements যাচাই করুন।
- Public client-side code-এ থাকা API key secret নয়।

## Troubleshooting

| সমস্যা | কী পরীক্ষা করবেন |
|---|---|
| Course data লোড হচ্ছে না | Internet, API availability, CORS এবং Console-এর `[Course API]` diagnostics |
| Primary API থেকে fallback-এ চলে যাচ্ছে | Primary response-এর HTTP status, JSON structure ও normalized row count |
| Video duration দেখা যাচ্ছে না | YouTube video ID, API key restriction/quota এবং Console error |
| Progress থাকছে না | Browser LocalStorage permission/availability ও site data |
| PWA install option আসছে না | HTTPS/localhost, manifest, valid icons এবং Service Worker registration |
| Notification popup আসছে না | Browser permission `granted` এবং Push subscription দুটোই আছে কি না পরীক্ষা করুন |
| Notification permission দেওয়া যাচ্ছে না | Browser/site settings-এ notification permission `denied` থাকলে সেখান থেকে Allow করুন |
| Instant push 401 দিচ্ছে | Admin page-এর Instant Push Secret এবং Vercel-এর `PUSH_ADMIN_SECRET` একই কি না দেখুন |
| Hourly reminder workflow 401 দিচ্ছে | GitHub Actions secret `CRON_SECRET` এবং Vercel environment variable একই কি না দেখুন |
| Push পাঠানো হচ্ছে না | Vercel Blob, VAPID environment variables, subscription status ও function logs পরীক্ষা করুন |
| Offline page খুলছে না | আগে online অবস্থায় app open করে assets cache হয়েছে কি না |

## Development notes

- UI বা data transformation পরিবর্তনের পর mobile ও desktop viewport-এ পরীক্ষা করুন।
- API provider পরিবর্তন করলে success response এবং error response—দুই ধরনের payload পরীক্ষা করুন।
- Service Worker update পরীক্ষা করতে DevTools → Application → Service Workers/Cache Storage ব্যবহার করুন।
- Repository-তে automated test suite বা CI test workflow বর্তমানে নথিভুক্ত নেই; production release-এর আগে manual regression test করুন।

## License

এই repository-তে বর্তমানে আলাদা `LICENSE` file শনাক্ত করা হয়নি। তাই ব্যবহারের অধিকার বা redistribution-এর শর্ত অনুমান করবেন না। Open-source license দিতে চাইলে উপযুক্ত license file যোগ করুন।

---

**Maintainer:** [@ots249](https://github.com/ots249)  
**Repository:** https://github.com/ots249/kp
