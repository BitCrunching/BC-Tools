/* Halloween skin — temporary. Remove with halloween.css; the loader line sits at the top of shared/site.js. */
(function(){
  const SPIDER = '<svg viewBox="0 0 24 24" aria-hidden="true"><g class="hw-legs" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M9.4 8 L6.5 1.5 L2.2 5.2M8.6 10.8 L4.2 8.6 L1.4 12.4M8.6 13.5 L4 15 L1.6 19.2M9.4 17 L7 21 L4.2 23.4M14.6 8 L17.5 1.5 L21.8 5.2M15.4 10.8 L19.8 8.6 L22.6 12.4M15.4 13.5 L20 15 L22.4 19.2M14.6 17 L17 21 L19.8 23.4"/></g><path d="M12 5C14.8 5 16.2 9.6 16.2 13C16.2 16.4 14.4 19 12 19C9.6 19 7.8 16.4 7.8 13C7.8 9.6 9.2 5 12 5Z" fill="currentColor"/></svg>';

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
    pumpkin.innerHTML = '<svg viewBox="0 0 100 92"><path class="hw-stem" d="M46 20C46 12 48 8 52 4L60 6C57 10 56 14 57 21Z"/><ellipse class="hw-lobe" cx="30" cy="54" rx="22" ry="33"/><ellipse class="hw-lobe" cx="70" cy="54" rx="22" ry="33"/><ellipse class="hw-lobe" cx="50" cy="54" rx="21" ry="36"/><g class="hw-halo"><polygon points="22,50 46,50 34,26"/><polygon points="54,50 78,50 66,26"/></g><polygon class="hw-eye" points="27,47 43,47 35,34"/><polygon class="hw-eye" points="57,47 73,47 65,34"/><polygon class="hw-mouth" points="28,62 37,71 43,64 50,73 57,64 63,71 72,62 66,78 34,78"/></svg>';
    footer.appendChild(pumpkin);
    const update = () => {
      const bottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 6;
      pumpkin.classList.toggle("hw-lit", bottom);
    };
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
  }

  const nav = document.querySelector(".site-nav");
  if (nav){
    const lane = document.createElement("div");
    lane.className = "hw-bat-lane";
    lane.setAttribute("aria-hidden", "true");
    lane.innerHTML = '<span class="hw-bat"><svg viewBox="0 0 60 28"><g class="hw-bat-wing"><path d="M26 11Q15 3 2 6Q8 8 9 13Q11 12 14 15Q15 14 19 17Q21 16 24 21Z"/><path transform="translate(60 0) scale(-1 1)" d="M26 11Q15 3 2 6Q8 8 9 13Q11 12 14 15Q15 14 19 17Q21 16 24 21Z"/></g><path d="M26 12Q30 14 34 12L33 20L30 26L27 20Z"/><ellipse cx="30" cy="11" rx="4.2" ry="3.7"/><path d="M26.2 9L26.8 4.4L28.8 7.8ZM33.8 9L33.2 4.4L31.2 7.8Z"/><path class="hw-bat-eye" d="M27.4 10.6L29.4 11.3L28.9 12.3ZM32.6 10.6L30.6 11.3L31.1 12.3Z"/></svg></span>';
    nav.appendChild(lane);
  }
})();
