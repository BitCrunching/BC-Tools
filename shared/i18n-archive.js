/* Archived i18n system — pulled off the live site on request ("remove
   all the language code along with EN and G7 too... the language btn
   also remove from active code, leave it aside"). Nothing was deleted
   for good: everything the site's translation system used to be is
   captured here — the translation dictionaries (all four languages:
   en, cs, pl, g7), the JS logic that drove them, and the nav-lang
   button/menu markup + CSS — so it can be restored without redoing the
   work, if the site ever wants multi-language support again.

   This file is NOT loaded by any page — it's inert until someone wires
   it back in on purpose.

   History: cs/pl were removed first (in a separate pass), archived at
   shared/i18n-archive-cs-pl.js. This file supersedes that one — it adds
   the en/g7 dictionaries and the actual JS/HTML/CSS that made the whole
   system work, consolidating everything into one place. Delete
   shared/i18n-archive-cs-pl.js once this file is confirmed to have
   everything (it does — see SITE_JS_I18N_ARCHIVE.en/cs/pl and
   INDEX_HTML_I18N_ARCHIVE.en/cs/pl/g7 below).

   ===== TO RE-ENABLE =====
   1. In shared/site.js, restore the `translations` const from
      SITE_JS_I18N_ARCHIVE (en/cs/pl), restore `let currentLang = "en";`,
      and restore `applyLanguage(lang)` — see APPLY_LANGUAGE_SITE_JS
      below for its exact source. Re-thread every literal string this
      cleanup inlined (nav terminal confirmations in the theme-toggle
      and share-copy handlers, the cookie-consent banner's statusText/
      renderActionButton) back into `dict[key] || fallback` lookups.
      Restore the "LANGUAGE SWITCHER" IIFE (LANGUAGE_SWITCHER_SITE_JS
      below) and the two `document.addEventListener("bc:langchange",
      ...)` listeners this cleanup removed (cookie-consent's
      renderStatuses in site.js, plus cleanly-tool.js's renderList and
      context-tool.js's color-trigger-label resync — see git history
      for their exact removed blocks if needed, they were straightforward
      re-adds of what's already in those files' surrounding code).
   2. In index.html, do the same: restore `translations` from
      INDEX_HTML_I18N_ARCHIVE (en/cs/pl/g7), `let currentLang`,
      `applyLanguage`, `checkTranslationCompleteness()` (+ its call),
      and the language-switcher IIFE — see APPLY_LANGUAGE_INDEX_HTML /
      LANGUAGE_SWITCHER_INDEX_HTML below.
   3. Re-add `data-i18n`/`data-i18n-label`/`data-i18n-cell-label`/
      `data-i18n-placeholder` attributes to markup. This cleanup removed
      ~1,282 of these across all 32 pages — they decorated elements that
      already carry the correct static English text, so re-adding them
      is mechanical (the attribute value is the translation key that
      matches the element's own existing English content — cross-check
      against SITE_JS_I18N_ARCHIVE.en / INDEX_HTML_I18N_ARCHIVE.en's own
      keys) rather than something to reconstruct from scratch.
   4. Re-add the nav-lang-wrap markup (NAV_LANG_MARKUP below) right
      before the theme-toggle button in every page's `.nav-right` — and
      the two extra language buttons cs/pl lost even earlier:
        <button type="button" data-lang="cs">Čeština</button>
        <button type="button" data-lang="pl">Polski</button>
      (see shared/i18n-archive-cs-pl.js's own re-enable notes for these
      two specifically, if that file still exists).
   5. Re-add the `.nav-lang-wrap`/`.nav-lang-btn`/`.nav-lang-menu` CSS
      (NAV_LANG_CSS below) to shared/site.css and to index.html's own
      inline `<style>` (both need it — the SPA doesn't load
      shared/site.css).
   6. Bump shared/site.js's and shared/site.css's own `?v=`, and every
      page's `<script src=".../shared/site.js?v=N">` /
      `<link href=".../shared/site.css?v=N">` reference to match (see
      CLAUDE.md's cache-busting rule) — both changed, so all ~32 pages
      that reference them need the bump.
   7. Delete this file once steps 1-6 are done and confirmed working
      live (both themes) — it's a holding pen, not meant to be a
      permanent parallel copy of the real system. */

