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
- [Configuration](#configuration)
- [Security notes](#security-notes)
- [Troubleshooting](#troubleshooting)
- [Development notes](#development-notes)

## প্রকল্পের বৈশিষ্ট্য

- API থেকে কোর্সের section ও lecture data লোড করা।
- একাধিক API endpoint দিয়ে sequential fallback; প্রতিটি API-এর HTTP, JSON ও normalization failure console-এ আলাদা করে দেখানো।
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
└── README.md        # Project documentation
```

## ডেটা ও API

অ্যাপটি `script.js`-এ নির্ধারিত endpoint-গুলো ক্রমানুসারে চেষ্টা করে। প্রথম usable response পাওয়া গেলে পরবর্তী fallback endpoint-গুলো আর call করা হয় না।

বর্তমান read priority:

1. **Primary:** SheetAPI249 — `/api/v1/diploma-tutor/Sheet1`
2. **Fallback:** Sheet2API
3. **Fallback:** SheetDB
4. **Fallback:** Sheety

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

- `manifest.json` app name, icons, theme color, standalone display ও reset shortcut নির্ধারণ করে।
- `sw.js` install-এর সময় static assets cache করে।
- Static resource-এর strategy হলো cache-first, cache miss হলে network fallback।
- নির্দিষ্ট read API response network-first পদ্ধতিতে cache হয়; network failure হলে cached response ব্যবহার করা হয়।
- YouTube player/embed network-dependent; offline অবস্থায় ভিডিও playback নিশ্চিত নয়।
- Push event handler আছে, তবে push subscription, permission flow এবং server-side push sender আলাদাভাবে configure না করলে notification নিজে থেকে পাঠানো হবে না।

Service Worker cache পরিবর্তন করলে `CACHE_NAME` এবং API cache strategy review করুন। পুরোনো cache version বদলালে activation-এ পুরোনো cache মুছে যাবে।

## Progress ও video tracking

- Completed lecture এবং video watch percentage LocalStorage-এ থাকে; এগুলো browser/device-ভিত্তিক, server account sync নয়।
- Video completion threshold: `COMPLETION_THRESHOLD = 0.90`।
- Video duration প্রথমে course data থেকে নেওয়া হয়; না থাকলে YouTube Data API দিয়ে fetch করার চেষ্টা হয়।
- Duration cache LocalStorage-এ রাখা হয়।
- Database-এ duration write-back বর্তমানে `ENABLE_DB_WRITE = false`; server-side নিরাপদ write proxy ছাড়া এটি enable করবেন না।

## Admin page

`new.html` হলো course content manage করার আলাদা page। Main page-এর course title-এ একাধিকবার click করলে page-টি খোলার hidden navigation রয়েছে।

**গুরুত্বপূর্ণ:** hidden click sequence কোনো authentication বা access control নয়। `new.html`-এ কার্যকর server-side authentication/authorization না থাকলে URL জানা যে কেউ page-টি খুলতে পারে। Public deployment-এর আগে write endpoint-গুলো server-side permission দিয়ে সুরক্ষিত করুন।

## Configuration

প্রধান configuration `script.js`-এর শুরুতে রয়েছে:

- `API_ENDPOINTS` — read API ও timeout।
- `ENABLE_DB_WRITE` — duration write-back on/off।
- `WRITE_API_ENDPOINTS` — duration update provider configuration।
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
