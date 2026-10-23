// publications.js
// The Publications section of the home page. The list of works comes from
// the public ORCID record; author lists and citation counts are added from
// OpenAlex (matched by DOI). Results are cached in the browser for a day.

var Publications = (function () {
  "use strict";

  var esc = SiteData.esc;
  var CACHE_KEY = "pubs-v1";
  var CACHE_MS = 24 * 60 * 60 * 1000;
  var PAGE = 8;            // papers shown before "Show all"
  var AUTHORS_SHOWN = 6;   // authors shown before "+N more"
  var BAR = "#d85a54";     // accent, deepened to pass 3:1 against #f7f7f8

  var WORK_TYPES = {
    "journal-article": "Journal article", "conference-paper": "Conference paper",
    "conference-abstract": "Conference abstract", "preprint": "Preprint", "book": "Book",
    "book-chapter": "Book chapter", "dissertation-thesis": "Thesis", "working-paper": "Working paper"
  };

  function val(o) { return o && o.value; }

  // ------------------------------------------------------------------
  // data
  // ------------------------------------------------------------------

  function loadOrcid(orcid) {
    return fetch("https://pub.orcid.org/v3.0/" + orcid + "/works", {
      headers: { "Accept": "application/json" }
    }).then(function (r) {
      if (!r.ok) throw new Error("ORCID: HTTP " + r.status);
      return r.json();
    }).then(function (d) {
      return (d.group || []).map(function (g) {
        var w = g["work-summary"][0];
        var date = w["publication-date"] || {};
        var doi = ((w["external-ids"] || {})["external-id"] || []).filter(function (x) {
          return x["external-id-type"] === "doi";
        })[0];
        return {
          title: val((w.title || {}).title) || "(untitled)",
          venue: val(w["journal-title"]) || WORK_TYPES[w.type] || "",
          year: val(date.year) || "",
          sortKey: [val(date.year) || "0000", val(date.month) || "00", val(date.day) || "00"].join("-"),
          doi: doi ? String(doi["external-id-value"]).toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "") : "",
          putCode: w["put-code"],
          url: val(w.url) || (doi && val(doi["external-id-url"])) ||
            "https://orcid.org/" + orcid + "/work/" + w["put-code"],
          authors: null,
          firstAuthor: false,
          cites: null,
          citesByYear: null
        };
      });
    });
  }

  // is this authorship me? ORCID match first, name match as a fallback
  function isMe(a, orcid) {
    var id = (a.author && a.author.orcid) || "";
    if (id && id.slice(-orcid.length) === orcid) return true;
    var name = a.raw_author_name || (a.author && a.author.display_name) || "";
    return /\bcook\b/i.test(name) && /\bn(eil)?\b/i.test(name);
  }

  function enrich(pubs, orcid) {
    var dois = pubs.filter(function (p) { return p.doi; }).map(function (p) { return p.doi; });
    var chunks = [];
    for (var i = 0; i < dois.length; i += 50) chunks.push(dois.slice(i, i + 50));
    return Promise.all(chunks.map(function (c) {
      var url = "https://api.openalex.org/works?per-page=50" +
        "&select=doi,cited_by_count,counts_by_year,authorships" +
        "&filter=doi:" + c.map(encodeURIComponent).join("|");
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error("OpenAlex: HTTP " + r.status);
        return r.json();
      }).then(function (d) { return d.results || []; });
    })).then(function (lists) {
      var byDoi = {};
      lists.forEach(function (l) {
        l.forEach(function (w) {
          byDoi[String(w.doi || "").toLowerCase().replace("https://doi.org/", "")] = w;
        });
      });
      pubs.forEach(function (p) {
        var w = byDoi[p.doi];
        if (!w) return;
        p.cites = w.cited_by_count || 0;
        p.citesByYear = (w.counts_by_year || []).map(function (c) { return [c.year, c.cited_by_count]; });
        setAuthors(p, (w.authorships || []).map(function (a) {
          return { name: (a.author && a.author.display_name) || a.raw_author_name || "?", me: isMe(a, orcid) };
        }));
      });
      return enrichFromOrcid(pubs, orcid);
    });
  }

  // "Cook, N. J." -> "N. J. Cook"
  function flipName(n) {
    var m = String(n || "").match(/^([^,]+),\s*(.+)$/);
    return m ? m[2] + " " + m[1] : String(n || "?");
  }

  function setAuthors(p, authors) {
    p.authors = authors;
    var first = authors[0];
    p.firstAuthor = !!first && (first.me || /\bcook$/i.test(first.name));
  }

  // works OpenAlex didn't match (mostly no DOI): use the contributor lists
  // stored in the full ORCID records, fetched in one bulk request
  function enrichFromOrcid(pubs, orcid) {
    var missing = pubs.filter(function (p) { return !p.authors; }).slice(0, 100);
    if (!missing.length) return Promise.resolve(pubs);
    return fetch("https://pub.orcid.org/v3.0/" + orcid + "/works/" +
      missing.map(function (p) { return p.putCode; }).join(","), {
      headers: { "Accept": "application/json" }
    }).then(function (r) {
      if (!r.ok) throw new Error("ORCID bulk: HTTP " + r.status);
      return r.json();
    }).then(function (d) {
      var byCode = {};
      (d.bulk || []).forEach(function (b) { if (b.work) byCode[b.work["put-code"]] = b.work; });
      missing.forEach(function (p) {
        var w = byCode[p.putCode];
        var cs = ((w && w.contributors) || {}).contributor || [];
        var authors = cs.map(function (c) {
          var name = flipName(val(c["credit-name"]));
          var id = (c["contributor-orcid"] || {}).path;
          return { name: name, me: id === orcid || isMe({ raw_author_name: name }, orcid) };
        });
        if (authors.length) setAuthors(p, authors);
      });
      return pubs;
    }, function (e) {
      console.error(e);
      return pubs;
    });
  }

  function readCache(orcid) {
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY));
      if (c && c.orcid === orcid && Date.now() - c.time < CACHE_MS) return c.pubs;
    } catch (e) { /* no cache */ }
    return null;
  }

  function writeCache(orcid, pubs) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ orcid: orcid, time: Date.now(), pubs: pubs }));
    } catch (e) { /* storage full or blocked */ }
  }

  // resolves {pubs, enriched}; OpenAlex failing still gives the ORCID list
  function load(orcid) {
    var cached = readCache(orcid);
    if (cached) return Promise.resolve({ pubs: cached, enriched: true });
    return loadOrcid(orcid).then(function (pubs) {
      return enrich(pubs, orcid).then(function (p) {
        writeCache(orcid, p);
        return { pubs: p, enriched: true };
      }, function (e) {
        console.error(e);
        return { pubs: pubs, enriched: false };
      });
    });
  }

  // ------------------------------------------------------------------
  // stats + chart
  // ------------------------------------------------------------------

  function hIndex(pubs) {
    var c = pubs.map(function (p) { return p.cites || 0; }).sort(function (a, b) { return b - a; });
    var h = 0;
    while (h < c.length && c[h] >= h + 1) h++;
    return h;
  }

  function renderStats(pubs, enriched) {
    var tiles = [["Publications", pubs.length]];
    if (enriched) {
      tiles.push(["First author", pubs.filter(function (p) { return p.firstAuthor; }).length]);
      tiles.push(["Citations", pubs.reduce(function (n, p) { return n + (p.cites || 0); }, 0)]);
      tiles.push(["h-index", hIndex(pubs)]);
    }
    return tiles.map(function (t) {
      return '<div class="pub-stat"><span class="pub-stat-num">' + t[1].toLocaleString() +
        '</span><span class="pub-stat-label">' + t[0] + "</span></div>";
    }).join("");
  }

  function citesPerYear(pubs) {
    var by = {};
    pubs.forEach(function (p) {
      (p.citesByYear || []).forEach(function (c) { by[c[0]] = (by[c[0]] || 0) + c[1]; });
    });
    var years = Object.keys(by).map(Number).sort();
    if (!years.length) return [];
    var out = [];
    for (var y = years[0]; y <= years[years.length - 1]; y++) out.push({ year: y, n: by[y] || 0 });
    return out;
  }

  // single-series bar chart: rounded tops on a baseline, peak labelled,
  // every bar has a hover/focus tooltip, and a screen-reader table
  function renderChart(fig, data) {
    // draw at the real width so text stays 12px on phones
    var W = Math.max(280, Math.round(fig.clientWidth || 760));
    var H = W < 500 ? 150 : 190, top = 26, base = H - 26, padX = 4;
    var slot = (W - 2 * padX) / data.length;
    var bw = Math.min(44, slot - 6);
    var max = Math.max.apply(null, data.map(function (d) { return d.n; })) || 1;
    var peak = data.reduce(function (a, d) { return d.n > a.n ? d : a; }, data[0]);
    var thisYear = new Date().getFullYear();
    var svg = "";
    data.forEach(function (d, i) {
      var x = padX + i * slot + (slot - bw) / 2;
      var h = Math.round((d.n / max) * (base - top));
      var y = base - h, r = Math.min(4, h, bw / 2);
      if (h > 0) {
        svg += '<path fill="' + BAR + '" d="M' + x + "," + base + "V" + (y + r) +
          "Q" + x + "," + y + " " + (x + r) + "," + y + "H" + (x + bw - r) +
          "Q" + (x + bw) + "," + y + " " + (x + bw) + "," + (y + r) + "V" + base + 'Z"/>';
      }
      if (d === peak) {
        svg += '<text class="pub-chart-val" x="' + (x + bw / 2) + '" y="' + (y - 7) + '">' + d.n + "</text>";
      }
      // label every year, or every other one (ending on the latest) when crowded
      if (slot >= 38 || (data.length - 1 - i) % 2 === 0) {
        svg += '<text class="pub-chart-year" x="' + (x + bw / 2) + '" y="' + (H - 7) + '">' + d.year + "</text>";
      }
      svg += '<rect class="pub-chart-hit" x="' + (padX + i * slot) + '" y="0" width="' + slot + '" height="' + base +
        '" tabindex="0" data-tip="' + d.year + (d.year === thisYear ? " (so far)" : "") + ": " +
        d.n.toLocaleString() + " citation" + (d.n === 1 ? "" : "s") + '"/>';
    });
    svg += '<line class="pub-chart-base" x1="0" x2="' + W + '" y1="' + (base + 0.5) + '" y2="' + (base + 0.5) + '"/>';

    fig.innerHTML = '<figcaption>Citations per year</figcaption>' +
      '<div class="pub-chart-wrap"><svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Citations per year, ' +
      data[0].year + " to " + data[data.length - 1].year + ", peak " + peak.n + " in " + peak.year + '">' + svg +
      '</svg><div class="pub-tip" hidden></div></div>' +
      '<table class="sr-only"><caption>Citations per year</caption><tr><th>Year</th><th>Citations</th></tr>' +
      data.map(function (d) { return "<tr><td>" + d.year + "</td><td>" + d.n + "</td></tr>"; }).join("") +
      "</table>";

    var wrap = fig.querySelector(".pub-chart-wrap");
    var tip = fig.querySelector(".pub-tip");
    function show(e) {
      var t = e.target;
      if (!t.getAttribute || !t.getAttribute("data-tip")) return;
      var box = t.getBoundingClientRect(), outer = wrap.getBoundingClientRect();
      tip.textContent = t.getAttribute("data-tip");
      tip.hidden = false;
      tip.style.left = (box.left - outer.left + box.width / 2) + "px";
    }
    function hide() { tip.hidden = true; }
    wrap.addEventListener("mouseover", show);
    wrap.addEventListener("focusin", show);
    wrap.addEventListener("click", show);
    wrap.addEventListener("mouseleave", hide);
    wrap.addEventListener("focusout", hide);
  }

  // ------------------------------------------------------------------
  // list
  // ------------------------------------------------------------------

  function authorHtml(a) {
    return a.me ? "<strong>" + esc(a.name) + "</strong>" : esc(a.name);
  }

  function renderAuthors(authors, all) {
    if (!authors || !authors.length) return "";
    if (all || authors.length <= AUTHORS_SHOWN + 1) {
      return '<div class="pub-authors">' + authors.map(authorHtml).join(", ") + "</div>";
    }
    var shown = authors.slice(0, AUTHORS_SHOWN).map(authorHtml);
    var meAt = -1;
    authors.forEach(function (a, i) { if (a.me && meAt < 0) meAt = i; });
    if (meAt >= AUTHORS_SHOWN) shown.push("&hellip; " + authorHtml(authors[meAt]));
    return '<div class="pub-authors">' + shown.join(", ") +
      ' <button class="pub-authors-more" type="button">+' + (authors.length - AUTHORS_SHOWN) +
      " more</button></div>";
  }

  function renderItem(p, i) {
    var meta = [];
    if (p.venue) meta.push('<span class="pub-venue">' + esc(p.venue) + "</span>");
    if (p.cites) meta.push('<span class="pub-cites">' + p.cites.toLocaleString() + " citation" + (p.cites === 1 ? "" : "s") + "</span>");
    if (p.firstAuthor) meta.push('<span class="pub-tag">First author</span>');
    return '<li class="pub" data-i="' + i + '"><span class="pub-year">' + esc(p.year) + "</span>" +
      '<div class="pub-text"><a class="pub-title" href="' + esc(SiteData.safeUrl(p.url)) +
      '" target="_blank" rel="noopener">' + esc(p.title) + "</a>" +
      renderAuthors(p.authors, false) +
      (meta.length ? '<div class="pub-meta">' + meta.join('<span class="pub-dot">&middot;</span>') + "</div>" : "") +
      "</div></li>";
  }

  // ------------------------------------------------------------------
  // section wiring
  // ------------------------------------------------------------------

  function init(orcid) {
    var $ = function (id) { return document.getElementById(id); };
    var state = { pubs: [], filter: "all", sort: "new", all: false };

    function visible() {
      var list = state.pubs.filter(function (p) { return state.filter === "all" || p.firstAuthor; });
      return list.slice().sort(state.sort === "cited"
        ? function (a, b) { return (b.cites || 0) - (a.cites || 0) || (a.sortKey < b.sortKey ? 1 : -1); }
        : function (a, b) { return a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0; });
    }

    function renderList() {
      var list = visible();
      var shown = state.all ? list : list.slice(0, PAGE);
      $("pub-list").innerHTML = shown.map(function (p) { return renderItem(p, state.pubs.indexOf(p)); }).join("");
      var more = $("pub-more");
      more.hidden = shown.length >= list.length;
      more.textContent = "Show all " + list.length;
      Array.prototype.forEach.call(document.querySelectorAll("#pub-toolbar [data-filter], #pub-toolbar [data-sort]"), function (b) {
        var on = b.getAttribute("data-filter") === state.filter || b.getAttribute("data-sort") === state.sort;
        b.className = "pub-pill" + (on ? " is-active" : "");
      });
    }

    $("pub-toolbar").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      if (b.getAttribute("data-filter")) state.filter = b.getAttribute("data-filter");
      if (b.getAttribute("data-sort")) state.sort = b.getAttribute("data-sort");
      renderList();
    });
    $("pub-more").addEventListener("click", function () { state.all = true; renderList(); });
    $("pub-list").addEventListener("click", function (e) {
      if (!e.target.classList.contains("pub-authors-more")) return;
      var p = state.pubs[+e.target.closest(".pub").getAttribute("data-i")];
      e.target.parentNode.outerHTML = renderAuthors(p.authors, true);
    });

    load(orcid).then(function (r) {
      state.pubs = r.pubs;
      $("pub-status").hidden = true;
      $("pub-stats").innerHTML = renderStats(r.pubs, r.enriched);
      $("pub-stats").hidden = false;
      if (r.enriched) {
        var nFirst = r.pubs.filter(function (p) { return p.firstAuthor; }).length;
        $("pub-count-all").textContent = r.pubs.length;
        $("pub-count-first").textContent = nFirst;
        $("pub-toolbar").hidden = false;
        var per = citesPerYear(r.pubs);
        if (per.length > 1) {
          $("pub-chart").hidden = false;
          renderChart($("pub-chart"), per);
          var lastW = $("pub-chart").clientWidth, timer = null;
          window.addEventListener("resize", function () {
            clearTimeout(timer);
            timer = setTimeout(function () {
              if ($("pub-chart").clientWidth !== lastW) {
                lastW = $("pub-chart").clientWidth;
                renderChart($("pub-chart"), per);
              }
            }, 150);
          });
        }
        $("pub-source").hidden = false;
      }
      renderList();
    }).catch(function (e) {
      console.error(e);
      $("pub-status").textContent =
        "Couldn’t load publications right now; see ORCID or Google Scholar above.";
    });
  }

  return { init: init, load: load, hIndex: hIndex };
})();
