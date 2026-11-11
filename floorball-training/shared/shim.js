/* Buiten Claude: de pagina vraagt om "downloads" voor de pdf. Hier slaan we het bestand
   gewoon op via de browser. Andere Claude-functies (account-opslag) zijn er niet,
   dus de bibliotheek blijft in deze browser. */
(function () {
  window.FB_HOSTED = true;
  if (window.claude) return;
  const downloads = {
    save: async function ({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename || "training.pdf";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      return { status: "saved" };
    }
  };
  window.claude = { use: async (name) => (name === "downloads" ? downloads : null) };
})();
