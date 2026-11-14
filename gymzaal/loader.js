/* Gymzaal-app: laadt een programmapagina uit de training-app (bijv. ../../gymles/index.html)
   en toont die met het gymzaal-logo, de gymzaal-iconen en een terugknop naar de gymzaal-startpagina.
   De oefeningen staan dus maar op één plek; wijzig ze altijd in de map van het programma zelf.
   Woorden (gymles i.p.v. training) en kopteksten per programma staan hieronder in APP.
   Gebruik: <script src="../loader.js" data-program="gymles"></script> */
(function () {
  var me = document.currentScript, PROGRAM = me.getAttribute("data-program");
  var abs = function (rel) { return new URL(rel, me.src).href; };      // ten opzichte van gymzaal/
  var APP = {
    id: "gymzaal",
    logo: abs("../icons/gymzaal-logo.png"),
    logoAlt: "Floorball in de gymzaal",
    home: abs("./"),
    words: { unit: "gymles", Unit: "Gymles", title: "Mijn gymles", inLabel: "In de gymles", btnLabel: "Gymles" },
    texts: ({
      gymles: { title: "Gymles groep 3–6 · Floorball in de gymzaal", eyebrow: "Gymles · groep 3–6", h1: "Floorball in de gymzaal" },
      o12:    { title: "Gymles groep 7–8 · Floorball in de gymzaal", eyebrow: "Gymles · groep 7–8", h1: "Floorball in de gymzaal",
                lead: "Achttien oefeningen voor groep 7 en 8, kinderen tot 12 jaar: veel balcontacten, korte uitleg en spelvormen met een winnaar, passend in de gymzaal. Zeven vormen komen uit Zweden en Zwitserland en zijn gemarkeerd. Tik op + In de gymles om oefeningen te kiezen en pas per oefening de tijd aan. De genummerde stappen in elke tekening lopen als animatie af." }
    })[PROGRAM] || {}
  };
  var inject = '<base href="' + abs("../" + PROGRAM + "/") + '">' +
    '<script>window.FB_APP=' + JSON.stringify(APP) + '<\/script>';
  fetch(abs("../" + PROGRAM + "/index.html"), { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then(function (html) {
      html = html
        .replace(/<head>/i, "<head>" + inject)
        .replace('href="../manifest.webmanifest"', 'href="' + abs("manifest.webmanifest") + '"')
        .replace('href="../icons/icon-192.png"', 'href="' + abs("../icons/gymzaal-192.png") + '"')
        .replace('href="../icons/apple-touch-icon.png"', 'href="' + abs("../icons/gymzaal-apple-touch.png") + '"');
      document.open(); document.write(html); document.close();
    })
    .catch(function () {
      var m = document.getElementById("msg");
      if (m) m.textContent = "De oefeningen konden niet worden geladen. Controleer je internetverbinding en probeer het opnieuw.";
    });
})();
