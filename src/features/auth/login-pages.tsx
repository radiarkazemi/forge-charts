import Box from "@mui/material/Box";

export type InfoPageId = "about" | "terms" | "privacy" | "help";

type Lang = "en" | "fa";

interface Section {
  readonly heading: string;
  readonly paragraphs: readonly string[];
}

interface PageCopy {
  readonly title: string;
  readonly lede: string;
  readonly updated: string;
  readonly back: string;
  readonly sections: readonly Section[];
}

const PAGES: Record<Lang, Record<InfoPageId, PageCopy>> = {
  en: {
    about: {
      title: "About Us",
      lede: "Forge Charts is the charting desk at forgechart.ir. The market, without the noise.",
      updated: "Updated 14 November 2026",
      back: "Back to sign in",
      sections: [
        {
          heading: "What Forge is",
          paragraphs: [
            "Forge is a professional charting workspace. You open a symbol, read the price, draw on the chart, and keep your layouts. Live and historical prices, indicators, replay, and multi-pane desks sit in one screen.",
            "The product is the chart. Forge is not a broker, it does not hold client funds, and it does not send orders to an exchange. The demo panel uses practice numbers, not real money.",
          ],
        },
        {
          heading: "Who it is for",
          paragraphs: [
            "Forge is built for traders who want a clear desk: gold, crypto, FX, indices, and oil on the same charts, with tools that stay where you left them.",
            "Create an account with your email, confirm your name and country, and the charts open. The same account can bring your layouts back on another device.",
          ],
        },
        {
          heading: "What you can do",
          paragraphs: [
            "Chart with candles, drawings, and indicators. Split the desk into panes. Replay a session bar by bar. Switch the interface between English and Persian. The price strip on the sign-in screen uses live market figures and today’s change.",
            "Sign-in, drawings, and layouts stay with your account. Password reset is not offered yet, so keep the password you chose.",
          ],
        },
      ],
    },
    terms: {
      title: "Terms",
      lede: "These terms cover use of Forge Charts at forgechart.ir. By creating an account or signing in, you accept them.",
      updated: "Updated 14 November 2026",
      back: "Back to sign in",
      sections: [
        {
          heading: "The service",
          paragraphs: [
            "Forge gives you charts, drawings, indicators, replay, saved layouts, and a demo trading panel. Market prices come from the feeds that serve the desk. They can pause, gap, or differ from another broker’s quote.",
            "Forge is a charting tool. It is not a broker, exchange, or investment adviser. Nothing on the chart is a recommendation to buy or sell.",
          ],
        },
        {
          heading: "Your account",
          paragraphs: [
            "You sign in with an email and a password you choose, or with Google when that option is available for the site. Keep the password private. Password reset is not available yet.",
            "Before the charts open, you confirm your name and country and accept these terms and the risk notice. The details you submit must be yours and accurate.",
            "An account is for you. Do not share it, and do not try to open the charts as someone else.",
          ],
        },
        {
          heading: "Risk",
          paragraphs: [
            "Trading real markets can lose money. Indicators, drawings, and past prices do not predict the future. You decide what to do with what you see.",
            "Demo balances, practice orders, and simulated profit are not cash and cannot be withdrawn.",
          ],
        },
        {
          heading: "Acceptable use",
          paragraphs: [
            "Do not attack the site, probe it for access you were not given, overload the price feeds, or misuse another person’s account. We can close an account that does.",
            "We can update these terms. The date on this page is the version in force. Continued use of Forge after an update means you accept the new terms.",
          ],
        },
      ],
    },
    privacy: {
      title: "Privacy Policy",
      lede: "This page says what Forge stores so your charts and account can open again, and what it does not do with that information.",
      updated: "Updated 14 November 2026",
      back: "Back to sign in",
      sections: [
        {
          heading: "What we store",
          paragraphs: [
            "Your email, display name, and a hash of your password. The password itself is not kept in plain text. If you tick Remember me, only the email is saved, never the password.",
            "The safety step stores the name and country you submit so the account can be authorized. Older accounts may also have a phone number and national ID from an earlier form.",
            "Your chart layouts, drawings, indicators, watchlists, and display settings stay with the account so the desk looks the same the next time you sign in.",
          ],
        },
        {
          heading: "Where it lives",
          paragraphs: [
            "The account and the charts are saved in this browser. A sync key derived from your sign-in can copy that desk to your account in the cloud so another device can open it. The password is not sent as a stored password.",
            "Signing out clears the session in this browser. Clearing the site’s saved data removes the local copy of the account.",
          ],
        },
        {
          heading: "Google and market data",
          paragraphs: [
            "If you use Continue with Google, Forge receives the email and name Google confirms for that sign-in. Forge does not receive your Google password.",
            "Opening a chart requests prices from the market feeds behind Forge. Those requests identify the symbol and the time range, not your password.",
          ],
        },
        {
          heading: "What we do not do",
          paragraphs: [
            "We do not sell your account details. We do not use them for advertising profiles. Access to safety details is limited to the signed-in account.",
          ],
        },
      ],
    },
    help: {
      title: "Help",
      lede: "Short answers for signing in, creating an account, and opening the charts.",
      updated: "Updated 14 November 2026",
      back: "Back to sign in",
      sections: [
        {
          heading: "Create an account",
          paragraphs: [
            "On the sign-in screen choose New to Forge, then Create account. Enter your name, email, and a password of at least 6 characters, and enter the password again. Then complete the safety step with your name and country and accept the terms and the risk notice. The charts open after that.",
          ],
        },
        {
          heading: "Sign in",
          paragraphs: [
            "Use the email and password for this account. Remember me keeps the email on this browser only. Continue with Google is available when Google sign-in is turned on for forgechart.ir.",
            "Forgot password is not available yet. Use the password you set when you created the account.",
          ],
        },
        {
          heading: "Language and the price strip",
          paragraphs: [
            "EN and FA on the card switch the language. The card stays on the right in both languages. The moving prices along the bottom are live market figures and today’s percent change. A green ▲ is up. A red ▼ is down.",
          ],
        },
        {
          heading: "If the chart does not open",
          paragraphs: [
            "Hard-refresh the page (Ctrl+Shift+R, or the equivalent on your phone). If you just created the account, finish the safety step. If you still cannot sign in, use the same email and password you chose. Demo orders are practice numbers, not real money.",
          ],
        },
      ],
    },
  },
  fa: {
    about: {
      title: "درباره ما",
      lede: "فورج چارت میز نمودار forgechart.ir است. بازار، بدون شلوغی.",
      updated: "به‌روزرسانی ۱۴ نوامبر ۲۰۲۶",
      back: "بازگشت به ورود",
      sections: [
        {
          heading: "فورج چیست",
          paragraphs: [
            "فورج یک فضای حرفه‌ای برای نمودار است. نماد را باز می‌کنید، قیمت را می‌خوانید، روی نمودار رسم می‌کنید و چیدمان‌ها را نگه می‌دارید. قیمت زنده و گذشته، اندیکاتور، بازپخش و چند پنجره در یک صفحه هستند.",
            "محصول همان نمودار است. فورج کارگزار نیست، پول مشتری را نگه نمی‌دارد و سفارش را به بازار نمی‌فرستد. پنل آزمایشی عدد تمرینی است، نه پول واقعی.",
          ],
        },
        {
          heading: "برای چه کسی است",
          paragraphs: [
            "فورج برای معامله‌گرانی است که یک میز روشن می‌خواهند: طلا، رمزارز، ارز، شاخص و نفت روی همان نمودارها، با ابزارهایی که سر جایشان می‌مانند.",
            "با ایمیل حساب بسازید، نام و کشور را تأیید کنید تا نمودار باز شود. همان حساب می‌تواند چیدمان را روی دستگاه دیگر برگرداند.",
          ],
        },
        {
          heading: "چه کار می‌توانید بکنید",
          paragraphs: [
            "نمودار شمعی، رسم و اندیکاتور. میز را به چند پنجره تقسیم کنید. یک جلسه را کندل به کندل بازپخش کنید. زبان رابط را بین انگلیسی و فارسی عوض کنید. نوار قیمت صفحه ورود، رقم زنده بازار و تغییر امروز است.",
            "ورود، رسم‌ها و چیدمان با حساب شما می‌ماند. بازیابی رمز هنوز نیست، پس رمزی که انتخاب کرده‌اید را نگه دارید.",
          ],
        },
      ],
    },
    terms: {
      title: "قوانین",
      lede: "این قوانین استفاده از فورج چارت در forgechart.ir را پوشش می‌دهد. با ساخت حساب یا ورود، آن‌ها را می‌پذیرید.",
      updated: "به‌روزرسانی ۱۴ نوامبر ۲۰۲۶",
      back: "بازگشت به ورود",
      sections: [
        {
          heading: "خدمت",
          paragraphs: [
            "فورج نمودار، رسم، اندیکاتور، بازپخش، چیدمان ذخیره‌شده و پنل معامله آزمایشی می‌دهد. قیمت‌ها از خوراک‌هایی می‌آیند که میز را تغذیه می‌کنند. ممکن است مکث، گپ یا تفاوت با قیمت کارگزار دیگر داشته باشند.",
            "فورج ابزار نمودار است. کارگزار، صرافی یا مشاور سرمایه‌گذاری نیست. هیچ چیز روی نمودار توصیه خرید یا فروش نیست.",
          ],
        },
        {
          heading: "حساب شما",
          paragraphs: [
            "با ایمیل و رمزی که خودتان انتخاب می‌کنید وارد می‌شوید، یا با گوگل وقتی این گزینه برای سایت روشن باشد. رمز را خصوصی نگه دارید. بازیابی رمز هنوز آماده نیست.",
            "پیش از باز شدن نمودار، نام و کشور را تأیید می‌کنید و این قوانین و هشدار ریسک را می‌پذیرید. اطلاعاتی که می‌فرستید باید متعلق به خودتان و درست باشد.",
            "حساب برای شماست. آن را به اشتراک نگذارید و به‌جای شخص دیگری نمودار را باز نکنید.",
          ],
        },
        {
          heading: "ریسک",
          paragraphs: [
            "معامله در بازار واقعی می‌تواند به از دست رفتن پول منجر شود. اندیکاتور، رسم و قیمت گذشته آینده را پیش‌بینی نمی‌کند. تصمیم با شماست.",
            "موجودی آزمایشی، سفارش تمرینی و سود شبیه‌سازی‌شده پول نقد نیست و قابل برداشت نیست.",
          ],
        },
        {
          heading: "استفاده مجاز",
          paragraphs: [
            "به سایت حمله نکنید، برای دسترسی‌ای که به شما داده نشده کاوش نکنید، خوراک قیمت را بیش از حد بار نکنید و از حساب شخص دیگر سوءاستفاده نکنید. حسابی که این کار را بکند بسته می‌شود.",
            "ممکن است این قوانین را به‌روز کنیم. تاریخ این صفحه نسخه معتبر است. ادامه استفاده از فورج پس از به‌روزرسانی یعنی قوانین جدید را می‌پذیرید.",
          ],
        },
      ],
    },
    privacy: {
      title: "حریم خصوصی",
      lede: "این صفحه می‌گوید فورج چه چیزی را نگه می‌دارد تا نمودار و حساب دوباره باز شود، و با آن اطلاعات چه نمی‌کند.",
      updated: "به‌روزرسانی ۱۴ نوامبر ۲۰۲۶",
      back: "بازگشت به ورود",
      sections: [
        {
          heading: "چه چیزی ذخیره می‌شود",
          paragraphs: [
            "ایمیل، نام نمایشی و درهم‌ساز رمز. خود رمز به صورت متن ساده نگه داشته نمی‌شود. اگر «مرا به خاطر بسپار» را بزنید، فقط ایمیل ذخیره می‌شود، نه رمز.",
            "مرحله ایمنی نام و کشوری را که می‌فرستید نگه می‌دارد تا حساب مجاز شود. حساب‌های قدیمی‌تر ممکن است شماره تلفن و کد ملی از فرم قبلی داشته باشند.",
            "چیدمان نمودار، رسم‌ها، اندیکاتورها، دیده‌بان و تنظیمات نمایش با حساب می‌ماند تا میز دفعه بعد همین شکل را داشته باشد.",
          ],
        },
        {
          heading: "کجا می‌ماند",
          paragraphs: [
            "حساب و نمودار در همین مرورگر ذخیره می‌شود. یک کلید همگام‌سازی که از ورود شما ساخته می‌شود می‌تواند میز را به حساب ابری ببرد تا دستگاه دیگر آن را باز کند. رمز به عنوان رمز ذخیره‌شده فرستاده نمی‌شود.",
            "خروج، نشست را در همین مرورگر پاک می‌کند. پاک کردن داده‌های ذخیره‌شده سایت، نسخه محلی حساب را برمی‌دارد.",
          ],
        },
        {
          heading: "گوگل و داده بازار",
          paragraphs: [
            "اگر با «Continue with Google» وارد شوید، فورج ایمیل و نامی را می‌گیرد که گوگل برای آن ورود تأیید می‌کند. فورج رمز گوگل شما را نمی‌گیرد.",
            "باز کردن نمودار از خوراک قیمت پشت فورج قیمت می‌خواهد. آن درخواست نماد و بازه زمانی را مشخص می‌کند، نه رمز شما را.",
          ],
        },
        {
          heading: "چه کاری نمی‌کنیم",
          paragraphs: [
            "جزئیات حساب را نمی‌فروشیم. از آن برای پروفایل تبلیغاتی استفاده نمی‌کنیم. دسترسی به جزئیات ایمنی محدود به حساب واردشده است.",
          ],
        },
      ],
    },
    help: {
      title: "راهنما",
      lede: "پاسخ کوتاه برای ورود، ساخت حساب و باز کردن نمودار.",
      updated: "به‌روزرسانی ۱۴ نوامبر ۲۰۲۶",
      back: "بازگشت به ورود",
      sections: [
        {
          heading: "ساخت حساب",
          paragraphs: [
            "در صفحه ورود «تازه‌وارد فورج هستید» و سپس ساخت حساب را بزنید. نام، ایمیل و رمز حداقل ۶ نویسه را وارد کنید و رمز را دوباره بنویسید. بعد در مرحله ایمنی نام و کشور را کامل کنید و قوانین و هشدار ریسک را بپذیرید. نمودار بعد از آن باز می‌شود.",
          ],
        },
        {
          heading: "ورود",
          paragraphs: [
            "ایمیل و رمز همین حساب را به کار ببرید. «مرا به خاطر بسپار» فقط ایمیل را روی همین مرورگر نگه می‌دارد. ادامه با گوگل وقتی ورود گوگل برای forgechart.ir روشن باشد در دسترس است.",
            "فراموشی رمز هنوز آماده نیست. از رمزی استفاده کنید که هنگام ساخت حساب گذاشتید.",
          ],
        },
        {
          heading: "زبان و نوار قیمت",
          paragraphs: [
            "EN و FA روی کارت زبان را عوض می‌کند. کارت در هر دو زبان سمت راست می‌ماند. قیمت‌های متحرک پایین، رقم زنده بازار و درصد تغییر امروز هستند. ▲ سبز یعنی بالا. ▼ قرمز یعنی پایین.",
          ],
        },
        {
          heading: "اگر نمودار باز نشد",
          paragraphs: [
            "صفحه را یک‌بار از نو بارگذاری سخت کنید. اگر تازه حساب ساخته‌اید، مرحله ایمنی را تمام کنید. اگر هنوز وارد نمی‌شوید، همان ایمیل و رمزی را بزنید که انتخاب کردید. سفارش آزمایشی عدد تمرینی است، نه پول واقعی.",
          ],
        },
      ],
    },
  },
};