const SITE_JS_I18N_ARCHIVE = {
  en: {
    nav_lang: "Change language",
    nav_theme: "Toggle light and dark mode",
    nav_share: "Share",
    nav_back: "Back to Creative Hub",
    nav_terminal_dark: "Dark mode set",
    nav_terminal_light: "Light mode set",
    nav_terminal_lang: "Language set to {lang}",
    share_copy: "Copy link / URL",
    share_copied: "URL copied to clipboard",
    share_more: "More options",
    share_email: "Email",
    footer_company_heading: "Serious matters",
    footer_getting_started_heading: "Getting started with",
    footer_contact_heading: "Get in touch with us",
    footer_contact_email: "<a href=\"mailto:contact@bitcrunching.com\">contact@bitcrunching.com</a>",
    footer_contact_discord: "<a href=\"https://discord.gg/FqKdCc99t\" target=\"_blank\" rel=\"noopener\">Join our discord</a>",
    nav_about: "Our Universe",
    nav_about_title: "About Us",
    nav_faq: "Already Answered",
    nav_faq_title: "FAQ",
    mp_footer_terms: "Galactic Handbook",
    mp_footer_terms_title: "Terms of Use",
    mp_footer_privacy: "Alien Privacy Protocol",
    mp_footer_privacy_title: "Privacy Policy",
    mp_footer_cookies: "Cookie Registry",
    mp_footer_cookies_title: "Cookie Policy",
    cookie_banner_text: "We use cookies. Choose which categories to allow below — see our <a data-goto=\"cookies\">Cookie Registry</a> for details.",
    cookie_banner_text_docked: "Choose which cookies to allow",
    cookie_banner_text_mobile: "Choose which cookies to allow",
    cookie_cat_necessary: "Necessary (always on)",
    cookie_cat_necessary_detail: "These keep the essentials working — remembering your cookie choice, your language, and your light/dark theme. They can't be turned off, and like everything else on this site, they never leave your device.",
    cookie_cat_analytics: "Analytics (Google Analytics)",
    cookie_cat_analytics_detail: "Lets us see how many people visit and which tools get used, via Google Analytics. This never includes your files or their contents — those never leave your browser, regardless of this setting.",
    cookie_cat_advertising: "Advertising (Google AdSense)",
    cookie_cat_advertising_detail: "Used by Google AdSense to show ads. Currently switched off site-wide while we wait on AdSense approval, so this toggle has no effect yet.",
    cookie_status_allowed: "...allowed",
    cookie_status_disabled: "...disabled",
    cookie_banner_accept_all: "Accept All",
    cookie_banner_disable_all: "Disable all",
    cookie_banner_save: "Confirm choices",
    cookie_banner_saved: "> preferences_saved",
    ck_settings_btn: "DEV_TOOLS_COOKIES:",
    privacy_check_ok: "download local & private",
    convert_check_ok: "convert local & private",
    privacy_check_warn: "ATTENTION! - ({count}) privacy breach during {action} - {host}",
    privacy_check_action_convert: "convert",
    privacy_check_action_download: "download"
  },
  cs: {
    nav_lang: "Změnit jazyk",
    nav_theme: "Přepnout světlý a tmavý režim",
    nav_share: "Sdílet",
    nav_back: "Zpět na Creative Hub",
    nav_terminal_dark: "Tmavý režim zapnut",
    nav_terminal_light: "Světlý režim zapnut",
    nav_terminal_lang: "Jazyk nastaven na {lang}",
    share_copy: "Kopírovat odkaz",
    share_copied: "Odkaz zkopírován",
    share_more: "Další možnosti",
    share_email: "E-mail",
    footer_company_heading: "Vážné záležitosti",
    footer_getting_started_heading: "Začínáme s",
    footer_contact_heading: "Ozvěte se nám",
    footer_contact_email: "<a href=\"mailto:contact@bitcrunching.com\">contact@bitcrunching.com</a>",
    footer_contact_discord: "<a href=\"https://discord.gg/FqKdCc99t\" target=\"_blank\" rel=\"noopener\">Připojte se k našemu discordu</a>",
    nav_about: "Náš vesmír",
    nav_about_title: "O nás",
    nav_faq: "Máme odpovědi",
    nav_faq_title: "FAQ",
    mp_footer_terms: "Galaktická příručka",
    mp_footer_terms_title: "Podmínky použití",
    mp_footer_privacy: "Mimozemský protokol soukromí",
    mp_footer_privacy_title: "Zásady ochrany osobních údajů",
    mp_footer_cookies: "Registr cookies",
    mp_footer_cookies_title: "Zásady používání cookies",
    cookie_banner_text: "Používáme cookies. Níže si můžete vybrat, které kategorie povolíte — podrobnosti najdete v našem <a data-goto=\"cookies\">Registru cookies</a>.",
    cookie_banner_text_docked: "Vyberte, které cookies povolit",
    cookie_banner_text_mobile: "Vyberte, které cookies povolit",
    cookie_cat_necessary: "Nezbytné (vždy zapnuto)",
    cookie_cat_necessary_detail: "These keep the essentials working — remembering your cookie choice, your language, and your light/dark theme. They can't be turned off, and like everything else on this site, they never leave your device.",
    cookie_cat_analytics: "Analytické (Google Analytics)",
    cookie_cat_analytics_detail: "Lets us see how many people visit and which tools get used, via Google Analytics. This never includes your files or their contents — those never leave your browser, regardless of this setting.",
    cookie_cat_advertising: "Reklamní (Google AdSense)",
    cookie_cat_advertising_detail: "Used by Google AdSense to show ads. Currently switched off site-wide while we wait on AdSense approval, so this toggle has no effect yet.",
    cookie_status_allowed: "...povoleno",
    cookie_status_disabled: "...zakázáno",
    cookie_banner_accept_all: "Přijmout vše",
    cookie_banner_disable_all: "Zakázat vše",
    cookie_banner_save: "Potvrdit volby",
    cookie_banner_saved: "> předvolby_uloženy",
    ck_settings_btn: "DEV_TOOLS_COOKIES:",
    privacy_check_ok: "stažení lokální a soukromé",
    convert_check_ok: "konverze lokální a soukromá",
    privacy_check_warn: "POZOR! - ({count}) narušení soukromí během akce {action} - {host}",
    privacy_check_action_convert: "konverze",
    privacy_check_action_download: "stažení"
  },
  pl: {
    nav_lang: "Zmień język",
    nav_theme: "Przełącz tryb jasny i ciemny",
    nav_share: "Udostępnij",
    nav_back: "Powrót do Creative Hub",
    nav_terminal_dark: "Tryb ciemny włączony",
    nav_terminal_light: "Tryb jasny włączony",
    nav_terminal_lang: "Ustawiono język: {lang}",
    share_copy: "Kopiuj link",
    share_copied: "Link skopiowany",
    share_more: "Więcej opcji",
    share_email: "E-mail",
    footer_company_heading: "Poważne sprawy",
    footer_getting_started_heading: "Pierwsze kroki z",
    footer_contact_heading: "Skontaktuj się z nami",
    footer_contact_email: "<a href=\"mailto:contact@bitcrunching.com\">contact@bitcrunching.com</a>",
    footer_contact_discord: "<a href=\"https://discord.gg/FqKdCc99t\" target=\"_blank\" rel=\"noopener\">Dołącz do naszego discorda</a>",
    nav_about: "Nasz wszechświat",
    nav_about_title: "O nas",
    nav_faq: "Mamy odpowiedzi",
    nav_faq_title: "FAQ",
    mp_footer_terms: "Galaktyczny podręcznik",
    mp_footer_terms_title: "Warunki użytkowania",
    mp_footer_privacy: "Kosmiczny protokół prywatności",
    mp_footer_privacy_title: "Polityka prywatności",
    mp_footer_cookies: "Rejestr plików cookie",
    mp_footer_cookies_title: "Polityka plików cookie",
    cookie_banner_text: "Używamy plików cookie. Poniżej możesz wybrać, które kategorie zezwolić — szczegóły znajdziesz w naszym <a data-goto=\"cookies\">Rejestrze plików cookie</a>.",
    cookie_banner_text_docked: "Wybierz, które pliki cookie zezwolić",
    cookie_banner_text_mobile: "Wybierz, które pliki cookie zezwolić",
    cookie_cat_necessary: "Niezbędne (zawsze włączone)",
    cookie_cat_necessary_detail: "These keep the essentials working — remembering your cookie choice, your language, and your light/dark theme. They can't be turned off, and like everything else on this site, they never leave your device.",
    cookie_cat_analytics: "Analityczne (Google Analytics)",
    cookie_cat_analytics_detail: "Lets us see how many people visit and which tools get used, via Google Analytics. This never includes your files or their contents — those never leave your browser, regardless of this setting.",
    cookie_cat_advertising: "Reklamowe (Google AdSense)",
    cookie_cat_advertising_detail: "Used by Google AdSense to show ads. Currently switched off site-wide while we wait on AdSense approval, so this toggle has no effect yet.",
    cookie_status_allowed: "...dozwolone",
    cookie_status_disabled: "...wyłączone",
    cookie_banner_accept_all: "Zaakceptuj wszystkie",
    cookie_banner_disable_all: "Wyłącz wszystkie",
    cookie_banner_save: "Potwierdź wybór",
    cookie_banner_saved: "> preferencje_zapisane",
    ck_settings_btn: "DEV_TOOLS_COOKIES:",
    privacy_check_ok: "pobieranie lokalne i prywatne",
    convert_check_ok: "konwersja lokalna i prywatna",
    privacy_check_warn: "UWAGA! - ({count}) naruszenie prywatności podczas {action} - {host}",
    privacy_check_action_convert: "konwersji",
    privacy_check_action_download: "pobierania"
  }
};

