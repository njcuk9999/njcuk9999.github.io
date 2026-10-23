// admin.js
// Edits the site's .txt data files and commits them to GitHub through the
// REST API, authenticated with a fine-grained personal access token.

(function () {
  "use strict";

  var OWNER = "njcuk9999";
  var REPO = "njcuk9999.github.io";
  var BRANCH = "main";
  var ADMIN = "njcuk9999";
  var IMAGE_DIR = "assets/images/";
  var TOKEN_KEY = "gh_admin_token";
  var MAX_IMAGE_BYTES = 10 * 1024 * 1024;

  var token = null;
  var icons = [];
  // local previews for images uploaded this session (Pages needs a minute to publish them)
  var previews = {};

  // ------------------------------------------------------------------
  // small helpers
  // ------------------------------------------------------------------

  function $(id) { return document.getElementById(id); }

  function h(tag, attrs) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else if (k === "class") el.className = v;
      else if (k === "value" || k === "checked") el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    });
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  function append(el, kid) {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach(function (k) { append(el, k); }); return; }
    el.appendChild(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }

  function setStatus(el, msg, kind) {
    el.textContent = msg || "";
    el.className = "status" + (kind ? " " + kind : "");
  }

  function utf8ToB64(str) {
    return bytesToB64(new TextEncoder().encode(str));
  }

  function bytesToB64(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }

  function b64ToUtf8(b64) {
    var bin = atob(b64.replace(/\s/g, ""));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  // ------------------------------------------------------------------
  // GitHub API
  // ------------------------------------------------------------------

  function api(path, opts) {
    opts = opts || {};
    var headers = {
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Authorization": "Bearer " + token
    };
    if (opts.body) headers["Content-Type"] = "application/json";
    return fetch("https://api.github.com" + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: "no-store"
    }).then(function (r) {
      return r.text().then(function (t) {
        var data = null;
        try { data = t ? JSON.parse(t) : null; } catch (e) { data = t; }
        if (!r.ok) {
          var err = new Error((data && data.message) || ("HTTP " + r.status));
          err.status = r.status;
          throw err;
        }
        return data;
      });
    });
  }

  function contentsPath(path) {
    return "/repos/" + OWNER + "/" + REPO + "/contents/" +
      path.split("/").map(encodeURIComponent).join("/");
  }

  // resolves {text, sha}; a missing file gives empty text and sha null
  function getFile(path) {
    return api(contentsPath(path) + "?ref=" + BRANCH).then(function (d) {
      return { text: b64ToUtf8(d.content || ""), sha: d.sha };
    }, function (e) {
      if (e.status === 404) return { text: "", sha: null };
      throw e;
    });
  }

  function fileExists(path) {
    return api(contentsPath(path) + "?ref=" + BRANCH).then(
      function () { return true; },
      function (e) { if (e.status === 404) return false; throw e; });
  }

  function putFile(path, b64, sha, message) {
    var body = { message: message, content: b64, branch: BRANCH };
    if (sha) body.sha = sha;
    return api(contentsPath(path), { method: "PUT", body: body }).then(function (d) {
      return d.content.sha;
    });
  }

  function explain(e) {
    if (e.status === 401) return "GitHub rejected the token (expired or revoked?). Log out and in again.";
    if (e.status === 403 || e.status === 404) {
      return "No write access: the token needs 'Contents: Read and write' on " + REPO + ". (" + e.message + ")";
    }
    if (e.status === 409 || e.status === 422) {
      return "The file changed on GitHub since you opened it. Copy anything you need from raw text, then Discard & reload. (" + e.message + ")";
    }
    return e.message || String(e);
  }

  // ------------------------------------------------------------------
  // login
  // ------------------------------------------------------------------

  function storedToken() {
    try {
      return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
    } catch (e) { return null; }
  }

  function storeToken(t, remember) {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
      if (t) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, t);
    } catch (e) { /* storage blocked: stay logged in for this page only */ }
  }

  function login(t, remember) {
    token = t;
    return api("/user").then(function (user) {
      if (String(user.login).toLowerCase() !== ADMIN) {
        throw new Error("This token belongs to '" + user.login + "', not " + ADMIN + ".");
      }
      storeToken(t, remember);
      $("who").textContent = "Logged in as " + user.login;
      $("login-view").hidden = true;
      $("main-view").hidden = false;
      selectTab(tabs[0]);
    }).catch(function (e) {
      token = null;
      storeToken(null);
      throw e;
    });
  }

  function showLogin(msg) {
    $("main-view").hidden = true;
    $("login-view").hidden = false;
    setStatus($("login-status"), msg || "", msg ? "err" : "");
  }

  $("login-btn").addEventListener("click", function () {
    var t = $("token").value.trim();
    if (!t) return setStatus($("login-status"), "Paste your token first.", "err");
    setStatus($("login-status"), "Checking token...");
    login(t, $("remember").checked).catch(function (e) {
      setStatus($("login-status"), e.status === 401 ? "GitHub rejected that token." : explain(e), "err");
    });
  });
  $("token").addEventListener("keydown", function (e) {
    if (e.key === "Enter") $("login-btn").click();
  });

  $("logout-btn").addEventListener("click", function () {
    if (anyDirty() && !confirm("You have unsaved changes. Log out anyway?")) return;
    token = null;
    storeToken(null);
    tabs.forEach(function (t) { t.state = null; });
    $("token").value = "";
    showLogin();
  });

  window.addEventListener("beforeunload", function (e) {
    if (anyDirty()) { e.preventDefault(); e.returnValue = ""; }
  });

  // ------------------------------------------------------------------
  // generic editor widgets
  // ------------------------------------------------------------------

  // text input bound to obj[key]
  function bound(obj, key, attrs, tag) {
    attrs = Object.assign({}, attrs);
    var onchange = attrs.oninput;
    delete attrs.oninput;
    var el = h(tag || "input", Object.assign({ type: tag ? null : "text", value: obj[key] || "" }, attrs));
    el.addEventListener("input", function () {
      obj[key] = el.value;
      markDirty();
      if (onchange) onchange(el.value);
    });
    return el;
  }

  function field(label, input) {
    return h("div", null, h("label", { class: "f" }, label), input);
  }

  function moveButtons(list, i) {
    function move(d) {
      var j = i + d;
      if (j < 0 || j >= list.length) return;
      var tmp = list[i]; list[i] = list[j]; list[j] = tmp;
      markDirty(); render();
    }
    return [
      h("button", { class: "icon", title: "Move up", disabled: i === 0, onclick: function () { move(-1); } }, "↑"),
      h("button", { class: "icon", title: "Move down", disabled: i === list.length - 1, onclick: function () { move(1); } }, "↓"),
      h("button", { class: "icon danger", title: "Delete", onclick: function () {
        list.splice(i, 1); markDirty(); render();
      } }, "✕")
    ];
  }

  // a list of record cards with move/delete and an add button
  function recordList(list, itemBody, makeNew, addLabel) {
    return h("div", null,
      list.map(function (rec, i) {
        var title = h("span", { class: "title" }, rec.title || "(untitled)");
        return h("div", { class: "item" },
          h("div", { class: "item-head" }, title, moveButtons(list, i)),
          itemBody(rec, function (t) { title.textContent = t || "(untitled)"; }));
      }),
      h("button", { onclick: function () {
        list.push(makeNew()); markDirty(); render();
      } }, "+ " + addLabel));
  }

  function iconPicker(fields) {
    var btn = h("button", { class: "iconbtn", type: "button" });
    function paint() {
      btn.innerHTML = "";
      append(btn, [h("i", { class: fields.icon || "pe-7s-help1" }), fields.icon || "Choose icon"]);
    }
    paint();
    btn.addEventListener("click", function () {
      openIconModal(fields.icon, function (name) {
        fields.icon = name; markDirty(); paint();
      });
    });
    return btn;
  }

  function imageField(fields) {
    var img = h("img", { alt: "" });
    function preview() {
      img.src = previews[fields.image] || fields.image || "";
    }
    var path = bound(fields, "image", { placeholder: IMAGE_DIR + "picture.jpg", oninput: preview });
    var status = h("div", { class: "status small" });
    var file = h("input", { type: "file", accept: "image/*", hidden: true });
    file.addEventListener("change", function () {
      var f = file.files[0];
      file.value = "";
      if (!f) return;
      setStatus(status, "Uploading " + f.name + "...");
      uploadImage(f).then(function (p) {
        fields.image = p;
        path.value = p;
        markDirty();
        preview();
        setStatus(status, "Uploaded to " + p + ". Remember to save.", "ok");
      }).catch(function (e) {
        setStatus(status, "Upload failed: " + explain(e), "err");
      });
    });
    preview();
    return h("div", { class: "imgfield" }, img,
      h("div", { class: "grow" },
        path,
        h("div", { class: "row", style: "margin-top:6px" },
          h("button", { type: "button", onclick: function () { file.click(); } }, "Upload new image..."),
          file),
        status));
  }

  function uploadImage(f) {
    if (f.size > MAX_IMAGE_BYTES) {
      return Promise.reject(new Error("Image is over 10 MB; please shrink it first."));
    }
    var dot = f.name.lastIndexOf(".");
    var base = (dot > 0 ? f.name.slice(0, dot) : f.name).replace(/[^A-Za-z0-9_-]+/g, "_") || "image";
    var ext = (dot > 0 ? f.name.slice(dot) : "").toLowerCase().replace(/[^.a-z0-9]/g, "");
    return f.arrayBuffer().then(function (buf) {
      var b64 = bytesToB64(new Uint8Array(buf));
      // never overwrite an existing image: add -1, -2, ... until the name is free
      function tryName(n) {
        var p = IMAGE_DIR + base + (n ? "-" + n : "") + ext;
        return fileExists(p).then(function (exists) {
          return exists ? tryName(n + 1) : p;
        });
      }
      return tryName(0).then(function (p) {
        return putFile(p, b64, null, "Upload " + p + " via admin page").then(function () {
          previews[p] = URL.createObjectURL(f);
          return p;
        });
      });
    });
  }

  // ------------------------------------------------------------------
  // icon picker modal
  // ------------------------------------------------------------------

  var iconCallback = null;
  var iconCurrent = null;

  function loadIcons() {
    return fetch("assets/font_icon/css/pe-icon-7-stroke.css").then(function (r) { return r.text(); })
      .then(function (css) {
        var seen = {};
        var re = /\.(pe-7s-[a-z0-9-]+):before/g, m;
        while ((m = re.exec(css))) seen[m[1]] = true;
        icons = Object.keys(seen).sort();
      }).catch(function () { icons = []; });
  }

  function paintIcons() {
    var q = $("icon-filter").value.trim().toLowerCase();
    var grid = $("icon-grid");
    grid.innerHTML = "";
    icons.filter(function (n) { return n.indexOf(q) >= 0; }).forEach(function (n) {
      append(grid, h("button", {
        class: n === iconCurrent ? "sel" : "", title: n,
        onclick: function () { closeIconModal(); iconCallback(n); }
      }, h("i", { class: n }), n.replace("pe-7s-", "")));
    });
  }

  function openIconModal(current, cb) {
    iconCurrent = current;
    iconCallback = cb;
    $("icon-filter").value = "";
    $("icon-modal").hidden = false;
    paintIcons();
    $("icon-filter").focus();
  }

  function closeIconModal() { $("icon-modal").hidden = true; }

  $("icon-filter").addEventListener("input", paintIcons);
  $("icon-close").addEventListener("click", closeIconModal);
  $("icon-modal").addEventListener("click", function (e) {
    if (e.target === $("icon-modal")) closeIconModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeIconModal();
  });

  // ------------------------------------------------------------------
  // the editable files
  // ------------------------------------------------------------------

  function records(keys) {
    return {
      parse: SiteData.parseRecords,
      serialize: function (m) { return SiteData.serializeRecords(m, keys); },
      validate: function (m) {
        for (var i = 0; i < m.length; i++) {
          if (!m[i].title.trim()) return "Item " + (i + 1) + " needs a title.";
        }
      }
    };
  }

  var tabs = [
    Object.assign({
      id: "research", label: "Links to research", path: "research.txt",
      help: "The icon cards in the 'Links to research' section of the home page.",
      editor: function (m) {
        return recordList(m, function (rec, retitle) {
          return h("div", null,
            h("div", { class: "grid2" },
              field("Title", bound(rec, "title", { oninput: retitle })),
              field("Link (URL)", bound(rec.fields, "url", { type: "url", placeholder: "https://" }))),
            field("Icon", iconPicker(rec.fields)),
            field("Description", bound(rec, "body", { rows: 2 }, "textarea")));
        }, function () {
          return { title: "New link", fields: { icon: "pe-7s-science", url: "" }, body: "" };
        }, "Add research link");
      }
    }, records(["icon", "url"])),

    Object.assign({
      id: "projects", label: "Projects", path: "projects.txt",
      help: "The image tiles in 'Projects I work on' on the home page. Every tile has the shape of a " +
        "400x311 image; other images are scaled to fill it and cropped evenly around the centre.",
      editor: function (m) {
        return recordList(m, function (rec, retitle) {
          return h("div", null,
            h("div", { class: "grid2" },
              field("Title", bound(rec, "title", { oninput: retitle })),
              field("By", bound(rec.fields, "by")),
              field("Link (URL)", bound(rec.fields, "url", { type: "url", placeholder: "https://" })),
              field("Link text", bound(rec.fields, "urltext", { placeholder: "Website" }))),
            field("Image", imageField(rec.fields)));
        }, function () {
          return { title: "New project", fields: { image: "", by: "", url: "", urltext: "Website" }, body: "" };
        }, "Add project");
      }
    }, records(["image", "by", "url", "urltext"])),

    {
      id: "about", label: "About me", path: "about.txt",
      help: "Blank line = new paragraph. Links can be written as [text](https://...).",
      parse: function (t) {
        var r = SiteData.parseRecords(t)[0] || { fields: {}, body: "" };
        return { title: "", fields: { image: r.fields.image || "" }, body: r.body };
      },
      serialize: function (m) { return SiteData.serializeRecords([m], ["image"]); },
      editor: function (m) {
        return h("div", { class: "item" },
          field("Photo", imageField(m.fields)),
          field("Text", bound(m, "body", { rows: 18 }, "textarea")));
      }
    },

    Object.assign({
      id: "contact", label: "Contact", path: "contact.txt",
      help: "Lines in the Contact section. The label is only shown here, not on the site. " +
        "The 'Drop me a line' form sends to the first email line.",
      editor: function (m) {
        return recordList(m, function (rec, retitle) {
          return h("div", null,
            h("div", { class: "grid2" },
              field("Label (admin only)", bound(rec, "title", { oninput: retitle })),
              field("Link (optional URL, mailto:, tel:)", bound(rec.fields, "url"))),
            field("Icon", iconPicker(rec.fields)),
            field("Text (new line = line break)", bound(rec, "body", { rows: 3 }, "textarea")));
        }, function () {
          return { title: "New contact line", fields: { icon: "pe-7s-info", url: "" }, body: "" };
        }, "Add contact line");
      }
    }, records(["icon", "url"])),

    Object.assign({
      id: "social", label: "Social icons", path: "social.txt",
      help: "Round icons at the top and bottom of the home page. Images can be 50x100 sprites " +
        "(normal on top, hover underneath, like the originals) or any square image.",
      editor: function (m) {
        return recordList(m, function (rec, retitle) {
          return h("div", null,
            h("div", { class: "grid2" },
              field("Name (tooltip)", bound(rec, "title", { oninput: retitle })),
              field("Link (URL)", bound(rec.fields, "url", { type: "url", placeholder: "https://" }))),
            field("Icon image", imageField(rec.fields)));
        }, function () {
          return { title: "New profile", fields: { image: "", url: "" }, body: "" };
        }, "Add social icon");
      }
    }, records(["image", "url"])),

    {
      id: "publications", label: "Publications", path: Publications.CONFIG.hideFile,
      help: "Every work found on your OpenAlex profile and ORCID record. Untick anything that isn't " +
        "yours or that you don't want listed; it's saved to the hide list. Add missing papers in " +
        "ORCID or OpenAlex, not here.",
      parse: function (t) { return { hidden: Publications.parseHidden(t), q: "" }; },
      serialize: function (m) {
        var byKey = {};
        (pubWorks || []).forEach(function (p) { byKey[Publications.keyOf(p).toLowerCase()] = p; });
        return "# Publications hidden from the home page. Edit from admin.html (Publications tab).\n" +
          "# One DOI, OpenAlex work ID (W...) or orcid:<put-code> per line; text after # is ignored.\n" +
          Object.keys(m.hidden).sort().map(function (k) {
            var p = byKey[k];
            return k + (p ? "  # " + p.year + " " + p.title.replace(/\s+/g, " ") : "");
          }).join("\n") + "\n";
      },
      editor: publicationsEditor
    },

    {
      id: "links", label: "Links page", path: "links.txt",
      help: "Sections and links on plinks.html.",
      parse: SiteData.parseLinks,
      serialize: SiteData.serializeLinks,
      validate: function (m) {
        for (var i = 0; i < m.length; i++) {
          if (!m[i].title.trim()) return "Section " + (i + 1) + " needs a title.";
          m[i].links = m[i].links.filter(function (l) { return l.name.trim() || l.url.trim(); });
          for (var j = 0; j < m[i].links.length; j++) {
            var l = m[i].links[j];
            if (!l.name.trim() || !l.url.trim()) {
              return "In '" + m[i].title + "', every link needs both a name and a URL.";
            }
          }
        }
      },
      editor: function (m) {
        return h("div", null,
          m.map(function (sec, i) {
            var title = h("span", { class: "title" }, sec.title);
            return h("div", { class: "item section" },
              h("div", { class: "item-head" }, title, moveButtons(m, i)),
              field("Section title", bound(sec, "title", { oninput: function (v) { title.textContent = v; } })),
              h("label", { class: "f" }, "Links (" + sec.links.length + ")"),
              sec.links.map(function (l, j) {
                return h("div", { class: "linkrow" },
                  bound(l, "name", { placeholder: "Name" }),
                  bound(l, "url", { type: "url", placeholder: "https://" }),
                  h("div", { class: "row" }, moveButtons(sec.links, j)));
              }),
              h("button", { onclick: function () {
                sec.links.push({ name: "", url: "" }); markDirty(); render();
              } }, "+ Add link"));
          }),
          h("button", { onclick: function () {
            m.push({ title: "New section", links: [] }); markDirty(); render();
          } }, "+ Add section"));
      }
    }
  ];

  // ------------------------------------------------------------------
  // publications hide list
  // ------------------------------------------------------------------

  // every work from the sources, loaded once per session
  var pubWorks = null;

  function publicationsEditor(m) {
    var box = h("div", null, h("p", { class: "status" }, "Loading works from OpenAlex and ORCID..."));
    var cfg = { orcid: Publications.CONFIG.orcid, openalex: Publications.CONFIG.openalex };
    (pubWorks ? Promise.resolve(pubWorks) : Publications.load(cfg).then(function (r) {
      pubWorks = r.pubs.sort(function (a, b) { return a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0; });
      return pubWorks;
    })).then(function (works) {
      box.innerHTML = "";
      var count = h("span", { class: "muted small" });
      var list = h("div");
      function paintCount() {
        var n = works.filter(function (p) { return Publications.isHidden(p, m.hidden); }).length;
        count.textContent = (works.length - n) + " shown on the site, " + n + " hidden";
      }
      function paintList() {
        var q = m.q.trim().toLowerCase();
        list.innerHTML = "";
        works.filter(function (p) {
          return !q || (p.title + " " + p.venue + " " + p.year).toLowerCase().indexOf(q) >= 0;
        }).forEach(function (p) {
          var shown = !Publications.isHidden(p, m.hidden);
          var tick = h("input", { type: "checkbox", checked: shown, title: "Show on the site" });
          var row = h("label", { class: "pubrow" + (shown ? "" : " is-hidden") }, tick,
            h("span", { class: "pubyear" }, p.year),
            h("span", { class: "grow" },
              h("span", { class: "pubtitle" }, p.title),
              h("span", { class: "muted small" }, [p.venue, p.type === "article" || p.type === "journal-article" ? null : p.type,
                (p.cites || 0) + " citations",
                p.source === "orcid" ? "ORCID only" : null].filter(Boolean).join(" · "))));
          tick.addEventListener("change", function () {
            if (tick.checked) {
              [p.doi, p.oaId && p.oaId.toLowerCase(), p.putCode && "orcid:" + p.putCode].forEach(function (k) {
                if (k) delete m.hidden[k];
              });
            } else {
              m.hidden[Publications.keyOf(p).toLowerCase()] = true;
            }
            row.className = "pubrow" + (tick.checked ? "" : " is-hidden");
            markDirty();
            paintCount();
          });
          append(list, row);
        });
      }
      // searching isn't an edit, so this input isn't bound()
      var search = h("input", { type: "text", class: "grow", value: m.q, placeholder: "Search titles, journals, years" });
      search.addEventListener("input", function () { m.q = search.value; paintList(); });
      append(box, h("div", { class: "row", style: "margin-bottom:10px" }, search, count));
      append(box, list);
      paintCount();
      paintList();
    }).catch(function (e) {
      box.innerHTML = "";
      append(box, h("p", { class: "status err" }, "Couldn't load publications: " + (e.message || e)));
    });
    return box;
  }

  // ------------------------------------------------------------------
  // tab state, rendering, save / reload
  // ------------------------------------------------------------------

  var current = null;

  function anyDirty() {
    return tabs.some(function (t) { return t.state && t.state.dirty; });
  }

  function markDirty() {
    if (!current || !current.state || current.state.dirty) return;
    current.state.dirty = true;
    paintTabs();
    setStatus($("status"), "Unsaved changes", "warn");
  }

  function paintTabs() {
    var nav = $("tabs");
    nav.innerHTML = "";
    tabs.forEach(function (t) {
      append(nav, h("button", {
        class: t === current ? "active" : "",
        onclick: function () { selectTab(t); }
      }, t.label, t.state && t.state.dirty ? h("span", { class: "dot" }, " ●") : null));
    });
  }

  function selectTab(t) {
    current = t;
    paintTabs();
    $("tab-help").textContent = t.help + " Stored in " + t.path + ".";
    if (t.state) { render(); return; }
    load(t);
  }

  function load(t) {
    t.state = null;
    $("editor").innerHTML = "";
    setStatus($("status"), "Loading " + t.path + "...");
    getFile(t.path).then(function (f) {
      t.state = { model: t.parse(f.text), sha: f.sha, dirty: false, raw: null };
      if (t === current) {
        paintTabs();
        render();
        setStatus($("status"), f.sha ? "Loaded" : t.path + " doesn't exist yet; it will be created on save.", f.sha ? "" : "warn");
      }
    }).catch(function (e) {
      if (t === current) setStatus($("status"), "Couldn't load " + t.path + ": " + explain(e), "err");
    });
  }

  function render() {
    var t = current, s = t.state, ed = $("editor");
    ed.innerHTML = "";
    if (!s) return;
    $("raw-btn").textContent = s.raw === null ? "Edit as raw text" : "Back to form";
    if (s.raw !== null) {
      append(ed, bound(s, "raw", { class: "raw", spellcheck: "false" }, "textarea"));
    } else {
      append(ed, t.editor(s.model));
    }
  }

  $("raw-btn").addEventListener("click", function () {
    var s = current && current.state;
    if (!s) return;
    if (s.raw === null) s.raw = current.serialize(s.model);
    else { s.model = current.parse(s.raw); s.raw = null; }
    render();
  });

  $("reload-btn").addEventListener("click", function () {
    if (!current) return;
    if (current.state && current.state.dirty && !confirm("Discard your unsaved changes to " + current.path + "?")) return;
    load(current);
  });

  $("save-btn").addEventListener("click", function () {
    var t = current, s = t && t.state;
    if (!s) return;
    if (s.raw !== null) s.model = t.parse(s.raw);
    var problem = t.validate && t.validate(s.model);
    if (problem) return setStatus($("status"), problem, "err");
    var text = t.serialize(s.model);
    $("save-btn").disabled = true;
    setStatus($("status"), "Saving...");
    putFile(t.path, utf8ToB64(text), s.sha, "Update " + t.path + " via admin page").then(function (sha) {
      s.sha = sha;
      s.dirty = false;
      if (s.raw !== null) s.raw = text;
      paintTabs();
      render();
      setStatus($("status"), "Saved. The live site updates in about a minute.", "ok");
    }).catch(function (e) {
      setStatus($("status"), "Save failed: " + explain(e), "err");
    }).then(function () {
      $("save-btn").disabled = false;
    });
  });

  // ------------------------------------------------------------------
  // start
  // ------------------------------------------------------------------

  loadIcons();
  var saved = storedToken();
  if (saved) {
    var remembered = false;
    try { remembered = !!localStorage.getItem(TOKEN_KEY); } catch (e) { /* ignore */ }
    login(saved, remembered).catch(function (e) { showLogin(explain(e)); });
  } else {
    showLogin();
  }
})();
