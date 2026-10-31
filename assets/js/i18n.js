// i18n.js
// English / French / Spanish for the site's own wording. The language is
// the visitor's choice from the switcher, else ?lang=xx, else the first of
// the browser's preferred languages we support, else English.
//
// In HTML:  data-i18n="key"            text content
//           data-i18n-html="key"       inner HTML (trusted strings only)
//           data-i18n-attr="placeholder:key,title:key"
// In JS:    I18n.t("key", {n: 3})      {name} placeholders; a [one, many]
//                                       pair picks the plural form from n
// Content in the .txt files is translated there (see sitedata.js).

var I18n = (function () {
  "use strict";

  var SUPPORTED = ["en", "fr", "es"];
  var NAMES = { en: "English", fr: "Français", es: "Español" };
  var LOCALES = { en: "en-CA", fr: "fr-CA", es: "es" };
  var STORE_KEY = "lang";

  var D = {
    en: {
      "site.title": "Neil James Cook",
      "site.role": "Astrophysics researcher",
      "site.tagline": "Astrophysics researcher · iREx · Université de Montréal",
      "site.description": "Neil James Cook, astrophysics researcher at iREx, Université de Montréal: data pipelines and software for NIRPS, SPIRou, JWST NIRISS and ANDES.",

      "nav.home": "Home", "nav.news": "News", "nav.research": "Links to research",
      "nav.projects": "Projects", "nav.software": "Software", "nav.publications": "Publications",
      "nav.talks": "Talks", "nav.students": "Students", "nav.about": "About me",
      "nav.contact": "Contact", "nav.cv": "CV", "nav.links": "Useful links",
      "nav.clocks": "World clocks", "nav.admin": "Admin", "nav.menu": "Menu",
      "nav.language": "Language", "nav.preview": "Preview of unsaved changes",

      "sec.news": "Recently",
      "sec.research": "Links to research",
      "sec.projects": "Projects I work on",
      "sec.software": "Software",
      "sec.software.intro": "Open-source code I write and maintain.",
      "sec.publications": "Publications",
      "sec.talks": "Talks & outreach",
      "sec.students": "Students & mentoring",
      "sec.about": "About me",
      "sec.contact": "Contact",

      "common.showAll": "Show all {n}",
      "common.showFewer": "Show fewer",

      "projects.by": "by {by}",
      "projects.website": "Website",

      "news.read": "Read more",

      "talks.slides": "Slides", "talks.video": "Video", "talks.link": "Link",
      "talks.kind.talk": "Talk", "talks.kind.invited": "Invited talk", "talks.kind.seminar": "Seminar",
      "talks.kind.colloquium": "Colloquium", "talks.kind.poster": "Poster", "talks.kind.lecture": "Lecture",
      "talks.kind.workshop": "Workshop", "talks.kind.outreach": "Public outreach", "talks.kind.media": "Media",

      "students.current": "Current", "students.past": "Former",

      "sw.stars": ["{n} star", "{n} stars"], "sw.forks": ["{n} fork", "{n} forks"],
      "sw.updated": "Updated {date}", "sw.release": "Latest release {tag}",
      "sw.code": "Code", "sw.docs": "Docs",

      "about.cv": "Curriculum vitae",

      "contact.drop": "Drop me a line",
      "contact.name": "Your name",
      "contact.email": "Your email (so I can reply)",
      "contact.message": "Your message",
      "contact.send": "Send",
      "contact.note": "Opens your email app with the message ready to send.",
      "contact.subject": "Message from {name} via njcuk9999.github.io",
      "contact.findMe": "Find me on",

      "pub.loading": "Loading publications…",
      "pub.error": "Couldn’t load publications right now; see ORCID or Google Scholar above.",
      "pub.source": "Publications from <a href=\"https://openalex.org/authors/A5078094363\" target=\"_blank\" rel=\"noopener\">OpenAlex</a> and <a href=\"https://orcid.org/0000-0003-4166-4121\" target=\"_blank\" rel=\"noopener\">ORCID</a>; citation counts from OpenAlex, which can differ from Google Scholar or ADS.",
      "pub.updated": "Updated {date}.",
      "pub.stat.pubs": "Publications", "pub.stat.first": "First author", "pub.stat.cites": "Citations",
      "pub.stat.h": "h-index", "pub.stat.reads": "Reads (ADS)",
      "pub.chart": "Citations per year", "pub.chart.label": "Citations per year, {from} to {to}, peak {peak} in {year}",
      "pub.chart.soFar": "(so far)", "pub.chart.year": "Year",
      "pub.citations": ["{n} citation", "{n} citations"],
      "pub.all": "All", "pub.first": "First author", "pub.newest": "Newest", "pub.mostCited": "Most cited",
      "pub.filter": "Filter", "pub.sort": "Sort",
      "pub.search": "Search titles, authors, journals", "pub.allYears": "All years",
      "pub.export": "BibTeX", "pub.exportTitle": "Download the papers listed as a BibTeX file",
      "pub.cite": "Cite", "pub.copy": "Copy", "pub.copied": "Copied",
      "pub.more": "+{n} more", "pub.none": "No publications match.",
      "pub.type.thesis": "Thesis", "pub.type.preprint": "Preprint",

      "links.title": "Useful links",
      "links.summary": "{links} links across {sections} collections",
      "links.search": "Search links", "links.all": "All",
      "links.none": "No links match “{q}”.", "links.noneHere": "No links match “{q}” in this section.",
      "links.error": "Couldn’t load the links.",

      "cv.title": "Curriculum vitae",
      "cv.print": "Download PDF",
      "cv.printHint": "Choose “Save as PDF” as the printer.",
      "cv.updated": "Updated {date}",
      "cv.sec.positions": "Positions", "cv.sec.education": "Education", "cv.sec.awards": "Awards & fellowships",
      "cv.sec.grants": "Grants & observing time", "cv.sec.teaching": "Teaching & supervision",
      "cv.sec.service": "Service", "cv.sec.skills": "Skills", "cv.sec.interests": "Research interests",
      "cv.sec.outreach": "Outreach", "cv.sec.languages": "Languages", "cv.sec.other": "Other",
      "cv.pubs": "Publications",
      "cv.pubs.summary": "{n} publications · {first} as first author · {cites} citations · h-index {h}",
      "cv.pubs.first": "First-author publications",
      "cv.pubs.selected": "Selected co-authored publications (most cited)",
      "cv.pubs.full": "Full, up-to-date list:",
      "cv.software": "Software", "cv.talks": "Talks",
      "cv.loading": "Loading…",

      "clocks.title": "World clocks",
      "clocks.you": "Your time",
      "clocks.zone": "Time zone: {zone}",
      "clocks.now": "Now",
      "clocks.reset": "Back to now",
      "clocks.travel": "Time travel",
      "clocks.travelHint": "Drag to see the time everywhere at another moment.",
      "clocks.ahead": "{h} ahead of you", "clocks.behind": "{h} behind you", "clocks.same": "Same time as you",
      "clocks.today": "Today", "clocks.tomorrow": "Tomorrow", "clocks.yesterday": "Yesterday",
      "clocks.day": "Daytime", "clocks.night": "Night",
      "clocks.work": "Working hours", "clocks.awake": "Awake", "clocks.asleep": "Asleep",
      "clocks.weekend": "Weekend",
      "clocks.planner": "Meeting planner",
      "clocks.plannerHint": "Your next 24 hours across the clocks. Click an hour to jump there.",
      "clocks.plannerDay": "All of {date} in your time zone. Click an hour to jump there.",
      "clocks.prevDay": "Previous day", "clocks.nextDay": "Next day", "clocks.pickDay": "Pick a day",
      "clocks.next24": "Next 24 h", "clocks.dstChange": "Clocks change:",
      "clocks.h24": "24 h", "clocks.h12": "12 h",
      "clocks.mapError": "The map couldn’t load, but the clocks still work.",
      "clocks.sun": "Sun overhead"
    },

    fr: {
      "site.title": "Neil James Cook",
      "site.role": "Chercheur en astrophysique",
      "site.tagline": "Chercheur en astrophysique · iREx · Université de Montréal",
      "site.description": "Neil James Cook, chercheur en astrophysique à l’iREx, Université de Montréal : pipelines de données et logiciels pour NIRPS, SPIRou, JWST NIRISS et ANDES.",

      "nav.home": "Accueil", "nav.news": "Actualités", "nav.research": "Liens de recherche",
      "nav.projects": "Projets", "nav.software": "Logiciels", "nav.publications": "Publications",
      "nav.talks": "Présentations", "nav.students": "Étudiants", "nav.about": "À propos",
      "nav.contact": "Contact", "nav.cv": "CV", "nav.links": "Liens utiles",
      "nav.clocks": "Horloges du monde", "nav.admin": "Admin", "nav.menu": "Menu",
      "nav.language": "Langue", "nav.preview": "Aperçu des modifications non enregistrées",

      "sec.news": "Récemment",
      "sec.research": "Liens vers mes recherches",
      "sec.projects": "Projets auxquels je participe",
      "sec.software": "Logiciels",
      "sec.software.intro": "Le code libre que j’écris et que je maintiens.",
      "sec.publications": "Publications",
      "sec.talks": "Présentations et vulgarisation",
      "sec.students": "Étudiants et encadrement",
      "sec.about": "À propos de moi",
      "sec.contact": "Contact",

      "common.showAll": "Tout afficher ({n})",
      "common.showFewer": "Afficher moins",

      "projects.by": "par {by}",
      "projects.website": "Site web",

      "news.read": "Lire la suite",

      "talks.slides": "Diapositives", "talks.video": "Vidéo", "talks.link": "Lien",
      "talks.kind.talk": "Présentation", "talks.kind.invited": "Conférence invitée", "talks.kind.seminar": "Séminaire",
      "talks.kind.colloquium": "Colloque", "talks.kind.poster": "Affiche", "talks.kind.lecture": "Cours",
      "talks.kind.workshop": "Atelier", "talks.kind.outreach": "Vulgarisation", "talks.kind.media": "Médias",

      "students.current": "Actuels", "students.past": "Anciens",

      "sw.stars": ["{n} étoile", "{n} étoiles"], "sw.forks": ["{n} fork", "{n} forks"],
      "sw.updated": "Mis à jour le {date}", "sw.release": "Dernière version {tag}",
      "sw.code": "Code", "sw.docs": "Documentation",

      "about.cv": "Curriculum vitæ",

      "contact.drop": "Écrivez-moi",
      "contact.name": "Votre nom",
      "contact.email": "Votre courriel (pour que je puisse répondre)",
      "contact.message": "Votre message",
      "contact.send": "Envoyer",
      "contact.note": "Ouvre votre logiciel de courriel avec le message prêt à envoyer.",
      "contact.subject": "Message de {name} via njcuk9999.github.io",
      "contact.findMe": "Retrouvez-moi sur",

      "pub.loading": "Chargement des publications…",
      "pub.error": "Impossible de charger les publications pour le moment ; voir ORCID ou Google Scholar ci-dessus.",
      "pub.source": "Publications provenant d’<a href=\"https://openalex.org/authors/A5078094363\" target=\"_blank\" rel=\"noopener\">OpenAlex</a> et d’<a href=\"https://orcid.org/0000-0003-4166-4121\" target=\"_blank\" rel=\"noopener\">ORCID</a> ; nombre de citations selon OpenAlex, qui peut différer de Google Scholar ou d’ADS.",
      "pub.updated": "Mis à jour le {date}.",
      "pub.stat.pubs": "Publications", "pub.stat.first": "Premier auteur", "pub.stat.cites": "Citations",
      "pub.stat.h": "Indice h", "pub.stat.reads": "Lectures (ADS)",
      "pub.chart": "Citations par année", "pub.chart.label": "Citations par année, de {from} à {to}, maximum de {peak} en {year}",
      "pub.chart.soFar": "(jusqu’ici)", "pub.chart.year": "Année",
      "pub.citations": ["{n} citation", "{n} citations"],
      "pub.all": "Toutes", "pub.first": "Premier auteur", "pub.newest": "Plus récentes", "pub.mostCited": "Plus citées",
      "pub.filter": "Filtrer", "pub.sort": "Trier",
      "pub.search": "Rechercher titres, auteurs, revues", "pub.allYears": "Toutes les années",
      "pub.export": "BibTeX", "pub.exportTitle": "Télécharger les articles affichés au format BibTeX",
      "pub.cite": "Citer", "pub.copy": "Copier", "pub.copied": "Copié",
      "pub.more": "+{n} autres", "pub.none": "Aucune publication ne correspond.",
      "pub.type.thesis": "Thèse", "pub.type.preprint": "Prépublication",

      "links.title": "Liens utiles",
      "links.summary": "{links} liens répartis en {sections} collections",
      "links.search": "Rechercher un lien", "links.all": "Tous",
      "links.none": "Aucun lien ne correspond à « {q} ».", "links.noneHere": "Aucun lien ne correspond à « {q} » dans cette section.",
      "links.error": "Impossible de charger les liens.",

      "cv.title": "Curriculum vitæ",
      "cv.print": "Télécharger en PDF",
      "cv.printHint": "Choisissez « Enregistrer au format PDF » comme imprimante.",
      "cv.updated": "Mis à jour le {date}",
      "cv.sec.positions": "Postes", "cv.sec.education": "Formation", "cv.sec.awards": "Prix et bourses",
      "cv.sec.grants": "Subventions et temps d’observation", "cv.sec.teaching": "Enseignement et encadrement",
      "cv.sec.service": "Service à la communauté", "cv.sec.skills": "Compétences", "cv.sec.interests": "Intérêts de recherche",
      "cv.sec.outreach": "Vulgarisation", "cv.sec.languages": "Langues", "cv.sec.other": "Autres",
      "cv.pubs": "Publications",
      "cv.pubs.summary": "{n} publications · {first} comme premier auteur · {cites} citations · indice h {h}",
      "cv.pubs.first": "Publications comme premier auteur",
      "cv.pubs.selected": "Sélection de publications en collaboration (les plus citées)",
      "cv.pubs.full": "Liste complète et à jour :",
      "cv.software": "Logiciels", "cv.talks": "Présentations",
      "cv.loading": "Chargement…",

      "clocks.title": "Horloges du monde",
      "clocks.you": "Votre heure",
      "clocks.zone": "Fuseau horaire : {zone}",
      "clocks.now": "Maintenant",
      "clocks.reset": "Revenir à maintenant",
      "clocks.travel": "Voyage dans le temps",
      "clocks.travelHint": "Faites glisser pour voir l’heure partout à un autre moment.",
      "clocks.ahead": "{h} d’avance sur vous", "clocks.behind": "{h} de retard sur vous", "clocks.same": "Même heure que vous",
      "clocks.today": "Aujourd’hui", "clocks.tomorrow": "Demain", "clocks.yesterday": "Hier",
      "clocks.day": "Jour", "clocks.night": "Nuit",
      "clocks.work": "Heures de bureau", "clocks.awake": "Éveillé", "clocks.asleep": "Endormi",
      "clocks.weekend": "Fin de semaine",
      "clocks.planner": "Planificateur de réunions",
      "clocks.plannerHint": "Vos 24 prochaines heures dans chaque ville. Cliquez sur une heure pour y aller.",
      "clocks.plannerDay": "Toute la journée du {date} dans votre fuseau. Cliquez sur une heure pour y aller.",
      "clocks.prevDay": "Jour précédent", "clocks.nextDay": "Jour suivant", "clocks.pickDay": "Choisir un jour",
      "clocks.next24": "24 prochaines h", "clocks.dstChange": "Changement d’heure :",
      "clocks.h24": "24 h", "clocks.h12": "12 h",
      "clocks.mapError": "La carte n’a pas pu être chargée, mais les horloges fonctionnent.",
      "clocks.sun": "Soleil au zénith"
    },

    es: {
      "site.title": "Neil James Cook",
      "site.role": "Investigador en astrofísica",
      "site.tagline": "Investigador en astrofísica · iREx · Université de Montréal",
      "site.description": "Neil James Cook, investigador en astrofísica en el iREx, Université de Montréal: pipelines de datos y software para NIRPS, SPIRou, JWST NIRISS y ANDES.",

      "nav.home": "Inicio", "nav.news": "Noticias", "nav.research": "Enlaces de investigación",
      "nav.projects": "Proyectos", "nav.software": "Software", "nav.publications": "Publicaciones",
      "nav.talks": "Charlas", "nav.students": "Estudiantes", "nav.about": "Sobre mí",
      "nav.contact": "Contacto", "nav.cv": "CV", "nav.links": "Enlaces útiles",
      "nav.clocks": "Relojes del mundo", "nav.admin": "Admin", "nav.menu": "Menú",
      "nav.language": "Idioma", "nav.preview": "Vista previa de cambios sin guardar",

      "sec.news": "Novedades",
      "sec.research": "Enlaces a mi investigación",
      "sec.projects": "Proyectos en los que trabajo",
      "sec.software": "Software",
      "sec.software.intro": "Código abierto que escribo y mantengo.",
      "sec.publications": "Publicaciones",
      "sec.talks": "Charlas y divulgación",
      "sec.students": "Estudiantes y mentoría",
      "sec.about": "Sobre mí",
      "sec.contact": "Contacto",

      "common.showAll": "Mostrar todo ({n})",
      "common.showFewer": "Mostrar menos",

      "projects.by": "por {by}",
      "projects.website": "Sitio web",

      "news.read": "Leer más",

      "talks.slides": "Diapositivas", "talks.video": "Vídeo", "talks.link": "Enlace",
      "talks.kind.talk": "Charla", "talks.kind.invited": "Charla invitada", "talks.kind.seminar": "Seminario",
      "talks.kind.colloquium": "Coloquio", "talks.kind.poster": "Póster", "talks.kind.lecture": "Clase",
      "talks.kind.workshop": "Taller", "talks.kind.outreach": "Divulgación", "talks.kind.media": "Medios",

      "students.current": "Actuales", "students.past": "Anteriores",

      "sw.stars": ["{n} estrella", "{n} estrellas"], "sw.forks": ["{n} fork", "{n} forks"],
      "sw.updated": "Actualizado el {date}", "sw.release": "Última versión {tag}",
      "sw.code": "Código", "sw.docs": "Documentación",

      "about.cv": "Currículum vítae",

      "contact.drop": "Escríbeme",
      "contact.name": "Tu nombre",
      "contact.email": "Tu correo (para poder responderte)",
      "contact.message": "Tu mensaje",
      "contact.send": "Enviar",
      "contact.note": "Abre tu aplicación de correo con el mensaje listo para enviar.",
      "contact.subject": "Mensaje de {name} vía njcuk9999.github.io",
      "contact.findMe": "Encuéntrame en",

      "pub.loading": "Cargando publicaciones…",
      "pub.error": "No se pudieron cargar las publicaciones; consulta ORCID o Google Scholar arriba.",
      "pub.source": "Publicaciones de <a href=\"https://openalex.org/authors/A5078094363\" target=\"_blank\" rel=\"noopener\">OpenAlex</a> y <a href=\"https://orcid.org/0000-0003-4166-4121\" target=\"_blank\" rel=\"noopener\">ORCID</a>; citas según OpenAlex, que pueden diferir de Google Scholar o ADS.",
      "pub.updated": "Actualizado el {date}.",
      "pub.stat.pubs": "Publicaciones", "pub.stat.first": "Primer autor", "pub.stat.cites": "Citas",
      "pub.stat.h": "Índice h", "pub.stat.reads": "Lecturas (ADS)",
      "pub.chart": "Citas por año", "pub.chart.label": "Citas por año, de {from} a {to}, máximo de {peak} en {year}",
      "pub.chart.soFar": "(hasta ahora)", "pub.chart.year": "Año",
      "pub.citations": ["{n} cita", "{n} citas"],
      "pub.all": "Todas", "pub.first": "Primer autor", "pub.newest": "Más recientes", "pub.mostCited": "Más citadas",
      "pub.filter": "Filtrar", "pub.sort": "Ordenar",
      "pub.search": "Buscar títulos, autores, revistas", "pub.allYears": "Todos los años",
      "pub.export": "BibTeX", "pub.exportTitle": "Descargar los artículos mostrados en formato BibTeX",
      "pub.cite": "Citar", "pub.copy": "Copiar", "pub.copied": "Copiado",
      "pub.more": "+{n} más", "pub.none": "Ninguna publicación coincide.",
      "pub.type.thesis": "Tesis", "pub.type.preprint": "Preprint",

      "links.title": "Enlaces útiles",
      "links.summary": "{links} enlaces en {sections} colecciones",
      "links.search": "Buscar enlaces", "links.all": "Todos",
      "links.none": "Ningún enlace coincide con «{q}».", "links.noneHere": "Ningún enlace coincide con «{q}» en esta sección.",
      "links.error": "No se pudieron cargar los enlaces.",

      "cv.title": "Currículum vítae",
      "cv.print": "Descargar PDF",
      "cv.printHint": "Elige «Guardar como PDF» como impresora.",
      "cv.updated": "Actualizado el {date}",
      "cv.sec.positions": "Puestos", "cv.sec.education": "Formación", "cv.sec.awards": "Premios y becas",
      "cv.sec.grants": "Financiación y tiempo de observación", "cv.sec.teaching": "Docencia y supervisión",
      "cv.sec.service": "Servicio a la comunidad", "cv.sec.skills": "Habilidades", "cv.sec.interests": "Intereses de investigación",
      "cv.sec.outreach": "Divulgación", "cv.sec.languages": "Idiomas", "cv.sec.other": "Otros",
      "cv.pubs": "Publicaciones",
      "cv.pubs.summary": "{n} publicaciones · {first} como primer autor · {cites} citas · índice h {h}",
      "cv.pubs.first": "Publicaciones como primer autor",
      "cv.pubs.selected": "Selección de publicaciones en colaboración (las más citadas)",
      "cv.pubs.full": "Lista completa y actualizada:",
      "cv.software": "Software", "cv.talks": "Charlas",
      "cv.loading": "Cargando…",

      "clocks.title": "Relojes del mundo",
      "clocks.you": "Tu hora",
      "clocks.zone": "Zona horaria: {zone}",
      "clocks.now": "Ahora",
      "clocks.reset": "Volver a ahora",
      "clocks.travel": "Viaje en el tiempo",
      "clocks.travelHint": "Desliza para ver la hora en todas partes en otro momento.",
      "clocks.ahead": "{h} por delante de ti", "clocks.behind": "{h} por detrás de ti", "clocks.same": "Misma hora que tú",
      "clocks.today": "Hoy", "clocks.tomorrow": "Mañana", "clocks.yesterday": "Ayer",
      "clocks.day": "Día", "clocks.night": "Noche",
      "clocks.work": "Horario laboral", "clocks.awake": "Despierto", "clocks.asleep": "Durmiendo",
      "clocks.weekend": "Fin de semana",
      "clocks.planner": "Planificador de reuniones",
      "clocks.plannerHint": "Tus próximas 24 horas en cada ciudad. Haz clic en una hora para ir a ella.",
      "clocks.plannerDay": "Todo el {date} en tu zona horaria. Haz clic en una hora para ir a ella.",
      "clocks.prevDay": "Día anterior", "clocks.nextDay": "Día siguiente", "clocks.pickDay": "Elige un día",
      "clocks.next24": "Próximas 24 h", "clocks.dstChange": "Cambio de hora:",
      "clocks.h24": "24 h", "clocks.h12": "12 h",
      "clocks.mapError": "No se pudo cargar el mapa, pero los relojes funcionan.",
      "clocks.sun": "Sol en el cénit"
    }
  };

  function stored() {
    try { return localStorage.getItem(STORE_KEY); } catch (e) { return null; }
  }

  function detect() {
    var q = location.search.match(/[?&]lang=([a-z]{2})\b/);
    if (q && SUPPORTED.indexOf(q[1]) >= 0) return q[1];
    var s = stored();
    if (SUPPORTED.indexOf(s) >= 0) return s;
    var prefs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "en"];
    for (var i = 0; i < prefs.length; i++) {
      var code = String(prefs[i] || "").slice(0, 2).toLowerCase();
      if (SUPPORTED.indexOf(code) >= 0) return code;
    }
    return "en";
  }

  var lang = detect();
  document.documentElement.lang = lang;

  function t(key, vars) {
    var v = D[lang][key];
    if (v === undefined) v = D.en[key];
    if (v === undefined) return key;
    vars = vars || {};
    if (Array.isArray(v)) {
      var n = Number(vars.n);
      v = (lang === "fr" ? n < 2 : n === 1) ? v[0] : v[1];
    }
    return v.replace(/\{(\w+)\}/g, function (m, k) {
      if (!(k in vars)) return m;
      var x = vars[k];
      return typeof x === "number" ? num(x) : String(x);
    });
  }

  function num(n) {
    return Number(n).toLocaleString(LOCALES[lang]);
  }

  // "2026", "2026-10" or "2026-10-27" in the page language
  function date(s, opts) {
    var m = String(s || "").match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/);
    if (!m) return String(s || "");
    if (!m[2]) return m[1];
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +(m[3] || 1)));
    var o = Object.assign({ timeZone: "UTC", year: "numeric", month: "short" }, m[3] ? { day: "numeric" } : {}, opts || {});
    return new Intl.DateTimeFormat(LOCALES[lang], o).format(d);
  }

  function apply(root) {
    root = root || document;
    Array.prototype.forEach.call(root.querySelectorAll("[data-i18n]"), function (el) {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    Array.prototype.forEach.call(root.querySelectorAll("[data-i18n-html]"), function (el) {
      el.innerHTML = t(el.getAttribute("data-i18n-html"));
    });
    Array.prototype.forEach.call(root.querySelectorAll("[data-i18n-attr]"), function (el) {
      el.getAttribute("data-i18n-attr").split(",").forEach(function (pair) {
        var p = pair.split(":");
        if (p.length === 2) el.setAttribute(p[0].trim(), t(p[1].trim()));
      });
    });
  }

  // the switcher remembers the choice and reloads without any ?lang=
  function set(l) {
    if (SUPPORTED.indexOf(l) < 0) return;
    try { localStorage.setItem(STORE_KEY, l); } catch (e) { /* storage blocked */ }
    var url = location.pathname + location.search.replace(/([?&])lang=[a-z]{2}&?/, "$1").replace(/[?&]$/, "") + location.hash;
    if (url === location.pathname + location.search + location.hash) {
      if (l !== lang) location.reload();
    } else {
      location.href = url;
    }
  }

  return {
    SUPPORTED: SUPPORTED, NAMES: NAMES,
    lang: lang, locale: LOCALES[lang],
    t: t, num: num, date: date, apply: apply, set: set
  };
})();