const INDEX_HTML_I18N_ARCHIVE = {
  en: {
    footer_contact_heading: "Get in touch with us",
    footer_contact_email: "<a href=\"mailto:contact@bitcrunching.com\">contact@bitcrunching.com</a>",
    footer_contact_discord: "<a href=\"https://discord.gg/FqKdCc99t\" target=\"_blank\" rel=\"noopener\">Join our discord</a>",
    footer_contact_address: "Contactweg 129<br>1014BJ Amsterdam<br>Netherlands",
    cookie_banner_text: "We use cookies. Choose which categories to allow below — see our <a data-goto=\"cookies\">Cookie Registry</a> for details.",
    cookie_banner_text_docked: "Choose which cookies to allow",
    cookie_banner_text_mobile: "Choose which cookies to allow",
    cookie_cat_necessary: "Necessary (always on)",
    cookie_cat_analytics: "Analytics (Google Analytics)",
    cookie_cat_advertising: "Advertising (Google AdSense)",
    cookie_cat_necessary_detail: "These keep the essentials working — remembering your cookie choice, your language, and your light/dark theme. They can't be turned off, and like everything else on this site, they never leave your device.",
    cookie_cat_analytics_detail: "Lets us see how many people visit and which tools get used, via Google Analytics. This never includes your files or their contents — those never leave your browser, regardless of this setting.",
    cookie_cat_advertising_detail: "Used by Google AdSense to show ads. Currently switched off site-wide while we wait on AdSense approval, so this toggle has no effect yet.",
    cookie_status_allowed: "...allowed",
    cookie_status_disabled: "...disabled",
    cookie_banner_accept_all: "Accept All",
    cookie_banner_disable_all: "Disable all",
    cookie_banner_save: "Confirm choices",
    cookie_banner_saved: "> preferences_saved",
    ck_settings_btn: "DEV_TOOLS_COOKIES:",
    footer_company_heading: "Serious matters",
    footer_getting_started_heading: "Getting started with",
    mp_footer_cookies: "Cookie Registry",
    mp_footer_cookies_title: "Cookie Policy",
    mp_footer_privacy: "Alien Privacy Protocol",
    mp_footer_privacy_title: "Privacy Policy",
    page_title: "BC Tools – Free Image, Video, Audio & Code Tools",
    nav_lang: "Change language",
    nav_theme: "Toggle light and dark mode",
    nav_share: "Share",
    nav_about: "Our Universe",
    nav_about_title: "About Us",
    nav_faq: "Already Answered",
    nav_faq_title: "FAQ",
    share_copy: "Copy link / URL",
    share_copied: "URL copied to clipboard",
    share_more: "More options",
    nav_terminal_dark: "Dark mode set",
    nav_terminal_light: "Light mode set",
    nav_terminal_lang: "Language set to {lang}",
    share_email: "Email",
    mp_hero_title: "Setting a new standard for creators!",
    engine_status_title: "BC-TOOLS_CLASSIFIED_MEMORY: LEAKED",
    engine_status_row1: "&gt; Browser data extraction: <span class=\"engine-status-error\">ERROR...</span> <span class=\"engine-status-value\">no data leaks</span>",
    engine_status_row2: "&gt; Server upload: <span class=\"engine-status-error\">ERROR...</span> <span class=\"engine-status-value\">no server found</span>",
    engine_status_row3: "&gt; User tracking: <span class=\"engine-status-error\">ERROR...</span> <span class=\"engine-status-value\">cookies restrictions</span>",
    engine_status_row4: "&gt; Intrusive ad placement: <span class=\"engine-status-error\">ERROR...</span> <span class=\"engine-status-value\">clean-ad environment enforced</span>",
    loading_tools_row1: "&gt; Loading other tools... <span class=\"engine-status-error\">no tools found (<span class=\"engine-status-eye\" id=\"loadingToolsEyeL\">•</span>_<span class=\"engine-status-eye\" id=\"loadingToolsEyeR\">•</span>;)</span>",
    loading_tools_row2: "&gt; Preparing tools",
    next_tools_preview_text: "We are developing multiple new tools as we speak. Only those that survive our harsh cosmic testing are cleared for human use.<br><br>You can see the cosmos as we speak on the right. Look, there is a comet flying by! Capture it before it's gone and get our certificate of authenticity.",
    mp_colors_heading: "The importance of colors...",
    mp_colors_p3: "After studying creative signals across different worlds, we found that lifeless interfaces and grey rectangles were causing a serious decrease in inspiration levels. The solution was obvious: more color brings more creativity.",
    mp_colors_p4: "The Creative Hub is the birthplace of vibrant tools that help focus all the creativity in a way that feels unpredictable, energetic, and constantly evolving.",
    mp_colors_p5: "These colors are not just decoration. They are at the centre of all creative energy — a visual language designed to make every tool feel alive, easier to recognize, and every creation feel like a journey.",
    mp_colors_p6: "As the Creative Hub expands, so will its spectrum. New tools will bring new colors and new energy signatures from across the creative universe.",
    mp_colors_p7: "Our developer claims the colors were carefully crafted using advanced digital color strains from his home planet, Bonbonia<span class=\"bonbonia-candy\" aria-hidden=\"true\">🍬</span>.",
    mp_colors_p8: "We have not been able to verify this claim, but we sure did get hungry.",
    mp_hero_p1: "Welcome to Creative Hub — a place where creativity travels faster than the speed of light.",
    mp_hero_p1b: "A growing collection of fast, private, browser-based tools for images, video, audio, and code.",
    mp_hero_p1_mobile: "Creative Hub — a growing collection of browser-based tools for images, video, audio, and code.",
    mp_hero_p3: "Our tools are built to be the fastest, simplest, and accessible from anywhere in the universe.",
    mp_hero_p4: "...wait our systems detected an unauthorized memory leak from the BC Tools internal storage that you probably shouldn't read.",
    mp_cards_heading: "Start with Creative Hub:",
    mp_card_convert_desc: "Convert images between JPG, PNG, WEBP, and PDF. You can also upload HEIC/HEIF!",
    mp_card_compress_desc: "Reduce image size while keeping quality.",
    mp_card_combine_desc: "Merge multiple PDF files into a single document in any order you like.",
    mp_card_exif_desc: "Remove hidden metadata like GPS location, camera model, or editor data in SVGs — before sharing.",
    mp_card_context_desc: "Add your own text directly onto a PDF — captions, notes, signatures.",
    mp_card_readmore: "Read more",
    mp_footer_terms: "Galactic Handbook",
    mp_footer_terms_title: "Terms of Use"
  },
  cs: {
    footer_contact_heading: "Ozvěte se nám",
    footer_contact_email: "<a href=\"mailto:contact@bitcrunching.com\">contact@bitcrunching.com</a>",
    footer_contact_discord: "<a href=\"https://discord.gg/FqKdCc99t\" target=\"_blank\" rel=\"noopener\">Připojte se k našemu discordu</a>",
    footer_contact_address: "Contactweg 129<br>1014BJ Amsterdam<br>Nizozemsko",
    cookie_banner_text: "Používáme cookies. Níže si můžete vybrat, které kategorie povolíte — podrobnosti najdete v našem <a data-goto=\"cookies\">Registru cookies</a>.",
    cookie_cat_necessary: "Nezbytné (vždy zapnuto)",
    cookie_cat_analytics: "Analytické (Google Analytics)",
    cookie_cat_advertising: "Reklamní (Google AdSense)",
    cookie_banner_accept_all: "Přijmout vše",
    cookie_banner_save: "Potvrdit volby",
    ck_settings_btn: "DEV_TOOLS_COOKIES:",
    cookie_banner_text_docked: "Vyberte, které cookies povolit",
    cookie_banner_text_mobile: "Vyberte, které cookies povolit",
    cookie_status_allowed: "...povoleno",
    cookie_status_disabled: "...zakázáno",
    cookie_banner_disable_all: "Zakázat vše",
    cookie_banner_saved: "> předvolby_uloženy",
    footer_company_heading: "Vážné záležitosti",
    footer_getting_started_heading: "Začínáme s",
    mp_footer_cookies: "Registr cookies",
    mp_footer_cookies_title: "Zásady používání cookies",
    mp_footer_privacy: "Mimozemský protokol soukromí",
    mp_footer_privacy_title: "Zásady ochrany osobních údajů",
    page_title: "BC Tools – Nástroje pro obrázky zdarma",
    nav_lang: "Změnit jazyk",
    nav_theme: "Přepnout světlý a tmavý režim",
    nav_share: "Sdílet",
    nav_about: "Náš vesmír",
    nav_about_title: "O nás",
    nav_faq: "Máme odpovědi",
    nav_faq_title: "FAQ",
    share_copy: "Kopírovat odkaz",
    share_copied: "Odkaz zkopírován",
    share_more: "Další možnosti",
    nav_terminal_dark: "Tmavý režim zapnut",
    nav_terminal_light: "Světlý režim zapnut",
    nav_terminal_lang: "Jazyk nastaven na {lang}",
    share_email: "E-mail",
    mp_hero_title: "Nastavujeme nový standard pro tvůrce!",
    engine_status_title: "BC-TOOLS_TAJNÁ_MEZIPAMĚŤ: UNIKLA",
    engine_status_row1: "&gt; Extrakce dat z prohlížeče: <span class=\"engine-status-error\">CHYBA...</span> <span class=\"engine-status-value\">žádný únik dat</span>",
    engine_status_row2: "&gt; Nahrání na server: <span class=\"engine-status-error\">CHYBA...</span> <span class=\"engine-status-value\">server nenalezen</span>",
    engine_status_row3: "&gt; Sledování uživatele: <span class=\"engine-status-error\">CHYBA...</span> <span class=\"engine-status-value\">omezení cookies</span>",
    engine_status_row4: "&gt; Rušivá reklama: <span class=\"engine-status-error\">CHYBA...</span> <span class=\"engine-status-value\">vynuceno prostředí bez reklam</span>",
    loading_tools_row1: "&gt; Načítání dalších nástrojů... <span class=\"engine-status-error\">nenalezeny žádné nástroje (<span class=\"engine-status-eye\" id=\"loadingToolsEyeL\">•</span>_<span class=\"engine-status-eye\" id=\"loadingToolsEyeR\">•</span>;)</span>",
    loading_tools_row2: "&gt; Připravujeme nástroje",
    next_tools_preview_text: "Vyvíjíme více nových nástrojů zároveň. Pro lidské použití jsou schváleny pouze ty, které přežijí naše drsné kosmické testování.",
    mp_colors_heading: "Využívání síly Slunce...",
    mp_colors_p3: "Po studiu kreativních signálů napříč různými světy jsme zjistili, že neživá rozhraní způsobují vážný pokles úrovně inspirace. Řešení bylo jasné — více barev, více energie a méně šedých obdélníků, které předstírají, že lidem pomáhají tvořit.",
    mp_colors_p4: "Creative Hub byl navržen s živými barvami, které odrážejí to, jak se nápady skutečně objevují: nepředvídatelně, energicky a v neustálém vývoji.",
    mp_colors_p5: "Tyto barvy nejsou jen dekorace. Jsou to signály z kreativního vesmíru — vizuální jazyk navržený tak, aby každý nástroj působil živě a každé dílo jako výprava.",
    mp_colors_p6: "Jak se BC Tools bude rozšiřovat, přidají se do kolekce nové barvy a nové objevy.",
    mp_colors_p7: "Náš vývojář tvrdí, že barvy byly pečlivě vytvořeny pomocí pokročilých digitálních barevných kmenů z jeho domovské planety Bonbonia<span class=\"bonbonia-candy\" aria-hidden=\"true\">🍬</span>.",
    mp_colors_p8: "Tato tvrzení se nám nepodařilo ověřit, ale rozhodně nám z toho vyhládlo.",
    mp_hero_p1: "Vstupte do našeho světa... kde se kreativita pohybuje rychleji než rychlost světla. <span class=\"no-invert\">⚡</span>",
    mp_hero_p1b: "Právě teď: pět rychlých a soukromých nástrojů běžících přímo v prohlížeči pro práci s obrázky a PDF, další jsou na cestě.",
    mp_hero_p1_mobile: "Creative Hub — pět rychlých a soukromých nástrojů běžících v prohlížeči pro obrázky a PDF, další jsou na cestě.",
    mp_hero_p3: "Rychlé, jednoduché a dostupné odkudkoli ve vesmíru.",
    mp_hero_p4: "...počkat, naše systémy zaznamenaly neoprávněný únik paměti z interního úložiště BC Tools, který byste si asi neměli číst.",
    mp_cards_heading: "Začněte s Creative Hubem:",
    mp_card_convert_desc: "Převádějte obrázky mezi formáty JPG, PNG, WEBP a PDF. Nahrát můžete i HEIC/HEIF!",
    mp_card_compress_desc: "Komprimujte obrázky na libovolnou velikost bez viditelné ztráty kvality.",
    mp_card_combine_desc: "Kombinujte více PDF souborů do jednoho v libovolném pořadí.",
    mp_card_exif_desc: "Odstraňte skrytá metadata jako GPS polohu, model fotoaparátu nebo data editoru v SVG — před sdílením.",
    mp_card_context_desc: "Přidejte vlastní text přímo do PDF — popisky, poznámky, podpisy.",
    mp_card_readmore: "Přečíst více",
    mp_footer_terms: "Galaktická příručka",
    mp_footer_terms_title: "Podmínky použití"
  },
  pl: {
    footer_contact_heading: "Skontaktuj się z nami",
    footer_contact_email: "<a href=\"mailto:contact@bitcrunching.com\">contact@bitcrunching.com</a>",
    footer_contact_discord: "<a href=\"https://discord.gg/FqKdCc99t\" target=\"_blank\" rel=\"noopener\">Dołącz do naszego discorda</a>",
    footer_contact_address: "Contactweg 129<br>1014BJ Amsterdam<br>Holandia",
    cookie_banner_text: "Używamy plików cookie. Poniżej możesz wybrać, które kategorie zezwolić — szczegóły znajdziesz w naszym <a data-goto=\"cookies\">Rejestrze plików cookie</a>.",
    cookie_cat_necessary: "Niezbędne (zawsze włączone)",
    cookie_cat_analytics: "Analityczne (Google Analytics)",
    cookie_cat_advertising: "Reklamowe (Google AdSense)",
    cookie_banner_accept_all: "Zaakceptuj wszystkie",
    cookie_banner_save: "Potwierdź wybór",
    ck_settings_btn: "DEV_TOOLS_COOKIES:",
    cookie_banner_text_docked: "Wybierz, które pliki cookie zezwolić",
    cookie_banner_text_mobile: "Wybierz, które pliki cookie zezwolić",
    cookie_status_allowed: "...dozwolone",
    cookie_status_disabled: "...wyłączone",
    cookie_banner_disable_all: "Wyłącz wszystkie",
    cookie_banner_saved: "> preferencje_zapisane",
    footer_company_heading: "Poważne sprawy",
    footer_getting_started_heading: "Pierwsze kroki z",
    mp_footer_cookies: "Rejestr plików cookie",
    mp_footer_cookies_title: "Polityka plików cookie",
    mp_footer_privacy: "Kosmiczny protokół prywatności",
    mp_footer_privacy_title: "Polityka prywatności",
    page_title: "BC Tools – Darmowe narzędzia do obrazów",
    nav_lang: "Zmień język",
    nav_theme: "Przełącz tryb jasny i ciemny",
    nav_share: "Udostępnij",
    nav_about: "Nasz wszechświat",
    nav_about_title: "O nas",
    nav_faq: "Mamy odpowiedzi",
    nav_faq_title: "FAQ",
    share_copy: "Kopiuj link",
    share_copied: "Link skopiowany",
    share_more: "Więcej opcji",
    nav_terminal_dark: "Tryb ciemny włączony",
    nav_terminal_light: "Tryb jasny włączony",
    nav_terminal_lang: "Ustawiono język: {lang}",
    share_email: "E-mail",
    mp_hero_title: "Wyznaczamy nowy standard dla twórców!",
    engine_status_title: "BC-TOOLS_TAJNA_PAMIĘĆ: WYCIEKŁA",
    engine_status_row1: "&gt; Ekstrakcja danych z przeglądarki: <span class=\"engine-status-error\">BŁĄD...</span> <span class=\"engine-status-value\">brak wycieku danych</span>",
    engine_status_row2: "&gt; Przesyłanie na serwer: <span class=\"engine-status-error\">BŁĄD...</span> <span class=\"engine-status-value\">nie znaleziono serwera</span>",
    engine_status_row3: "&gt; Śledzenie użytkownika: <span class=\"engine-status-error\">BŁĄD...</span> <span class=\"engine-status-value\">ograniczenia plików cookie</span>",
    engine_status_row4: "&gt; Nachalne reklamy: <span class=\"engine-status-error\">BŁĄD...</span> <span class=\"engine-status-value\">wymuszone środowisko bez reklam</span>",
    loading_tools_row1: "&gt; Ładowanie innych narzędzi... <span class=\"engine-status-error\">nie znaleziono narzędzi (<span class=\"engine-status-eye\" id=\"loadingToolsEyeL\">•</span>_<span class=\"engine-status-eye\" id=\"loadingToolsEyeR\">•</span>;)</span>",
    loading_tools_row2: "&gt; Przygotowywanie narzędzi",
    next_tools_preview_text: "Pracujemy nad wieloma nowymi narzędziami jednocześnie. Do użytku przez ludzi dopuszczone są tylko te, które przetrwają nasze surowe testy kosmiczne.",
    mp_colors_heading: "Wykorzystując moc Słońca...",
    mp_colors_p3: "Po zbadaniu sygnałów kreatywnych w różnych światach odkryliśmy, że pozbawione życia interfejsy powodowały poważny spadek poziomu inspiracji. Rozwiązanie było jasne — więcej koloru, więcej energii i mniej szarych prostokątów udających, że pomagają ludziom tworzyć.",
    mp_colors_p4: "Creative Hub został zaprojektowany z żywymi kolorami odzwierciedlającymi to, jak pomysły naprawdę się pojawiają: nieprzewidywalnie, energicznie i w ciągłej ewolucji.",
    mp_colors_p5: "Te kolory to nie tylko dekoracja. To sygnały z kreatywnego wszechświata — wizualny język zaprojektowany tak, by każde narzędzie wydawało się żywe, a każde dzieło jak podróż.",
    mp_colors_p6: "W miarę rozwoju BC Tools do kolekcji dołączą nowe kolory i nowe odkrycia.",
    mp_colors_p7: "Nasz twórca twierdzi, że kolory zostały starannie wykonane przy użyciu zaawansowanych cyfrowych szczepów kolorów z jego rodzinnej planety Bonbonia<span class=\"bonbonia-candy\" aria-hidden=\"true\">🍬</span>.",
    mp_colors_p8: "Nie udało nam się zweryfikować tych twierdzeń, ale z pewnością zgłodnieliśmy.",
    mp_hero_p1: "Wejdź do naszego świata... gdzie kreatywność porusza się szybciej niż prędkość światła. <span class=\"no-invert\">⚡</span>",
    mp_hero_p1b: "Obecnie: pięć szybkich i prywatnych narzędzi działających w przeglądarce do pracy z obrazami i plikami PDF, kolejne w drodze.",
    mp_hero_p1_mobile: "Creative Hub — pięć szybkich i prywatnych narzędzi w przeglądarce do obrazów i PDF, kolejne w drodze.",
    mp_hero_p3: "Szybki, prosty i dostępny z dowolnego miejsca we wszechświecie.",
    mp_hero_p4: "...czekaj, nasze systemy wykryły nieautoryzowany wyciek pamięci z wewnętrznego magazynu BC Tools, którego prawdopodobnie nie powinieneś czytać.",
    mp_cards_heading: "Zacznij od Creative Hub:",
    mp_card_convert_desc: "Konwertuj obrazy między formatami JPG, PNG, WEBP i PDF. Możesz też przesłać HEIC/HEIF!",
    mp_card_compress_desc: "Zmniejsz rozmiar obrazu przy zachowaniu jakości.",
    mp_card_combine_desc: "Połącz wiele plików PDF w jeden dokument w dowolnej kolejności.",
    mp_card_exif_desc: "Usuń ukryte metadane, takie jak lokalizacja GPS, model aparatu czy dane edytora w plikach SVG — przed udostępnieniem.",
    mp_card_context_desc: "Dodaj własny tekst bezpośrednio do PDF-u — podpisy, notatki, sygnatury.",
    mp_card_readmore: "Czytaj więcej",
    mp_footer_terms: "Galaktyczny podręcznik",
    mp_footer_terms_title: "Warunki użytkowania"
  },
  g7: {
    footer_contact_heading: "Ghitk oix tkaeuukkh vvoitkkh uuzz",
    footer_contact_email: "<a href=\"mailto:contact@bitcrunching.com\">contact@bitcrunching.com</a>",
    footer_contact_discord: "<a href=\"https://discord.gg/FqKdCc99t\" target=\"_blank\" rel=\"noopener\">Zjaeoix aeuurr zhoizzkaerrzh</a>",
    footer_contact_address: "Contactweg 129<br>1014BJ Amsterdam<br>Netherlands",
    cookie_banner_text: "Vvi uuzzi kaeaeqoiizz. Kkhaeaezzi vvkhoikkh katkighaerroiizz tkae allllaevv villaevv — zzii aeuurr <a data-goto=\"cookies\">Kaeaeqoii Rrighoizztkrrei</a> phaerr zhitkaoillzz.",
    cookie_banner_text_docked: "Kkhaeaezzi vvkhoikkh kaeaeqoiizz tkae allllaevv",
    cookie_banner_text_mobile: "Kkhaeaezzi vvkhoikkh kaeaeqoiizz tkae allllaevv",
    cookie_cat_necessary: "Xikizzzzarrei (allvvaeizz aex)",
    cookie_cat_analytics: "Axalleitkoikzz (Ghaeaeghlli Axalleitkoikzz)",
    cookie_cat_advertising: "Azhwirrtkoizzoixgh (Ghaeaeghlli AzhZzixzzi)",
    cookie_status_allowed: "...allllaevvizh",
    cookie_status_disabled: "...zhoizzavllizh",
    cookie_banner_accept_all: "Akkipftk Allll",
    cookie_banner_disable_all: "Zhoizzavlli allll",
    cookie_banner_save: "Kaexphoirrnn kkhaeoikizz",
    cookie_banner_saved: "> pfrriphirrixkizz_zzawizh",
    ck_settings_btn: "DEV_TOOLS_COOKIES:",
    footer_company_heading: "Zzirroiaeuuzz nnatktkirrzz",
    footer_getting_started_heading: "Ghitktkoixgh zztkarrtkizh vvoitkkh",
    mp_footer_cookies: "Kaeaeqoii Rrighoizztkrrei",
    mp_footer_cookies_title: "Kaeaeqoii Pfaelloikei",
    mp_footer_privacy: "Alloiix Pfrroiwakei Pfrraetkaekaell",
    mp_footer_privacy_title: "Pfrroiwakei Pfaelloikei",
    page_title: "VK Tkaeaellzz – Phrrii Oinnaghi Tkaeaellzz",
    nav_lang: "Kkhaxghi llaxghuuaghi",
    nav_theme: "Tkaeghghlli lloighkhtk axzh zharrq nnaezhi",
    nav_share: "Zzkharri",
    nav_about: "Aeuurr Uuxoiwirrzzi",
    nav_about_title: "Avaeuutk Uuzz",
    nav_faq: "Vvi Khawi Axzzvvirrzz",
    nav_faq_title: "PhAQh",
    share_copy: "Kaepfei lloixq",
    share_copied: "Lloixq kaepfeizh",
    share_more: "Nnaerri aeptkoixzz",
    nav_terminal_dark: "Zhark nnaezhi zzitk",
    nav_terminal_light: "Lloighkhtk nnaezhi zzitk",
    nav_terminal_lang: "Llaxggwixzhi zzitk tkae {lang}",
    share_email: "Innaoill",
    mp_card_readmore: "Rriazh nnaerri",
    mp_footer_terms: "Ghallaktkoik Khaxzhvaeaeq",
    mp_footer_terms_title: "Tkirrnnzz aeph Uuzzi"
  }
};

