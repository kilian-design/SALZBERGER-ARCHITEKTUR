// PDF-Anzeige auf Basis von PDF.js. Wird auf allen Seiten eingebunden.
(function () {
  var VERSION = "3.11.174";
  var BASE = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/" + VERSION + "/";

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error("Skript nicht geladen: " + src)); };
      document.head.appendChild(s);
    });
  }

  function getPdfjs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return loadScript(BASE + "pdf.min.js").then(function () {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = BASE + "pdf.worker.min.js";
      return window.pdfjsLib;
    });
  }

  function debounce(fn, ms) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  function dpr() { return Math.min(window.devicePixelRatio || 1, 2); }

  // Hintergrund: erste Seite füllt den Bildschirm (wie background-size: cover).
  function background(url, mount) {
    var canvas = document.createElement("canvas");
    mount.appendChild(canvas);
    var task = null;
    var page = null;

    function draw() {
      if (!page) return;
      if (task) { try { task.cancel(); } catch (e) {} }
      var W = window.innerWidth, H = window.innerHeight, r = dpr();
      var base = page.getViewport({ scale: 1 });
      var s = Math.max(W / base.width, H / base.height);
      var vp = page.getViewport({ scale: s * r });
      canvas.width = Math.round(W * r);
      canvas.height = Math.round(H * r);
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      var ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      task = page.render({
        canvasContext: ctx,
        viewport: vp,
        transform: [1, 0, 0, 1, (canvas.width - vp.width) / 2, (canvas.height - vp.height) / 2]
      });
      task.promise.catch(function () {});
    }

    return getPdfjs()
      .then(function (lib) { return lib.getDocument({ url: url }).promise; })
      .then(function (doc) { return doc.getPage(1); })
      .then(function (p) {
        page = p;
        draw();
        window.addEventListener("resize", debounce(draw, 150));
      })
      .catch(function () { mount.remove(); });
  }

  // Dokument: jede Seite wird so groß angezeigt, dass sie unter den Reitern
  // komplett auf den Bildschirm passt.
  function documentView(url, mount) {
    document.documentElement.classList.add("pdf-seite");
    var entries = [];
    var observer = null;

    function navHeight() {
      var nav = document.querySelector(".nav");
      return nav ? nav.getBoundingClientRect().height : 0;
    }

    function fit(entry) {
      var cs = getComputedStyle(document.body);
      var padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      var availW = window.innerWidth - padX;
      var availH = window.innerHeight - navHeight() - 16;
      var base = entry.page.getViewport({ scale: 1 });
      var s = Math.min(availW / base.width, availH / base.height);
      entry.cssW = Math.floor(base.width * s);
      entry.cssH = Math.floor(base.height * s);
      entry.scale = s;
      entry.canvas.style.width = entry.cssW + "px";
      entry.canvas.style.height = entry.cssH + "px";
    }

    function render(entry) {
      if (entry.task) { try { entry.task.cancel(); } catch (e) {} }
      var r = dpr();
      var vp = entry.page.getViewport({ scale: entry.scale * r });
      entry.canvas.width = Math.floor(vp.width);
      entry.canvas.height = Math.floor(vp.height);
      var ctx = entry.canvas.getContext("2d");
      ctx.clearRect(0, 0, entry.canvas.width, entry.canvas.height);
      entry.task = entry.page.render({ canvasContext: ctx, viewport: vp });
      entry.task.promise.then(function () { entry.done = true; }).catch(function () {});
    }

    function layout() {
      entries.forEach(function (e) { e.done = false; fit(e); });
      if (observer) observer.disconnect();
      observer = new IntersectionObserver(function (items) {
        items.forEach(function (it) {
          var e = it.target._entry;
          if (it.isIntersecting && !e.done) render(e);
        });
      }, { rootMargin: "100% 0px" });
      entries.forEach(function (e) { observer.observe(e.section); });
    }

    return getPdfjs()
      .then(function (lib) { return lib.getDocument({ url: url }).promise; })
      .then(function (doc) {
        var jobs = [];
        for (var n = 1; n <= doc.numPages; n++) jobs.push(doc.getPage(n));
        return Promise.all(jobs);
      })
      .then(function (pages) {
        pages.forEach(function (page, i) {
          var section = document.createElement("section");
          section.className = "seite";
          section.setAttribute("aria-label", "Seite " + (i + 1) + " von " + pages.length);
          var canvas = document.createElement("canvas");
          section.appendChild(canvas);
          mount.appendChild(section);
          var entry = { page: page, canvas: canvas, section: section, done: false };
          section._entry = entry;
          entries.push(entry);
        });
        layout();
        window.addEventListener("resize", debounce(layout, 150));
      })
      .catch(function () {
        mount.innerHTML = '<p class="fehler">Die PDF konnte nicht angezeigt werden. ' +
          '<a href="' + url + '">PDF direkt öffnen</a></p>';
      });
  }

  window.SiteViewer = { background: background, document: documentView };
})();
