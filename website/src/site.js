// Theme toggle (auto / light / dark), language preference and copy buttons.
(() => {
  const root = document.documentElement;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const buttons = document.querySelectorAll("[data-theme-choice]");

  const stored = () => {
    try {
      return localStorage.getItem("checkst-theme") || "auto";
    } catch {
      return "auto";
    }
  };

  const apply = (choice) => {
    const dark = choice === "dark" || (choice === "auto" && media.matches);
    root.dataset.theme = dark ? "dark" : "light";
    buttons.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.themeChoice === choice)));
  };

  buttons.forEach((b) =>
    b.addEventListener("click", () => {
      const choice = b.dataset.themeChoice;
      try {
        localStorage.setItem("checkst-theme", choice);
      } catch {}
      apply(choice);
    }),
  );
  media.addEventListener("change", () => stored() === "auto" && apply("auto"));
  apply(stored());

  // Remember an explicit language choice so the root page does not redirect again.
  document.querySelectorAll("a[data-lang]").forEach((a) =>
    a.addEventListener("click", () => {
      try {
        localStorage.setItem("checkst-lang", a.dataset.lang);
      } catch {}
    }),
  );

  document.querySelectorAll("[data-copy]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        btn.classList.add("copied");
        const label = btn.getAttribute("aria-label");
        btn.setAttribute("aria-label", btn.dataset.copied || "OK");
        setTimeout(() => {
          btn.classList.remove("copied");
          if (label) btn.setAttribute("aria-label", label);
        }, 1600);
      } catch {}
    }),
  );
})();
