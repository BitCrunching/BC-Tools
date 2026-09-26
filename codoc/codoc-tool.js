(function(){
  const toolApp = document.querySelector(".tool-app");
  const drop = document.getElementById("cdcDrop");
  const input = document.getElementById("cdcInput");
  const afterDrop = document.getElementById("cdcAfterDrop");
  const results = document.getElementById("cdcResults");
  const controls = document.getElementById("cdcControls");
  const convertBtn = document.getElementById("cdcConvertBtn");
  const removeBtn = document.getElementById("cdcRemoveBtn");
  const status = document.getElementById("cdcStatus");
  const privacyBadge = document.getElementById("cdcPrivacyBadge");

  let file = null;

  bcSetupHelpBanner("codoc", "cdc", [
    ["WELCOME_TO_CODOC", "Codoc turns a Word document into a PDF — click or drop a .docx file below to get started."],
    ["CHECK_BEFORE_CONVERTING", "Your file shows up below once picked — check it, or remove it and pick a different one."],
    ["YOU_ARE_SET", "Hit Convert and the PDF downloads automatically. Close this with the red dot and we won't show it again."]
  ]);

  function isDocx(f){
    return f && (f.name || "").toLowerCase().endsWith(".docx");
  }

  function isDragEventInScope(e){
    return afterDrop.hidden || e.dataTransfer.types.includes("Files");
  }
  bcSetupBannerDropTarget(toolApp, {
    isInScope: isDragEventInScope,
    onDrop: e => applyPickedFile([...e.dataTransfer.files].find(isDocx))
  });

  toolApp.addEventListener("click", e => {
    if (e.target.closest("button, select, a, label, input")) return;
    if (afterDrop.hidden) input.click();
  });

  input.addEventListener("change", () => {
    applyPickedFile([...input.files].find(isDocx));
    input.value = "";
  });

  function renderResult(){
    results.innerHTML = "";
    if (!file) return;
    const card = document.createElement("div");
    card.className = "result cdc-result-row";
    card.innerHTML =
      '<span class="cdc-doc-icon" aria-hidden="true">DOCX</span>' +
      '<div class="cdc-result-meta">' +
        '<div class="result-name"></div>' +
        '<div class="cdc-result-size"></div>' +
      '</div>';
    card.querySelector(".result-name").textContent = file.name;
    card.querySelector(".cdc-result-size").textContent = bcFormatFileSize(file.size);
    results.appendChild(card);
  }

  function applyPickedFile(picked){
    if (!picked){
      status.textContent = "Please choose a .docx file — the older .doc format isn't supported.";
      return;
    }
    file = picked;
    drop.hidden = true;
    afterDrop.hidden = false;
    controls.hidden = false;
    convertBtn.disabled = false;
    status.textContent = "Ready to convert";
    renderResult();
  }

  function resetTool(){
    file = null;
    afterDrop.hidden = true;
    drop.hidden = false;
    controls.hidden = true;
    convertBtn.disabled = true;
    convertBtn.textContent = "Convert and download";
    results.innerHTML = "";
    status.textContent = "";
  }
  removeBtn.addEventListener("click", resetTool);

  /* ===== DOCX -> PDF ===== mammoth parses the .docx into HTML (it only
     understands the modern zip-based format, never the legacy binary
     .doc one), then html2canvas rasterizes that HTML at a fixed
     A4-ish width and jsPDF slices the resulting tall canvas into
     individual A4 pages — the same technique html2pdf.js itself uses
     internally, done by hand here since only the pagination step is
     actually needed. */
  async function convertToPdf(){
    const arrayBuffer = await file.arrayBuffer();
    const { value: html, messages } = await mammoth.convertToHtml({ arrayBuffer });
    if (messages && messages.some(m => m.type === "error")){
      throw new Error("This document uses features Codoc couldn't read.");
    }

    const container = document.createElement("div");
    container.className = "cdc-offscreen";
    container.innerHTML = html;
    document.body.appendChild(container);

    let pdfBlob;
    try {
      const canvas = await html2canvas(container, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const ratio = pageWidth / canvas.width;
      const pageHeightPx = Math.floor(pageHeight / ratio);

      let renderedPx = 0;
      let pageIndex = 0;
      while (renderedPx < canvas.height){
        const sliceHeightPx = Math.min(pageHeightPx, canvas.height - renderedPx);
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeightPx;
        pageCanvas.getContext("2d").drawImage(
          canvas,
          0, renderedPx, canvas.width, sliceHeightPx,
          0, 0, canvas.width, sliceHeightPx
        );
        if (pageIndex > 0) pdf.addPage();
        pdf.addImage(pageCanvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pageWidth, sliceHeightPx * ratio);
        renderedPx += sliceHeightPx;
        pageIndex++;
      }
      pdfBlob = pdf.output("blob");
    } finally {
      container.remove();
    }
    return pdfBlob;
  }

  convertBtn.addEventListener("click", async () => {
    if (!file) return;
    startPrivacyCheck();
    convertBtn.disabled = true;
    convertBtn.textContent = "Converting...";
    status.textContent = "Converting...";
    try {
      const blob = await convertToPdf();
      const name = file.name.replace(/\.docx$/i, "") + ".pdf";
      downloadBlob(blob, name);
      status.textContent = "Downloaded";
    } catch (err) {
      status.textContent = err && err.message ? err.message : "Conversion failed — please try a different file.";
    } finally {
      convertBtn.disabled = false;
      convertBtn.textContent = "Convert and download";
      finishPrivacyCheck(privacyBadge, "convert");
    }
  });
})();
