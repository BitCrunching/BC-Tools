/* Halloween skin — temporary. Remove with halloween.css; the loader line sits at the top of shared/site.js. */
(function(){
  if (!document.documentElement.classList.contains("hw")) return;
  const SPIDER = '<svg viewBox="0 0 24 24" aria-hidden="true"><g class="hw-legs hw-legs-a" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"><path d="M9.6 8.3 L6.1 6.1 L10.7 1.6M9.8 10.3 L4.7 11.5 L3 17.6M14.4 8.8 L19.8 7.9 L21.7 1.8M13.7 11.2 L17.9 15.5 L15.4 22.3"/></g><g class="hw-legs hw-legs-b" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"><path d="M9.6 8.8 L4.2 7.9 L2.3 1.8M10.3 11.2 L6.1 15.5 L8.6 22.3M14.4 8.3 L17.9 6.1 L13.3 1.6M14.2 10.3 L19.3 11.5 L21 17.6"/></g><circle cx="12.2" cy="13.5" r="3.7" fill="currentColor"/><circle cx="12.1" cy="8.1" r="2.9" fill="currentColor"/><path d="M11.4 5.6Q11 4.9 11.3 4.4M12.9 5.6Q13.3 4.9 13 4.4" fill="none" stroke="currentColor" stroke-width=".6" stroke-linecap="round"/></svg>';

  function spider(cls){
    const el = document.createElement("span");
    el.className = "hw-spider " + cls;
    el.innerHTML = SPIDER;
    return el;
  }

  const web = document.createElement("div");
  web.className = "hw-web-spider";
  web.setAttribute("aria-hidden", "true");
  web.appendChild(spider("hw-spider-web"));
  document.body.appendChild(web);

  const footer = document.querySelector(".footer-dashboard");
  if (footer){
    const pumpkin = document.createElement("div");
    pumpkin.className = "hw-pumpkin";
    pumpkin.setAttribute("aria-hidden", "true");
    pumpkin.innerHTML = '<svg viewBox="0 0 100 92"><path class="hw-stem" d="M46 20C46 12 48 8 52 4L60 6C57 10 56 14 57 21Z"/><ellipse class="hw-lobe" cx="30" cy="54" rx="22" ry="33"/><ellipse class="hw-lobe" cx="70" cy="54" rx="22" ry="33"/><ellipse class="hw-lobe" cx="50" cy="54" rx="21" ry="36"/><g class="hw-halo"><polygon points="22,50 46,50 34,26"/><polygon points="54,50 78,50 66,26"/><polygon class="hw-halo-mouth" points="24.0,59.6 34.7,71.3 41.7,62.2 50.0,73.9 58.3,62.2 65.3,71.3 76.0,59.6 68.9,80.4 31.1,80.4"/></g><polygon class="hw-eye" points="27,47 43,47 35,34"/><polygon class="hw-eye" points="57,47 73,47 65,34"/><polygon class="hw-mouth" points="28,62 37,71 43,64 50,73 57,64 63,71 72,62 66,78 34,78"/><g class="hw-hi"><polygon class="hw-eye-hi" points="27,47 43,47 35,34"/><polygon class="hw-eye-hi" points="57,47 73,47 65,34"/><polygon class="hw-mouth-hi" points="28,62 37,71 43,64 50,73 57,64 63,71 72,62 66,78 34,78"/></g></svg>';
    footer.appendChild(pumpkin);
    const update = () => {
      const bottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 6;
      pumpkin.classList.toggle("hw-lit", bottom);
    };
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
  }

  const bat = '<span class="hw-bat"><svg viewBox="0 0 60 28"><g class="hw-wing hw-wing-l"><path d="M26 11Q15 3 2 6Q8 8 9 13Q11 12 14 15Q15 14 19 17Q21 16 24 21Z"/></g><g class="hw-wing hw-wing-r"><path transform="translate(60 0) scale(-1 1)" d="M26 11Q15 3 2 6Q8 8 9 13Q11 12 14 15Q15 14 19 17Q21 16 24 21Z"/></g><g class="hw-bat-body"><path d="M26 12Q30 14 34 12L33 20L30 26L27 20Z"/><ellipse cx="30" cy="11" rx="4.2" ry="3.7"/><path d="M26.2 9L26.8 4.4L28.8 7.8ZM33.8 9L33.2 4.4L31.2 7.8Z"/><path class="hw-bat-eye" d="M27.4 10.6L29.4 11.3L28.9 12.3ZM32.6 10.6L30.6 11.3L31.1 12.3Z"/></g></svg></span>';
  const nav = document.querySelector(".site-nav");
  if (nav){
    const lane = document.createElement("div");
    lane.className = "hw-bat-lane";
    lane.setAttribute("aria-hidden", "true");
    lane.innerHTML = bat.replace('hw-bat"', 'hw-bat hw-bat-a"') + bat.replace('hw-bat"', 'hw-bat hw-bat-b"');
    nav.appendChild(lane);

    const countdown = document.createElement("div");
    countdown.className = "hw-countdown";
    countdown.setAttribute("aria-hidden", "true");
    countdown.innerHTML = '<span class="hw-cd-prompt">&gt;</span> <span class="hw-cd-long"></span><span class="hw-cd-time"></span><span class="hw-cd-cursor">_</span>';
    nav.appendChild(countdown);
    const label = (window.BC_I18N && window.BC_I18N["Halloween ends in"]) || "Halloween ends in";
    countdown.querySelector(".hw-cd-long").textContent = label + " ";
    const END = new Date(2026, 10, 3).getTime();
    const pad = n => String(n).padStart(2, "0");
    const time = countdown.querySelector(".hw-cd-time");
    const tick = () => {
      const left = Math.floor((END - Date.now()) / 1000);
      if (left <= 0){
        countdown.remove();
        clearInterval(timer);
        return;
      }
      time.textContent = `${Math.floor(left / 86400)}d ${pad(Math.floor(left % 86400 / 3600))}h ${pad(Math.floor(left % 3600 / 60))}m ${pad(left % 60)}s`;
    };
    const timer = setInterval(tick, 1000);
    tick();
  }

  document.querySelectorAll("#page-mainpage .card-open").forEach(card => {
    card.insertAdjacentHTML("beforeend", '<span class="hw-dangler" aria-hidden="true"><i class="hw-thread"></i>' + spider("hw-spider-d").outerHTML + '</span>');
  });
  const openBtn = document.getElementById("toolPreviewOpen");
  if (openBtn) openBtn.insertAdjacentHTML("beforeend", '<span class="hw-peeker" aria-hidden="true">' + spider("hw-spider-p").outerHTML + '</span>');

  const batBox = document.querySelector(".tool-card-blueprint");
  if (batBox){
    const rand = (lo, hi) => lo + Math.random() * (hi - lo);
    const edge = (side, w, h) => side === 0 ? [-40, rand(0, h)] : side === 1 ? [w + 40, rand(0, h)] : side === 2 ? [rand(0, w), -30] : [rand(0, w), h + 30];
    const swarm = () => {
      const r = batBox.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      const w = batBox.clientWidth;
      const h = batBox.clientHeight;
      const n = Math.round(rand(8, 11));
      for (let i = 0; i < n; i++){
        const from = Math.floor(rand(0, 4));
        const to = (from + 1 + Math.floor(rand(0, 3))) % 4;
        const [sx, sy] = edge(from, w, h);
        const [ex, ey] = edge(to, w, h);
        const el = document.createElement("span");
        el.className = "hw-bat hw-box-bat" + (ex < sx ? " hw-box-bat-b" : "");
        el.setAttribute("aria-hidden", "true");
        el.innerHTML = bat.replace(/^<span class="hw-bat">/, "").replace(/<\/span>$/, "");
        el.style.offsetPath = `path("M ${sx} ${sy} C ${rand(0, w)} ${rand(0, h)}, ${rand(0, w)} ${rand(0, h)}, ${ex} ${ey}")`;
        const timing = { duration: rand(1800, 3200), delay: rand(0, 1200), fill: "both" };
        const s0 = rand(.7, 1.2);
        batBox.appendChild(el);
        const flight = el.animate([{ offsetDistance: "0%" }, { offsetDistance: "100%" }], { ...timing, easing: "linear" });
        el.querySelector("svg").animate([{ scale: s0 }, { scale: s0 * 1.5 }, { scale: s0 }], { ...timing, easing: "ease-in-out" });
        flight.onfinish = () => el.remove();
      }
    };
    setTimeout(swarm, 1200);
    setInterval(swarm, 5000);
  }
})();