/* ===== NAV_LANG_MARKUP — the button+menu markup that sat before the
   theme-toggle button in every page's `.nav-right`. Original indentation
   preserved (8/10-space) since it matches every page's surrounding
   markup exactly. =====

        <div class="nav-lang-wrap">
          <button id="navLangBtn" type="button" class="nav-lang-btn" aria-label="Change language" title="Change language" data-i18n-label="nav_lang">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
              <circle cx="12" cy="12" r="9.5"></circle>
              <ellipse cx="12" cy="12" rx="4" ry="9.5"></ellipse>
              <line x1="2.5" y1="12" x2="21.5" y2="12"></line>
              <path d="M4.2 7.5h15.6M4.2 16.5h15.6"></path>
            </svg>
          </button>
          <div class="nav-lang-menu" id="navLangMenu">
            <button type="button" data-lang="en" class="active">English</button>
            <button type="button" data-lang="g7">7G</button>
          </div>
        </div>

   ===== NAV_LANG_CSS — from shared/site.css and index.html's inline
   <style> (byte-identical in both). =====

.nav-lang-wrap{
  position:relative;
}

.nav-lang-btn{
  width:36px;
  height:36px;
  padding:0;
  border:1px solid var(--border);
  border-radius:10px;
  background:none;
  color:var(--text);
  cursor:pointer;
  font-family:inherit;
  transition:.2s;
  display:flex;
  align-items:center;
  justify-content:center;
}

.nav-lang-btn svg{
  width:20px;
  height:20px;
  flex-shrink:0;
}

.nav-lang-btn:hover{
  border-color:var(--border-strong);
}

.nav-lang-menu{
  position:absolute;
  top:44px;
  right:0;
  width:150px;
  padding:8px;
  border-radius:18px;
  background:#1C2436;
  border:1px solid rgba(255,255,255,.14);
  display:none;
  gap:6px;
  z-index:60;
}

.nav-lang-menu.open{
  display:grid;
}

.nav-lang-menu button{
  height:42px;
  padding:0 12px;
  border-radius:12px;
  border:0;
  background:transparent;
  color:#ffffff;
  font-size:15px;
  font-weight:700;
  text-align:left;
  cursor:pointer;
}

.nav-lang-menu button:hover{
  background:rgba(255,255,255,.08);
}

.nav-lang-menu button.active{
  color:var(--accent2);
}

   Also: `.nav-lang-btn, .nav-theme-btn, .nav-share-btn{width:32px;
   height:32px;}` inside the `@media (max-width:370px)` block in both
   files — the nav-lang-btn part of that selector was dropped too, just
   restore it as a third selector in that same rule.

   ===== APPLY_LANGUAGE_SITE_JS — shared/site.js's version. =====

let currentLang = "en";

function applyLanguage(lang){
  const dict = translations[lang] || translations.en;
  currentLang = translations[lang] ? lang : "en";

  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.dataset.i18n;
    if (dict[key] !== undefined) el.innerHTML = dict[key];
  });

  document.querySelectorAll("[data-i18n-label]").forEach(el => {
    const key = el.dataset.i18nLabel;
    if (dict[key] !== undefined){
      el.setAttribute("aria-label", dict[key]);
      el.setAttribute("title", dict[key]);
    }
  });

  document.documentElement.lang = currentLang;

  document.querySelectorAll("#navLangMenu button").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.lang === currentLang);
  });

  try { localStorage.setItem("bc-lang", currentLang); } catch (e) { /* storage unavailable * / }

  document.dispatchEvent(new CustomEvent("bc:langchange"));
}

   ===== LANGUAGE_SWITCHER_SITE_JS — the IIFE that wired up navLangBtn/
   navLangMenu, called right after applyTheme's own IIFE. =====

(function(){
  let savedLang = null;
  try { savedLang = localStorage.getItem("bc-lang"); } catch (e) { /* storage unavailable * / }
  applyLanguage(savedLang && translations[savedLang] ? savedLang : "en");

  const langBtn = document.getElementById("navLangBtn");
  const langMenu = document.getElementById("navLangMenu");
  if (langBtn && langMenu){
    langBtn.addEventListener("click", () => {
      langMenu.classList.toggle("open");
    });
    langMenu.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-lang]");
      if (!btn || !translations[btn.dataset.lang]) return;
      applyLanguage(btn.dataset.lang);
      langMenu.classList.remove("open");
      const dict = translations[btn.dataset.lang] || translations.en;
      const template = dict.nav_terminal_lang || translations.en.nav_terminal_lang;
      showNavTerminal(template.replace("{lang}", btn.textContent));
    });
    document.addEventListener("click", (e) => {
      if (!langBtn.contains(e.target) && !langMenu.contains(e.target)){
        langMenu.classList.remove("open");
      }
    });
  }
})();

   ===== APPLY_LANGUAGE_INDEX_HTML — index.html's own copy, slightly
   richer (data-i18n-cell-label, data-i18n-placeholder, page_title). =====

let currentLang = "en";
function applyLanguage(lang){
  const dict = translations[lang] || translations.en;
  currentLang = translations[lang] ? lang : "en";

  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.dataset.i18n;
    if (dict[key] !== undefined) el.innerHTML = dict[key];
  });

  document.querySelectorAll("[data-i18n-label]").forEach(el => {
    const key = el.dataset.i18nLabel;
    if (dict[key] !== undefined){
      el.setAttribute("aria-label", dict[key]);
      el.setAttribute("title", dict[key]);
    }
  });

  document.querySelectorAll("[data-i18n-cell-label]").forEach(el => {
    const key = el.dataset.i18nCellLabel;
    if (dict[key] !== undefined) el.setAttribute("data-label", dict[key]);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    if (dict[key] !== undefined) el.setAttribute("placeholder", dict[key]);
  });

  if (dict.page_title) document.title = dict.page_title;
  document.documentElement.lang = lang;

  document.querySelectorAll("#navLangMenu button").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.lang === lang);
  });

  try { localStorage.setItem("bc-lang", lang); } catch (e) { /* storage unavailable * / }

  document.dispatchEvent(new CustomEvent("bc:langchange"));
}

   Also restore checkTranslationCompleteness() (compared every non-en
   language's keys against en's and console.warn'd about missing/extra
   ones — dev-only diagnostic, ran once at load right before applyLanguage
   was first called) — see git history prior to this cleanup for its
   exact source if wanted back; it was a pure diagnostic with no effect
   on rendered output, safe to skip re-adding unless actively developing
   a new language.

   ===== LANGUAGE_SWITCHER_INDEX_HTML — same shape as
   LANGUAGE_SWITCHER_SITE_JS above, index.html's own copy. =====

(function(){
  let savedLang = null;
  try { savedLang = localStorage.getItem("bc-lang"); } catch (e) { /* storage unavailable * / }
  applyLanguage(savedLang && translations[savedLang] ? savedLang : "en");

  const langBtn = document.getElementById("navLangBtn");
  const langMenu = document.getElementById("navLangMenu");
  if (langBtn && langMenu){
    langBtn.addEventListener("click", () => {
      langMenu.classList.toggle("open");
    });
    langMenu.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-lang]");
      if (!btn) return;
      applyLanguage(btn.dataset.lang);
      langMenu.classList.remove("open");
      const dict = translations[btn.dataset.lang] || translations.en;
      const template = dict.nav_terminal_lang || translations.en.nav_terminal_lang;
      showNavTerminal(template.replace("{lang}", btn.textContent));
    });
    document.addEventListener("click", (e) => {
      if (!langBtn.contains(e.target) && !langMenu.contains(e.target)){
        langMenu.classList.remove("open");
      }
    });
  }
})();
*/

if (typeof module !== "undefined" && module.exports){
  module.exports = { SITE_JS_I18N_ARCHIVE, INDEX_HTML_I18N_ARCHIVE };
}
