// sitedata.js
// Parses, serialises and renders the editable .txt data files
// (links.txt, research.txt, projects.txt, about.txt, contact.txt).
// Used by index.html, plinks.html and admin.html.
//
// Record format (research/projects/about/contact):
//   [Title]            starts a new record
//   key: value         a field, only for the known keys below
//   anything else      body text (blank line = new paragraph)
//
// Links format (links.txt):
//   [Section]
//   Link name, https://url

var SiteData = (function () {

  var KEYS = ["icon", "image", "url", "urltext", "by"];
  var KEY_RE = new RegExp("^(" + KEYS.join("|") + ")\\s*:\\s*(.*)$", "i");

  function isHeader(line) {
    var t = line.trim();
    return t.length > 2 && t.charAt(0) === "[" && t.charAt(t.length - 1) === "]";
  }

  function newRecord(title) {
    return { title: title, fields: {}, body: "" };
  }

  function finishRecord(rec, bodyLines) {
    rec.body = bodyLines.join("\n").replace(/^\s*\n/, "").replace(/\s+$/, "");
    return rec;
  }

  function parseRecords(text) {
    var records = [];
    var rec = null;
    var body = [];
    text.replace(/\r\n?/g, "\n").split("\n").forEach(function (line) {
      if (isHeader(line)) {
        if (rec) records.push(finishRecord(rec, body));
        rec = newRecord(line.trim().slice(1, -1).trim());
        body = [];
        return;
      }
      if (!rec) {
        // content before the first header (e.g. about.txt)
        if (!line.trim()) return;
        rec = newRecord("");
      }
      var m = line.match(KEY_RE);
      if (m && body.join("").trim() === "") {
        rec.fields[m[1].toLowerCase()] = m[2].trim();
      } else {
        body.push(line.replace(/\s+$/, ""));
      }
    });
    if (rec) records.push(finishRecord(rec, body));
    return records;
  }

  function serializeRecords(records, keys) {
    return records.map(function (rec) {
      var lines = [];
      if (rec.title !== "" || records.length > 1) lines.push("[" + rec.title + "]");
      keys.forEach(function (k) {
        var v = (rec.fields[k] || "").trim();
        if (v) lines.push(k + ": " + v);
      });
      if (rec.body && rec.body.trim()) lines.push(rec.body.replace(/\s+$/, ""));
      return lines.join("\n");
    }).join("\n\n") + "\n";
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

  function renderResearch(records) {
    var html = '<div class="row">';
    records.forEach(function (r, i) {
      if (i > 0 && i % 4 === 0) html += '</div><br><div class="row">';
      var title = r.fields.url
        ? '<a href="' + esc(safeUrl(r.fields.url)) + '">' + esc(r.title) + "</a>"
        : esc(r.title);
      html += '<div class="col-md-3 col-sm-6"><div class="services"><div class="service-wrap">' +
        '<i class="' + esc(r.fields.icon || "pe-7s-science") + ' pe-dj pe-va"></i>' +
        "<h3>" + title + "</h3>" + paragraphs(r.body) +
        "</div></div></div>";
    });
    return html + "</div>";
  }

  function renderProjects(records) {
    return records.map(function (r) {
      var link = r.fields.url
        ? ' <a href="' + esc(safeUrl(r.fields.url)) + '" class="button">' +
          esc(r.fields.urltext || "Website") + "</a>"
        : "";
      return '<div class="col-md-4 col-sm-6 col-xs-12 item-space"><figure>' +
        '<img src="' + esc(r.fields.image || "") + '" alt="' + esc(r.title) + '">' +
        "<figcaption><h3>" + esc(r.title) + "</h3>" +
        "<span>" + esc(r.fields.by || "") + "</span>" + link +
        "</figcaption></figure></div>";
    }).join("");
  }

  function renderContact(records) {
    return records.map(function (r) {
      var text = inline(r.body);
      if (r.fields.url) text = '<a href="' + esc(safeUrl(r.fields.url)) + '">' + text + "</a>";
      return '<li><i class="' + esc(r.fields.icon || "pe-7s-info") + '"></i><span>' + text + "</span></li>";
    }).join("");
  }

  // no-cache: always revalidate so edits show up as soon as Pages rebuilds
  function load(path) {
    return fetch(path, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error(path + ": HTTP " + r.status);
      return r.text();
    });
  }

  return {
    KEYS: KEYS,
    parseRecords: parseRecords,
    serializeRecords: serializeRecords,
    parseLinks: parseLinks,
    serializeLinks: serializeLinks,
    esc: esc,
    safeUrl: safeUrl,
    paragraphs: paragraphs,
    renderResearch: renderResearch,
    renderProjects: renderProjects,
    renderContact: renderContact,
    load: load
  };
})();