function brandSrc(file: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${root}brand/${file}`;
}

export function LoginInfoPage({
  page,
  lang,
  home,
  onBack,
  onOpen,
  labels,
}: {
  readonly page: InfoPageId;
  readonly lang: Lang;
  readonly home: string;
  readonly onBack: () => void;
  readonly onOpen: (page: InfoPageId) => void;
  readonly labels: readonly { id: InfoPageId; label: string }[];
}) {
  const copy = PAGES[lang][page];
  const fa = lang === "fa";
  return (
    <Box dir={fa ? "rtl" : "ltr"} sx={{
      position: "fixed",
      inset: 0,
      overflow: "auto",
      bgcolor: "#050403",
      color: "#f4f0ea",
      fontFamily: '"Segoe UI", Tahoma, "Helvetica Neue", Arial, sans-serif',
    }}>
      <Box component="img" src={brandSrc("forge-background-hi.webp")} alt="" sx={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        objectPosition: "left center",
        opacity: 0.28,
        pointerEvents: "none",
      }} />
      <Box sx={{ position: "relative", zIndex: 1, maxWidth: 760, mx: "auto", px: { xs: 2, sm: 3 }, py: 3 }}>
        <Box dir="ltr" sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2.5 }}>
          <Box component="a" href={home} aria-label="Forge" sx={{ display: "flex", lineHeight: 0 }}>
            <Box component="img" src={brandSrc("forge-f.png")} alt="" sx={{ height: 42, width: "auto" }} />
          </Box>
          <Box component="button" type="button" onClick={onBack} sx={{
            border: "1px solid rgba(224,176,90,0.45)",
            bgcolor: "rgba(8,7,6,0.72)",
            color: "#f0c36a",
            borderRadius: 999,
            px: 1.6,
            py: 0.7,
            font: "inherit",
            fontSize: 13,
            cursor: "pointer",
          }}>{copy.back}</Box>
        </Box>
        <Box sx={{
          border: "1px solid rgba(214,170,90,0.4)",
          borderRadius: "22px",
          bgcolor: "rgba(8,7,6,0.88)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
          px: { xs: 2.2, sm: 3.2 },
          py: { xs: 2.4, sm: 3.2 },
        }}>
          <Box sx={{ fontSize: 28, fontWeight: 750, letterSpacing: fa ? 0 : "-0.02em" }}>{copy.title}</Box>
          <Box sx={{ mt: 1.2, color: "#e7d7b8", fontSize: 16, lineHeight: 1.55 }}>{copy.lede}</Box>
          <Box sx={{ mt: 0.8, color: "#a3988c", fontSize: 12 }}>{copy.updated}</Box>
          {copy.sections.map((section) => (
            <Box key={section.heading} sx={{ mt: 2.6 }}>
              <Box sx={{ color: "#f0c36a", fontWeight: 700, fontSize: 16 }}>{section.heading}</Box>
              {section.paragraphs.map((paragraph) => (
                <Box key={paragraph.slice(0, 24)} sx={{ mt: 1, color: "#f4f0ea", fontSize: 15, lineHeight: 1.65 }}>{paragraph}</Box>
              ))}
            </Box>
          ))}
        </Box>
        <Box dir="ltr" sx={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 1.5, mt: 2.5, mb: 2, fontSize: 13 }}>
          {labels.map((item, index) => (
            <Box key={item.id} sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              {index ? <Box sx={{ opacity: 0.45 }}>|</Box> : null}
              <Box component="button" type="button" onClick={() => onOpen(item.id)} sx={{
                p: 0,
                border: "none",
                bgcolor: "transparent",
                color: item.id === page ? "#f0c36a" : "#d5cfc6",
                font: "inherit",
                fontSize: "inherit",
                fontWeight: item.id === page ? 700 : 500,
                cursor: "pointer",
              }}>{item.label}</Box>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
