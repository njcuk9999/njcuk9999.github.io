// sitedata.js
// Parses, serialises and renders the editable .txt data files. Used by
// every page and by admin.html.
//
// Record format (research, projects, about, contact, social, news, talks,
// software, students, cv, clocks, settings):
//   [Title]            starts a new record
//   key: value         a field, only for the known keys below
//   key.fr: valeur     the French (or .es Spanish) version of a field;
//   title.fr: Titre    the title's translation is written the same way
//   anything else      body text (blank line = new paragraph)
//   --- fr ---         the rest of the record is the French body (or es)
// Anything without a translation falls back to the English.
//
// Links format (links.txt):
//   [Section]
//   Link name, https://url

var SiteData = (function () {

  var LANGS = ["en", "fr", "es"];
  var KEYS = ["icon", "image", "url", "urltext", "by", "date", "event", "place", "kind",
    "slides", "video", "repo", "docs", "role", "years", "status", "section", "when", "where",
    "zone", "lat", "lon", "goatcounter"];
  var KEY_RE = new RegExp("^((?:" + KEYS.join("|") + ")(?:\\.(?:fr|es))?|title\\.(?:fr|es))\\s*:\\s*(.*)$", "i");
  var LANG_RE = /^-{3,}\s*(fr|es)\s*-*\s*$/i;

  // admin.html stores unsaved edits here and opens a page with ?preview
  var PREVIEW = /[?&]preview(?:[=&]|$)/.test(location.search);
  var PREVIEW_PREFIX = "admin-preview:";

  function lang() { return window.I18n ? I18n.lang : "en"; }
  function t(key, vars) { return window.I18n ? I18n.t(key, vars) : key; }

  function isHeader(line) {
    var t = line.trim();
    return t.length > 2 && t.charAt(0) === "[" && t.charAt(t.length - 1) === "]";
  }

  function newRecord(title) {
    return { title: title, fields: {}, body: "", bodies: {} };
  }

  function clean(lines) {
    return lines.join("\n").replace(/^\s*\n/, "").replace(/\s+$/, "");
  }

  function parseRecords(text) {
    var records = [];
    var rec = null;
    var body = [];
    var other = {};
    var target = body;
    function finish() {
      rec.body = clean(body);
      Object.keys(other).forEach(function (l) {
        var b = clean(other[l]);
        if (b) rec.bodies[l] = b;
      });
      records.push(rec);
    }
    text.replace(/\r\n?/g, "\n").split("\n").forEach(function (line) {
      if (isHeader(line)) {
        if (rec) finish();
        rec = newRecord(line.trim().slice(1, -1).trim());
        body = []; other = {}; target = body;
        return;
      }
      if (!rec) {
        // content before the first header (e.g. about.txt)
        if (!line.trim()) return;
        rec = newRecord("");
      }
      var lm = line.match(LANG_RE);
      if (lm) {
        target = other[lm[1].toLowerCase()] = [];
        return;
      }
      var m = line.match(KEY_RE);
      if (m && target === body && body.join("").trim() === "") {
        rec.fields[m[1].toLowerCase()] = m[2].trim();
      } else {
        target.push(line.replace(/\s+$/, ""));
      }
    });
    if (rec) finish();
    return records;
  }

  function serializeRecords(records, keys) {
    return records.map(function (rec) {
      var lines = [];
      var f = rec.fields || {};
      if (rec.title !== "" || records.length > 1) lines.push("[" + rec.title + "]");
      LANGS.slice(1).forEach(function (l) {
        var v = (f["title." + l] || "").trim();
        if (v) lines.push("title." + l + ": " + v);
      });
      keys.forEach(function (k) {
        [k].concat(LANGS.slice(1).map(function (l) { return k + "." + l; })).forEach(function (kk) {
          var v = String(f[kk] || "").trim();
          if (v) lines.push(kk + ": " + v);
        });
      });
      if (rec.body && rec.body.trim()) lines.push(rec.body.replace(/\s+$/, ""));
      LANGS.slice(1).forEach(function (l) {
        var b = rec.bodies && rec.bodies[l];
        if (b && b.trim()) lines.push("", "--- " + l + " ---", b.replace(/\s+$/, ""));
      });
      return lines.join("\n");
    }).join("\n\n") + "\n";
  }

  // a record's text in the page language, falling back to English
  function tr(rec, key, l) {
    l = l || lang();
    var f = rec.fields || {};
    if (key === "body") return (l !== "en" && rec.bodies && rec.bodies[l]) || rec.body || "";
    if (key === "title") return (l !== "en" && f["title." + l]) || rec.title || "";
    return (l !== "en" && f[key + "." + l]) || f[key] || "";
  }

  function parseLinks(text) {
    var sections = [];
    var current = null;
    text.replace(/\r\n?/g, "\n").split("\n").forEach(function (line) {
      line = line.trim();
      if (!line) return;
      if (isHeader(line)) {
        current = { title: line.slice(1, -1).trim(), links: [] };
        sections.push(current);
        return;
      }
      if (!current) return;
      // split on the last ", " so link names may contain commas
      var i = line.lastIndexOf(", ");
      if (i < 0) return;
      current.links.push({ name: line.slice(0, i).trim(), url: line.slice(i + 2).trim() });
    });
    return sections;
  }

  function serializeLinks(sections) {
    return sections.map(function (s) {
      return ["[" + s.title + "]"].concat(s.links.map(function (l) {
        return l.name + ", " + l.url;
      })).join("\n");
    }).join("\n\n") + "\n";
  }

  // ------------------------------------------------------------------
  // rendering helpers
  // ------------------------------------------------------------------

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function safeUrl(url) {
    url = String(url || "").trim();
    return /^\s*(javascript|data|vbscript):/i.test(url) ? "#" : url;
  }

  // escaped text, single newlines -> <br>, [text](url) -> link
  function inline(text) {
    return esc(text)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, t, u) {
        return '<a href="' + esc(safeUrl(u)) + '">' + t + "</a>";
      })
      .replace(/\n/g, "<br>");
  }

  // blank lines -> separate paragraphs
  function paragraphs(text, cls) {
    var attr = cls ? ' class="' + cls + '"' : "";
    return String(text || "").split(/\n\s*\n/).filter(function (p) {
      return p.trim();
    }).map(function (p) {
      return "<p" + attr + ">" + inline(p.trim()) + "</p>";
    }).join("");
  }

  function link(url, html, cls) {
    return url
      ? '<a href="' + esc(safeUrl(url)) + '"' + (cls ? ' class="' + cls + '"' : "") + ">" + html + "</a>"
      : html;
  }

  function fmtDate(s) { return window.I18n ? I18n.date(s) : String(s || ""); }

  // newest first; records without a date go last
  function byDateDesc(records) {
    return records.slice().sort(function (a, b) {
      var x = a.fields.date || "", y = b.fields.date || "";
      return x < y ? 1 : x > y ? -1 : 0;
    });
  }

  function renderResearch(records) {
    return '<div class="row research-row">' + records.map(function (r) {
      var title = r.fields.url
        ? '<a class="stretch" href="' + esc(safeUrl(r.fields.url)) + '">' + esc(tr(r, "title")) + "</a>"
        : esc(tr(r, "title"));
      return '<div class="col-md-3 col-sm-6 col-xs-12 research-col"><div class="research-card">' +
        '<i class="' + esc(r.fields.icon || "pe-7s-science") + '"></i>' +
        "<h3>" + title + "</h3>" + paragraphs(tr(r, "body")) + "</div></div>";
    }).join("") + "</div>";
  }

  function renderProjects(records) {
    return records.map(function (r) {
      var link = r.fields.url
        ? ' <a href="' + esc(safeUrl(r.fields.url)) + '" class="button">' +
          esc(tr(r, "urltext") || t("projects.website")) + "</a>"
        : "";
      var by = tr(r, "by");
      return '<div class="col-md-4 col-sm-6 col-xs-12 item-space"><figure>' +
        '<img src="' + esc(r.fields.image || "") + '" alt="' + esc(tr(r, "title")) + '" loading="lazy" decoding="async">' +
        "<figcaption><h3>" + esc(tr(r, "title")) + "</h3>" +
        (by ? "<span>" + esc(t("projects.by", { by: by })) + "</span>" : "") + link +
        "</figcaption></figure></div>";
    }).join("");
  }

  function renderContact(records) {
    return records.map(function (r) {
      var text = inline(tr(r, "body"));
      if (r.fields.url) text = '<a href="' + esc(safeUrl(r.fields.url)) + '">' + text + "</a>";
      return '<li><i class="' + esc(r.fields.icon || "pe-7s-info") + '"></i><span>' + text + "</span></li>";
    }).join("");
  }

  function renderSocial(records) {
    return records.map(function (r) {
      return '<li class="social-icons"><a href="' + esc(safeUrl(r.fields.url)) + '" title="' + esc(r.title) +
        '" aria-label="' + esc(r.title) + '" data-img="' + esc(r.fields.image || "") + '"></a></li>';
    }).join("");
  }

  // news: a dated timeline, newest first
  function renderNews(records) {
    return byDateDesc(records).map(function (r) {
      return '<li class="news-item"><time class="news-date" datetime="' + esc(r.fields.date || "") + '">' +
        esc(fmtDate(r.fields.date)) + "</time>" +
        '<div class="news-body"><h3>' + link(r.fields.url, esc(tr(r, "title"))) + "</h3>" +
        paragraphs(tr(r, "body")) + "</div></li>";
    }).join("");
  }

  var TALK_ICONS = {
    talk: "pe-7s-micro", invited: "pe-7s-star", seminar: "pe-7s-study", colloquium: "pe-7s-study",
    poster: "pe-7s-note2", lecture: "pe-7s-study", workshop: "pe-7s-tools", outreach: "pe-7s-users", media: "pe-7s-film"
  };

  function renderTalks(records) {
    return byDateDesc(records).map(function (r) {
      var kind = (r.fields.kind || "talk").toLowerCase();
      var label = t("talks.kind." + kind);
      if (label === "talks.kind." + kind) label = r.fields.kind;
      var where = [tr(r, "event"), tr(r, "place")].filter(Boolean).map(esc).join(" · ");
      var buttons = [["slides", "talks.slides", "pe-7s-display1"], ["video", "talks.video", "pe-7s-play"],
        ["url", "talks.link", "pe-7s-link"]].filter(function (b) { return r.fields[b[0]]; }).map(function (b) {
        return '<a class="chip-btn" href="' + esc(safeUrl(r.fields[b[0]])) + '" target="_blank" rel="noopener">' +
          '<i class="' + b[2] + '"></i>' + esc(t(b[1])) + "</a>";
      }).join("");
      return '<li class="talk"><div class="talk-icon"><i class="' + (TALK_ICONS[kind] || "pe-7s-micro") + '"></i></div>' +
        '<div class="talk-body"><div class="talk-top"><time>' + esc(fmtDate(r.fields.date)) + "</time>" +
        '<span class="talk-kind">' + esc(label) + "</span></div>" +
        "<h3>" + esc(tr(r, "title")) + "</h3>" +
        (where ? '<div class="talk-where">' + where + "</div>" : "") +
        paragraphs(tr(r, "body"), "talk-text") +
        (buttons ? '<div class="talk-links">' + buttons + "</div>" : "") + "</div></li>";
    }).join("");
  }

  function repoOf(r) {
    return String(r.fields.repo || "").replace(/^https?:\/\/github\.com\//, "").replace(/\/+$/, "");
  }

  // software cards; GitHub numbers are filled in by enrichRepos()
  function renderSoftware(records) {
    return records.map(function (r) {
      var repo = repoOf(r);
      var buttons = (repo ? '<a class="chip-btn" href="https://github.com/' + esc(repo) +
        '" target="_blank" rel="noopener"><i class="pe-7s-science"></i>' + esc(t("sw.code")) + "</a>" : "") +
        (r.fields.docs ? '<a class="chip-btn" href="' + esc(safeUrl(r.fields.docs)) +
        '" target="_blank" rel="noopener"><i class="pe-7s-note2"></i>' + esc(t("sw.docs")) + "</a>" : "");
      return '<article class="sw-card"' + (repo ? ' data-repo="' + esc(repo) + '"' : "") + ">" +
        '<div class="sw-head"><h3>' + link(r.fields.docs || (repo && "https://github.com/" + repo), esc(tr(r, "title"))) + "</h3>" +
        (repo ? '<span class="sw-repo">' + esc(repo) + "</span>" : "") + "</div>" +
        paragraphs(tr(r, "body"), "sw-text") +
        '<div class="sw-stats"></div>' +
        (buttons ? '<div class="sw-links">' + buttons + "</div>" : "") + "</article>";
    }).join("");
  }

  var REPO_CACHE = "repos-v1";
  var REPO_MS = 6 * 60 * 60 * 1000;

  // stars / forks / language / latest release: from data/repos.json (saved
  // weekly by a GitHub Action), else live from the GitHub API, which allows
  // a visitor 60 requests an hour, so those are cached for 6 h
  function enrichRepos(root) {
    var cards = Array.prototype.slice.call(root.querySelectorAll(".sw-card[data-repo]"));
    if (!cards.length) return;
    var cache = {};
    try { cache = JSON.parse(localStorage.getItem(REPO_CACHE)) || {}; } catch (e) { cache = {}; }
    fetch("data/repos.json", { cache: "no-cache" }).then(function (r) {
      return r.ok ? r.json() : null;
    }).catch(function () { return null; }).then(function (snap) {
      var fresh = snap && Date.now() - Date.parse(snap.generated) < 10 * 864e5 ? snap.repos || {} : {};
      cards.forEach(function (card) { fillRepo(card, fresh[card.getAttribute("data-repo")], cache); });
    });
  }

  function fillRepo(card, saved, cache) {
    var repo = card.getAttribute("data-repo");
    var hit = saved || cache[repo];
    var got = hit && (saved || Date.now() - hit.time < REPO_MS) ? Promise.resolve(hit) : Promise.all([
      fetch("https://api.github.com/repos/" + repo).then(function (r) { return r.ok ? r.json() : null; }),
      fetch("https://api.github.com/repos/" + repo + "/releases/latest").then(function (r) { return r.ok ? r.json() : null; })
    ]).then(function (res) {
      var d = res[0], rel = res[1];
      if (!d) return null;
      var v = {
        time: Date.now(), stars: d.stargazers_count, forks: d.forks_count, lang: d.language,
        pushed: (d.pushed_at || "").slice(0, 10), tag: rel && rel.tag_name, relUrl: rel && rel.html_url
      };
      cache[repo] = v;
      try { localStorage.setItem(REPO_CACHE, JSON.stringify(cache)); } catch (e) { /* ignore */ }
      return v;
    });
    got.then(function (v) {
      if (!v) return;
      var bits = [];
      if (v.lang) bits.push('<span><i class="sw-lang-dot"></i>' + esc(v.lang) + "</span>");
      bits.push('<span><i class="pe-7s-star"></i>' + esc(t("sw.stars", { n: v.stars || 0 })) + "</span>");
      if (v.forks) bits.push('<span><i class="pe-7s-shuffle"></i>' + esc(t("sw.forks", { n: v.forks })) + "</span>");
      if (v.tag) bits.push('<span><i class="pe-7s-ribbon"></i>' + link(v.relUrl, esc(t("sw.release", { tag: v.tag }))) + "</span>");
      if (v.pushed) bits.push('<span><i class="pe-7s-refresh"></i>' + esc(t("sw.updated", { date: fmtDate(v.pushed) })) + "</span>");
      card.querySelector(".sw-stats").innerHTML = bits.join("");
    }).catch(function () { /* offline or rate limited: the card works without numbers */ });
  }

  function renderStudents(records) {
    var groups = { current: [], past: [] };
    records.forEach(function (r) {
      (String(r.fields.status || "").toLowerCase() === "past" ? groups.past : groups.current).push(r);
    });
    return ["current", "past"].filter(function (g) { return groups[g].length; }).map(function (g) {
      return '<h3 class="stu-group">' + esc(t("students." + g)) + '</h3><div class="stu-grid">' +
        groups[g].map(function (r) {
          var initials = r.title.split(/\s+/).map(function (w) { return w.charAt(0); }).join("").slice(0, 2).toUpperCase();
          return '<article class="stu-card">' +
            (r.fields.image
              ? '<img class="stu-photo" src="' + esc(r.fields.image) + '" alt="" loading="lazy">'
              : '<span class="stu-photo stu-initials">' + esc(initials) + "</span>") +
            '<div class="stu-body"><h4>' + link(r.fields.url, esc(r.title)) + "</h4>" +
            '<div class="stu-role">' + [tr(r, "role"), r.fields.years].filter(Boolean).map(esc).join(" · ") + "</div>" +
            paragraphs(tr(r, "body"), "stu-text") + "</div></article>";
        }).join("") + "</div>";
    }).join("");
  }

  // The original icons are 50x100 sprites (normal state on top, hover state
  // below). Any other image is shown whole and fades on hover instead.
  function fitSocialIcons(root) {
    Array.prototype.forEach.call(root.querySelectorAll("a[data-img]"), function (a) {
      var src = a.getAttribute("data-img");
      if (!src) return;
      a.style.backgroundImage = "url(" + JSON.stringify(src) + ")";
      var img = new Image();
      img.onload = function () {
        if (img.naturalHeight < 1.8 * img.naturalWidth) a.className += " social-plain";
      };
      img.src = src;
    });
  }

  // no-cache: always revalidate so edits show up as soon as Pages rebuilds
  function load(path) {
    if (PREVIEW) {
      try {
        var draft = localStorage.getItem(PREVIEW_PREFIX + path);
        if (draft !== null) return Promise.resolve(draft);
      } catch (e) { /* no drafts */ }
    }
    return fetch(path, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error(path + ": HTTP " + r.status);
      return r.text();
    });
  }

  // a missing or broken file gives no records
  function loadRecords(path) {
    return load(path).then(parseRecords, function () { return []; });
  }

  return {
    LANGS: LANGS,
    KEYS: KEYS,
    PREVIEW: PREVIEW,
    PREVIEW_PREFIX: PREVIEW_PREFIX,
    parseRecords: parseRecords,
    serializeRecords: serializeRecords,
    parseLinks: parseLinks,
    serializeLinks: serializeLinks,
    tr: tr,
    esc: esc,
    safeUrl: safeUrl,
    inline: inline,
    paragraphs: paragraphs,
    byDateDesc: byDateDesc,
    renderResearch: renderResearch,
    renderProjects: renderProjects,
    renderContact: renderContact,
    renderSocial: renderSocial,
    renderNews: renderNews,
    renderTalks: renderTalks,
    renderSoftware: renderSoftware,
    enrichRepos: enrichRepos,
    renderStudents: renderStudents,
    repoOf: repoOf,
    fitSocialIcons: fitSocialIcons,
    load: load,
    loadRecords: loadRecords
  };
})();
