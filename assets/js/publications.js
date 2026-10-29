// publications.js
// The Publications section of the home page (also used by cv.html and the
// admin "Publications" tab). Works come from the OpenAlex author profile,
// merged with the public ORCID record for anything OpenAlex lacks. Works
// listed in the hide file (edited from the admin page) are left out.
//
// OpenAlex data comes from data/publications.json when it is recent (a
// GitHub Action refreshes it weekly, adding ADS reads when it has an ADS
// token), else straight from the OpenAlex API.

var Publications = (function () {
  "use strict";

  var esc = SiteData.esc;
  var t = window.I18n ? I18n.t : function (k) { return k; };
  var num = window.I18n ? I18n.num : function (n) { return Number(n).toLocaleString(); };
  // where the list comes from (shared by every page and the admin page)
  var CONFIG = {
    orcid: "0000-0003-4166-4121",
    openalex: "A5078094363",
    hideFile: "publications-hide.txt",
    snapshot: "data/publications.json"
  };
  var CACHE_KEY = "pubs-oa-v2";
  var CACHE_MS = 12 * 60 * 60 * 1000;
  var SNAPSHOT_MAX_DAYS = 10;   // older than this, ask OpenAlex directly
  var PAGE = 8;            // papers shown before "Show all"
  var AUTHORS_SHOWN = 6;   // authors shown before "+N more"
  var BAR = "#d85a54";     // accent, deepened to pass 3:1 against #f7f7f8 (and the dark background)
  var OA_FIELDS = "id,doi,title,publication_date,publication_year,type,cited_by_count,counts_by_year,primary_location,authorships,biblio";

  var WORK_TYPES = {
    "journal-article": "Journal article", "article": "Journal article",
    "conference-paper": "Conference paper", "conference-abstract": "Conference abstract",
    "preprint": "Preprint", "book": "Book", "book-chapter": "Book chapter",
    "dissertation": "Thesis", "dissertation-thesis": "Thesis", "working-paper": "Working paper"
  };
  // OpenAlex records that aren't publications in their own right
  var SKIP_TYPES = { "dataset": 1, "erratum": 1, "paratext": 1, "peer-review": 1, "retraction": 1, "supplementary-materials": 1 };
  // repository copies, PDF mirrors and data-centre DOIs of papers that also have a journal DOI
  var MIRROR_DOI = /^10\.(48620|3929|5281|26093)\/|\/pdf$/;
  // when the same title appears more than once, keep the published version
  var TYPE_RANK = { "article": 4, "review": 4, "book-chapter": 3, "conference-paper": 3, "dissertation": 3, "book": 3, "preprint": 1 };

  // OpenAlex sometimes names a mirror (Springer Link, a university
  // repository, ...) as a paper's venue; the DOI prefix gives the journal
  var MIRROR_VENUE = /springer link|repository|cris|research data|arxiv|zenodo/i;
  var DOI_VENUES = [
    ["10.1051/0004-6361/", "Astronomy & Astrophysics"],
    ["10.1093/mnras/", "Monthly Notices of the Royal Astronomical Society"],
    ["10.3847/1538-3881/", "The Astronomical Journal"],
    ["10.3847/1538-4357/", "The Astrophysical Journal"],
    ["10.3847/2041-8213/", "The Astrophysical Journal Letters"],
    ["10.3847/psj/", "The Planetary Science Journal"],
    ["10.1088/1538-3873/", "Publications of the Astronomical Society of the Pacific"],
    ["10.1038/s41550-", "Nature Astronomy"],
    ["10.1038/s41586-", "Nature"],
    ["10.1117/12.", "Proceedings of the SPIE"]
  ];

  function venueFromDoi(doi) {
    for (var i = 0; i < DOI_VENUES.length; i++) {
      if (doi.indexOf(DOI_VENUES[i][0]) === 0) return DOI_VENUES[i][1];
    }
    return "";
  }

  function val(o) { return o && o.value; }

  function stripTags(s) { return String(s || "").replace(/<[^>]+>/g, ""); }

  function titleKey(t) { return stripTags(t).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60); }

  function cleanDoi(d) { return String(d || "").toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, ""); }

  // "10.48550/arxiv.2101.00001" or an arxiv.org URL -> "2101.00001"
  function arxivId(doi, url) {
    var m = String(doi || "").match(/^10\.48550\/arxiv\.(.+)$/i) ||
      String(url || "").match(/arxiv\.org\/(?:abs|pdf)\/([^?#]+?)(?:v\d+)?(?:\.pdf)?$/i);
    return m ? m[1] : "";
  }

  // is this author me? ID match first, name match as a fallback
  function isMe(a, cfg) {
    var oa = (a.author && a.author.id) || "";
    if (cfg.openalex && oa.slice(-cfg.openalex.length) === cfg.openalex) return true;
    var id = (a.author && a.author.orcid) || "";
    if (id && id.slice(-cfg.orcid.length) === cfg.orcid) return true;
    var name = a.raw_author_name || (a.author && a.author.display_name) || "";
    return /\bcook\b/i.test(name) && /\bn(eil)?\b/i.test(name);
  }

  function setAuthors(p, authors) {
    p.authors = authors;
    var first = authors[0];
    p.firstAuthor = !!first && (first.me || /\bcook$/i.test(first.name));
  }

  function oaAuthors(w, cfg) {
    return (w.authorships || []).map(function (a) {
      return { name: (a.author && a.author.display_name) || a.raw_author_name || "?", me: isMe(a, cfg) };
    });
  }

  // ------------------------------------------------------------------
  // sources
  // ------------------------------------------------------------------

  function getJson(url, headers) {
    return fetch(url, { headers: headers || {} }).then(function (r) {
      if (!r.ok) throw new Error(url.split("?")[0] + ": HTTP " + r.status);
      return r.json();
    });
  }

  function loadOrcid(cfg) {
    return getJson("https://pub.orcid.org/v3.0/" + cfg.orcid + "/works", { "Accept": "application/json" })
      .then(function (d) {
        return (d.group || []).map(function (g) {
          var w = g["work-summary"][0];
          var date = w["publication-date"] || {};
          var doi = ((w["external-ids"] || {})["external-id"] || []).filter(function (x) {
            return x["external-id-type"] === "doi";
          })[0];
          var arxiv = ((w["external-ids"] || {})["external-id"] || []).filter(function (x) {
            return x["external-id-type"] === "arxiv";
          })[0];
          return {
            source: "orcid",
            putCode: w["put-code"],
            title: val((w.title || {}).title) || "(untitled)",
            journal: val(w["journal-title"]) || "",
            venue: val(w["journal-title"]) || WORK_TYPES[w.type] || "",
            type: w.type,
            year: val(date.year) || "",
            sortKey: [val(date.year) || "0000", val(date.month) || "00", val(date.day) || "00"].join("-"),
            doi: doi ? cleanDoi(doi["external-id-value"]) : "",
            arxiv: arxiv ? String(arxiv["external-id-value"]).replace(/^arxiv:/i, "") : "",
            url: val(w.url) || (doi && val(doi["external-id-url"])) ||
              "https://orcid.org/" + cfg.orcid + "/work/" + w["put-code"],
            authors: null,
            firstAuthor: false,
            cites: null,
            citesByYear: null
          };
        });
      });
  }

  // one OpenAlex work, trimmed to what the pages need
  function trimWork(w, cfg) {
    var doi = cleanDoi(w.doi);
    var pl = w.primary_location || {};
    var venue = (pl.source && pl.source.display_name) || "";
    if (!venue || (doi && MIRROR_VENUE.test(venue) && w.type !== "preprint")) {
      venue = venueFromDoi(doi) || (MIRROR_VENUE.test(venue) ? "" : venue);
    }
    var b = w.biblio || {};
    var p = {
      source: "openalex",
      oaId: String(w.id || "").split("/").pop(),
      title: stripTags(w.title) || "(untitled)",
      venue: venue || WORK_TYPES[w.type] || "",
      type: w.type,
      year: String(w.publication_year || ""),
      sortKey: w.publication_date || String(w.publication_year || "0000"),
      doi: doi,
      arxiv: arxivId(doi, pl.landing_page_url),
      url: doi ? "https://doi.org/" + doi : (pl.landing_page_url || w.id),
      cites: w.cited_by_count || 0,
      citesByYear: (w.counts_by_year || []).map(function (c) { return [c.year, c.cited_by_count]; }),
      volume: b.volume || "", issue: b.issue || "",
      pages: b.first_page ? b.first_page + (b.last_page && b.last_page !== b.first_page ? "--" + b.last_page : "") : ""
    };
    setAuthors(p, oaAuthors(w, cfg));
    return p;
  }

  function cacheGet(cfg) {
    try {
      ["pubs-v1", "pubs-v2", "pubs-oa-v1"].forEach(function (k) { localStorage.removeItem(k); });  // earlier versions
      var c = JSON.parse(localStorage.getItem(CACHE_KEY));
      if (c && c.id === cfg.openalex && Date.now() - c.time < CACHE_MS) return c.data;
    } catch (e) { /* no cache */ }
    return null;
  }

  function cachePut(cfg, data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ id: cfg.openalex, time: Date.now(), data: data }));
    } catch (e) { /* storage full or blocked */ }
  }

  // the weekly snapshot, if it is for this author and recent enough
  function loadSnapshot(cfg) {
    if (!cfg.snapshot) return Promise.resolve(null);
    return fetch(cfg.snapshot, { cache: "no-cache" }).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (d) {
      if (!d || d.openalex !== cfg.openalex || !d.works) return null;
      if (Date.now() - Date.parse(d.generated) > SNAPSHOT_MAX_DAYS * 864e5) return null;
      return {
        works: d.works.map(function (w) { return trimWork(w, cfg); }),
        ads: d.ads || null, generated: d.generated
      };
    }).catch(function () { return null; });
  }

  // every work on the OpenAlex author profile (the full response is several
  // MB uncompressed, so only the fields needed are asked for)
  function loadLive(cfg) {
    var base = "https://api.openalex.org/works?per-page=200&filter=author.id:" + cfg.openalex + "&select=" + OA_FIELDS;
    var works = [];
    function page(cursor) {
      return getJson(base + "&cursor=" + encodeURIComponent(cursor)).then(function (d) {
        (d.results || []).forEach(function (w) { works.push(trimWork(w, cfg)); });
        var next = d.meta && d.meta.next_cursor;
        return next && d.results && d.results.length ? page(next) : works;
      });
    }
    return page("*").then(function (w) {
      return { works: w, ads: null, generated: new Date().toISOString() };
    });
  }

  // resolves {works, ads, generated}
  function loadOpenAlex(cfg) {
    var cached = cacheGet(cfg);
    if (cached) return Promise.resolve(cached);
    return loadSnapshot(cfg).then(function (snap) {
      return snap || loadLive(cfg);
    }).then(function (data) {
      cachePut(cfg, data);
      return data;
    });
  }

  // "Cook, N. J." -> "N. J. Cook"
  function flipName(n) {
    var m = String(n || "").match(/^([^,]+),\s*(.+)$/);
    return m ? m[2] + " " + m[1] : String(n || "?");
  }

  // ORCID-only works: use the contributor lists stored in the full ORCID
  // records, fetched in one bulk request
  function enrichFromOrcid(pubs, cfg) {
    var missing = pubs.filter(function (p) { return p.putCode && !p.authors; }).slice(0, 100);
    if (!missing.length) return Promise.resolve();
    return getJson("https://pub.orcid.org/v3.0/" + cfg.orcid + "/works/" +
      missing.map(function (p) { return p.putCode; }).join(","), { "Accept": "application/json" })
      .then(function (d) {
        var byCode = {};
        (d.bulk || []).forEach(function (b) { if (b.work) byCode[b.work["put-code"]] = b.work; });
        missing.forEach(function (p) {
          var w = byCode[p.putCode];
          var cs = ((w && w.contributors) || {}).contributor || [];
          var authors = cs.map(function (c) {
            var name = flipName(val(c["credit-name"]));
            var id = (c["contributor-orcid"] || {}).path;
            return { name: name, me: id === cfg.orcid || isMe({ raw_author_name: name }, cfg) };
          });
          if (authors.length) setAuthors(p, authors);
        });
      }, function (e) { console.error(e); });
  }

  // ORCID-only works with a DOI may still be in OpenAlex (e.g. filed under
  // another author profile): look them up by DOI for authors and citations
  function enrichByDoi(pubs, cfg) {
    var todo = pubs.filter(function (p) { return p.source === "orcid" && p.doi && !p.authors; }).slice(0, 50);
    if (!todo.length) return Promise.resolve();
    return getJson("https://api.openalex.org/works?per-page=50" +
      "&select=doi,cited_by_count,counts_by_year,authorships,biblio" +
      "&filter=doi:" + todo.map(function (p) { return encodeURIComponent(p.doi); }).join("|"))
      .then(function (d) {
        var byDoi = {};
        (d.results || []).forEach(function (w) { byDoi[cleanDoi(w.doi)] = w; });
        todo.forEach(function (p) {
          var w = byDoi[p.doi];
          if (!w) return;
          p.cites = w.cited_by_count || 0;
          p.citesByYear = (w.counts_by_year || []).map(function (c) { return [c.year, c.cited_by_count]; });
          setAuthors(p, oaAuthors(w, cfg));
        });
      }, function (e) { console.error(e); });
  }

  function rank(p) { return (TYPE_RANK[p.type] || 2) * 1e7 + (p.cites || 0); }

  // OpenAlex works, de-duplicated by title, plus ORCID works not found there
  function merge(oa, orcid) {
    var byTitle = {};
    oa.forEach(function (p) {
      if (SKIP_TYPES[p.type] || (p.doi && MIRROR_DOI.test(p.doi))) return;
      var k = titleKey(p.title);
      if (!k) return;
      var cur = byTitle[k];
      if (!cur) { byTitle[k] = p; return; }
      // keep the published version, but remember the preprint's arXiv ID
      var keep = rank(p) > rank(cur) ? p : cur;
      var drop = keep === p ? cur : p;
      keep.arxiv = keep.arxiv || drop.arxiv;
      byTitle[k] = keep;
    });
    var list = Object.keys(byTitle).map(function (k) { return byTitle[k]; });
    var byDoi = {};
    list.forEach(function (p) { if (p.doi) byDoi[p.doi] = p; });
    orcid.forEach(function (p) {
      var match = (p.doi && byDoi[p.doi]) || byTitle[titleKey(p.title)];
      if (match) {
        match.putCode = p.putCode;  // so it can also be hidden by ORCID put-code
        if (p.journal) match.venue = p.journal;
        match.arxiv = match.arxiv || p.arxiv;
      } else {
        list.push(p);
      }
    });
    list.forEach(function (p) {
      if (p.venue === "Astronomy and Astrophysics") p.venue = "Astronomy & Astrophysics";
    });
    return list;
  }

  // ADS numbers from the snapshot: {doi: [bibcode, reads, citations]}
  function attachAds(pubs, ads) {
    if (!ads) return;
    pubs.forEach(function (p) {
      var a = (p.doi && ads[p.doi]) || (p.arxiv && ads["arxiv:" + p.arxiv.toLowerCase()]);
      if (a) p.ads = { bibcode: a[0], reads: a[1] || 0, cites: a[2] || 0 };
    });
  }

  // hide file: one DOI, OpenAlex ID (W...) or "orcid:<put-code>" per line; # starts a comment
  function parseHidden(text) {
    var set = {};
    String(text || "").split(/\r?\n/).forEach(function (line) {
      var k = line.replace(/#.*/, "").trim().split(/\s+/)[0];
      if (k) set[cleanDoi(k)] = true;
    });
    return set;
  }

  function keyOf(p) {
    return p.doi || p.oaId || "orcid:" + p.putCode;
  }

  function isHidden(p, set) {
    return !!((p.doi && set[p.doi]) || (p.oaId && set[p.oaId.toLowerCase()]) ||
      (p.putCode && set["orcid:" + p.putCode]));
  }

  // resolves {pubs, enriched, ads, generated}; every work has .hidden set.
  // Either source failing still gives a list from the other.
  function load(cfg) {
    cfg = Object.assign({}, CONFIG, cfg || {});
    return Promise.all([
      cfg.openalex ? loadOpenAlex(cfg).catch(function (e) { console.error(e); return null; }) : null,
      loadOrcid(cfg).catch(function (e) { console.error(e); return []; }),
      cfg.hideFile ? SiteData.load(cfg.hideFile).then(parseHidden, function () { return {}; }) : {}
    ]).then(function (r) {
      var oa = r[0], orcid = r[1], hidden = r[2];
      if (!oa && !orcid.length) throw new Error("No publication source could be loaded");
      // copies, so the cached works aren't changed by the merge
      var pubs = oa ? merge(oa.works.map(function (p) { return Object.assign({}, p); }), orcid) : orcid;
      return enrichByDoi(pubs, cfg).then(function () {
        return enrichFromOrcid(pubs, cfg);
      }).then(function () {
        attachAds(pubs, oa && oa.ads);
        pubs.forEach(function (p) { p.hidden = isHidden(p, hidden); });
        return { pubs: pubs, enriched: !!oa, ads: !!(oa && oa.ads), generated: oa && oa.generated };
      });
    });
  }

  function newestFirst(a, b) { return a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0; }
  function mostCited(a, b) { return (b.cites || 0) - (a.cites || 0) || newestFirst(a, b); }

  // ------------------------------------------------------------------
  // links + BibTeX
  // ------------------------------------------------------------------

  function adsUrl(p) {
    if (p.ads && p.ads.bibcode) return "https://ui.adsabs.harvard.edu/abs/" + encodeURIComponent(p.ads.bibcode) + "/abstract";
    if (p.doi) return "https://ui.adsabs.harvard.edu/search/q=" + encodeURIComponent('doi:"' + p.doi + '"');
    if (p.arxiv) return "https://ui.adsabs.harvard.edu/search/q=" + encodeURIComponent('arXiv:"' + p.arxiv + '"');
    return "";
  }

  // "N. J. Cook" -> "Cook, N. J."
  function bibName(n) {
    n = String(n || "").trim();
    var i = n.lastIndexOf(" ");
    return i > 0 ? n.slice(i + 1) + ", " + n.slice(0, i) : n;
  }

  function bibEsc(s) {
    return String(s || "").replace(/\\/g, "\\textbackslash{}").replace(/([&%$#_{}])/g, "\\$1");
  }

  function bibKey(p, used) {
    var first = p.authors && p.authors[0] ? p.authors[0].name.split(" ").pop() : "Cook";
    var word = (stripTags(p.title).match(/[A-Za-z]{4,}/) || [""])[0];
    var key = (first.normalize ? first.normalize("NFD") : first).replace(/[^A-Za-z]/g, "") + (p.year || "") + word;
    var k = key, n = 1;
    while (used[k]) k = key + String.fromCharCode(96 + ++n);
    used[k] = true;
    return k;
  }

  function bibtex(p, used) {
    var type = /dissertation/.test(p.type) ? "phdthesis"
      : /conference|proceedings/.test(p.type) || /^10\.1117\//.test(p.doi) ? "inproceedings"
      : /article|review|letter/.test(p.type) ? "article" : "misc";
    var f = [["author", (p.authors || []).map(function (a) { return bibEsc(bibName(a.name)); }).join(" and ")],
      ["title", "{" + bibEsc(p.title) + "}"]];
    if (type === "article") f.push(["journal", bibEsc(p.venue)]);
    if (type === "inproceedings") f.push(["booktitle", bibEsc(p.venue)]);
    if (type === "phdthesis") f.push(["school", bibEsc(p.venue === "Thesis" ? "" : p.venue)]);
    f.push(["year", p.year], ["volume", p.volume], ["number", p.issue], ["pages", p.pages], ["doi", p.doi]);
    if (p.arxiv) f.push(["eprint", p.arxiv], ["archivePrefix", "arXiv"]);
    if (p.ads && p.ads.bibcode) f.push(["adsurl", "https://ui.adsabs.harvard.edu/abs/" + p.ads.bibcode]);
    if (!p.doi) f.push(["url", p.url]);
    return "@" + type + "{" + bibKey(p, used || {}) + ",\n" + f.filter(function (x) { return x[1]; }).map(function (x) {
      return "  " + x[0] + " = {" + x[1] + "}";
    }).join(",\n") + "\n}";
  }

  function download(name, text, type) {
    var url = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
    var a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
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

  function stats(pubs) {
    return {
      n: pubs.length,
      first: pubs.filter(function (p) { return p.firstAuthor; }).length,
      cites: pubs.reduce(function (n, p) { return n + (p.cites || 0); }, 0),
      h: hIndex(pubs),
      reads: pubs.reduce(function (n, p) { return n + ((p.ads && p.ads.reads) || 0); }, 0)
    };
  }

  function renderStats(pubs, enriched, ads) {
    var s = stats(pubs);
    var tiles = [["pub.stat.pubs", s.n]];
    if (enriched) {
      tiles.push(["pub.stat.first", s.first], ["pub.stat.cites", s.cites], ["pub.stat.h", s.h]);
      if (ads && s.reads) tiles.push(["pub.stat.reads", s.reads]);
    }
    return tiles.map(function (x) {
      return '<div class="pub-stat"><span class="pub-stat-num">' + num(x[1]) +
        '</span><span class="pub-stat-label">' + esc(t(x[0])) + "</span></div>";
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
        svg += '<text class="pub-chart-val" x="' + (x + bw / 2) + '" y="' + (y - 7) + '">' + num(d.n) + "</text>";
      }
      // label every year, or every other one (ending on the latest) when crowded
      if (slot >= 38 || (data.length - 1 - i) % 2 === 0) {
        svg += '<text class="pub-chart-year" x="' + (x + bw / 2) + '" y="' + (H - 7) + '">' + d.year + "</text>";
      }
      svg += '<rect class="pub-chart-hit" x="' + (padX + i * slot) + '" y="0" width="' + slot + '" height="' + base +
        '" tabindex="0" data-tip="' + esc(d.year + (d.year === thisYear ? " " + t("pub.chart.soFar") : "") + ": " +
        t("pub.citations", { n: d.n })) + '"/>';
    });
    svg += '<line class="pub-chart-base" x1="0" x2="' + W + '" y1="' + (base + 0.5) + '" y2="' + (base + 0.5) + '"/>';

    fig.innerHTML = "<figcaption>" + esc(t("pub.chart")) + "</figcaption>" +
      '<div class="pub-chart-wrap"><svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' +
      esc(t("pub.chart.label", { from: data[0].year, to: data[data.length - 1].year, peak: peak.n, year: peak.year })) +
      '">' + svg + '</svg><div class="pub-tip" hidden></div></div>' +
      '<table class="sr-only"><caption>' + esc(t("pub.chart")) + "</caption><tr><th>" + esc(t("pub.chart.year")) +
      "</th><th>" + esc(t("pub.stat.cites")) + "</th></tr>" +
      data.map(function (d) { return "<tr><td>" + d.year + "</td><td>" + d.n + "</td></tr>"; }).join("") +
      "</table>";

    var wrap = fig.querySelector(".pub-chart-wrap");
    var tip = fig.querySelector(".pub-tip");
    function show(e) {
      var el = e.target;
      if (!el.getAttribute || !el.getAttribute("data-tip")) return;
      var box = el.getBoundingClientRect(), outer = wrap.getBoundingClientRect();
      tip.textContent = el.getAttribute("data-tip");
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
      ' <button class="pub-authors-more" type="button">' + esc(t("pub.more", { n: authors.length - AUTHORS_SHOWN })) +
      "</button></div>";
  }

  function venueText(p) {
    if (p.venue === "Thesis") return t("pub.type.thesis");
    if (p.venue === "Preprint") return t("pub.type.preprint");
    return p.venue;
  }

  function renderItem(p, i) {
    var meta = [];
    if (p.venue) meta.push('<span class="pub-venue">' + esc(venueText(p)) + "</span>");
    if (p.cites) meta.push('<span class="pub-cites">' + esc(t("pub.citations", { n: p.cites })) + "</span>");
    if (p.firstAuthor) meta.push('<span class="pub-tag">' + esc(t("pub.first")) + "</span>");
    var links = [];
    var ads = adsUrl(p);
    if (ads) links.push('<a href="' + esc(ads) + '" target="_blank" rel="noopener">ADS</a>');
    if (p.arxiv) links.push('<a href="https://arxiv.org/abs/' + esc(p.arxiv) + '" target="_blank" rel="noopener">arXiv</a>');
    links.push('<button type="button" class="pub-cite">' + esc(t("pub.cite")) + "</button>");
    return '<li class="pub" data-i="' + i + '"><span class="pub-year">' + esc(p.year) + "</span>" +
      '<div class="pub-text"><a class="pub-title" href="' + esc(SiteData.safeUrl(p.url)) +
      '" target="_blank" rel="noopener">' + esc(p.title) + "</a>" +
      renderAuthors(p.authors, false) +
      (meta.length ? '<div class="pub-meta">' + meta.join('<span class="pub-dot">&middot;</span>') + "</div>" : "") +
      '<div class="pub-links">' + links.join("") + "</div>" +
      "</div></li>";
  }

  // ------------------------------------------------------------------
  // section wiring (home page)
  // ------------------------------------------------------------------

  // cfg: {orcid, openalex, hideFile, snapshot}, defaults to CONFIG
  function init(cfg) {
    var $ = function (id) { return document.getElementById(id); };
    var state = { pubs: [], filter: "all", sort: "new", all: false, q: "", year: "" };

    function visible() {
      var q = state.q.toLowerCase();
      var list = state.pubs.filter(function (p) {
        if (state.filter === "first" && !p.firstAuthor) return false;
        if (state.year && p.year !== state.year) return false;
        if (!q) return true;
        if (!p._text) {
          p._text = (p.title + " " + p.venue + " " + p.year + " " + p.doi + " " + p.arxiv + " " +
            (p.authors || []).map(function (a) { return a.name; }).join(" ")).toLowerCase();
        }
        return q.split(/\s+/).every(function (w) { return p._text.indexOf(w) >= 0; });
      });
      return list.slice().sort(state.sort === "cited" ? mostCited : newestFirst);
    }

    function renderList() {
      var list = visible();
      var narrowed = state.q || state.year;
      var shown = state.all || narrowed ? list : list.slice(0, PAGE);
      $("pub-list").innerHTML = shown.length
        ? shown.map(function (p) { return renderItem(p, state.pubs.indexOf(p)); }).join("")
        : '<li class="pub-none">' + esc(t("pub.none")) + "</li>";
      var more = $("pub-more");
      more.hidden = shown.length >= list.length;
      more.textContent = t("common.showAll", { n: list.length });
      Array.prototype.forEach.call(document.querySelectorAll("#pub-toolbar [data-filter], #pub-toolbar [data-sort]"), function (b) {
        var on = b.getAttribute("data-filter") === state.filter || b.getAttribute("data-sort") === state.sort;
        b.className = "pub-pill" + (on ? " is-active" : "");
        b.setAttribute("aria-pressed", String(on));
      });
    }

    $("pub-toolbar").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      if (b.id === "pub-export") {
        var used = {};
        download("cook-publications.bib", visible().map(function (p) { return bibtex(p, used); }).join("\n\n") + "\n",
          "application/x-bibtex");
        return;
      }
      if (b.getAttribute("data-filter")) state.filter = b.getAttribute("data-filter");
      if (b.getAttribute("data-sort")) state.sort = b.getAttribute("data-sort");
      renderList();
    });
    var timer = null;
    $("pub-q").addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(function () { state.q = $("pub-q").value.trim(); renderList(); }, 120);
    });
    $("pub-year").addEventListener("change", function () { state.year = $("pub-year").value; renderList(); });
    $("pub-more").addEventListener("click", function () { state.all = true; renderList(); });
    $("pub-list").addEventListener("click", function (e) {
      var item = e.target.closest(".pub");
      if (!item) return;
      var p = state.pubs[+item.getAttribute("data-i")];
      if (e.target.classList.contains("pub-authors-more")) {
        e.target.parentNode.outerHTML = renderAuthors(p.authors, true);
      } else if (e.target.classList.contains("pub-cite")) {
        var open = item.querySelector(".pub-bib");
        if (open) { open.remove(); return; }
        var box = document.createElement("div");
        box.className = "pub-bib";
        box.innerHTML = '<pre tabindex="0"></pre><button type="button" class="pub-copy">' + esc(t("pub.copy")) + "</button>";
        box.querySelector("pre").textContent = bibtex(p);
        item.querySelector(".pub-text").appendChild(box);
      } else if (e.target.classList.contains("pub-copy")) {
        var text = e.target.previousSibling.textContent;
        (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () {
          e.target.textContent = t("pub.copied");
        }, function () {
          var r = document.createRange();
          r.selectNodeContents(e.target.previousSibling);
          getSelection().removeAllRanges();
          getSelection().addRange(r);
        });
      }
    });

    load(cfg).then(function (r) {
      var pubs = r.pubs.filter(function (p) { return !p.hidden; });
      state.pubs = pubs;
      $("pub-status").hidden = true;
      $("pub-stats").innerHTML = renderStats(pubs, r.enriched, r.ads);
      $("pub-stats").hidden = false;
      var s = stats(pubs);
      $("pub-count-all").textContent = num(s.n);
      $("pub-count-first").textContent = num(s.first);
      var years = {};
      pubs.forEach(function (p) { if (p.year) years[p.year] = true; });
      Object.keys(years).sort().reverse().forEach(function (y) {
        var o = document.createElement("option");
        o.value = o.textContent = y;
        $("pub-year").appendChild(o);
      });
      $("pub-toolbar").hidden = false;
      if (r.enriched) {
        var per = citesPerYear(pubs);
        if (per.length > 1) {
          $("pub-chart").hidden = false;
          renderChart($("pub-chart"), per);
          var lastW = $("pub-chart").clientWidth, rt = null;
          window.addEventListener("resize", function () {
            clearTimeout(rt);
            rt = setTimeout(function () {
              if ($("pub-chart").clientWidth !== lastW) {
                lastW = $("pub-chart").clientWidth;
                renderChart($("pub-chart"), per);
              }
            }, 150);
          });
        }
        $("pub-source").innerHTML = t("pub.source") +
          (r.generated ? " " + esc(t("pub.updated", { date: I18n.date(r.generated.slice(0, 10)) })) : "");
        $("pub-source").hidden = false;
      }
      renderList();
    }).catch(function (e) {
      console.error(e);
      $("pub-status").textContent = t("pub.error");
    });
  }

  return {
    CONFIG: CONFIG, init: init, load: load, keyOf: keyOf,
    parseHidden: parseHidden, isHidden: isHidden, hIndex: hIndex, stats: stats,
    bibtex: bibtex, adsUrl: adsUrl, newestFirst: newestFirst, mostCited: mostCited
  };
})();
