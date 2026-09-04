let currentGoldenRulesTool = "convert";

let goldenRulesInContentAd = null;
let goldenRulesInContentAdPushed = false;

function placeGoldenRulesInContentAd(){
  const activeArticles = document.querySelector(".golden-rules-articles.active");
  const articles = activeArticles ? activeArticles.querySelectorAll(".golden-rules-article") : [];
  const targetArticle = articles[2] || articles[articles.length - 1];
  if (!targetArticle) return;

  if (!goldenRulesInContentAd){
    goldenRulesInContentAd = document.createElement("ins");
    goldenRulesInContentAd.className = "adsbygoogle ad-slot ad-slot-incontent ad-slot-banner";
    goldenRulesInContentAd.style.width = "320px";
    goldenRulesInContentAd.style.height = "50px";
    goldenRulesInContentAd.setAttribute("data-ad-client", "ca-pub-3037236608651508");
    goldenRulesInContentAd.setAttribute("data-ad-slot", "0000000005");
  }

  targetArticle.insertAdjacentElement("afterend", goldenRulesInContentAd);

  if (!goldenRulesInContentAdPushed){
    goldenRulesInContentAdPushed = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (err) {
      console.error("[adsense] in-content push failed:", err);
    }
  }
}

function selectGoldenRulesTool(tool){
  if (tool) currentGoldenRulesTool = tool;
  document.querySelectorAll(".golden-rules-tool-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tool === currentGoldenRulesTool);
  });
  document.querySelectorAll(".golden-rules-articles").forEach(el => {
    el.classList.toggle("active", el.dataset.tool === currentGoldenRulesTool);
  });
  placeGoldenRulesInContentAd();
}

document.querySelectorAll(".golden-rules-tool-btn").forEach(btn => {
  btn.addEventListener("click", () => selectGoldenRulesTool(btn.dataset.tool));
});

selectGoldenRulesTool("convert");
