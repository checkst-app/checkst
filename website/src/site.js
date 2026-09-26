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

  const motion = root.classList.contains("motion");
  window.__checkstMotion = true;

  buttons.forEach((b) =>
    b.addEventListener("click", () => {
      const choice = b.dataset.themeChoice;
      try {
        localStorage.setItem("checkst-theme", choice);
      } catch {}
      // Cross-fade between light and dark where the View Transitions API exists.
      if (motion && document.startViewTransition && root.dataset.theme !== (choice === "auto" ? (media.matches ? "dark" : "light") : choice)) {
        document.startViewTransition(() => apply(choice));
      } else apply(choice);
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

  // ---------- motion: scroll reveal and the two typing demos ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const type = async (el, text, speed = 45, onChar) => {
    for (const ch of text) {
      el.textContent += ch;
      onChar?.();
      await sleep(speed + Math.random() * speed * 0.8);
    }
  };

  const demos = {
    // "(A) Angebot … due:2026-10-02" types itself, then the parsed row pops in.
    "card-syntax": async (card) => {
      const demo = card.querySelector(".syntax-demo");
      const raw = demo?.querySelector(".raw-line");
      if (!raw) return;
      const text = raw.textContent;
      [...demo.querySelectorAll(".task-row > *"), demo.querySelector(".legend")].forEach((el, i) => el?.style.setProperty("--i", i));
      raw.style.minHeight = `${raw.offsetHeight}px`;
      raw.textContent = "";
      demo.classList.add("typing");
      await sleep(450);
      await type(raw, text, 26);
      await sleep(250);
      demo.classList.replace("typing", "typed");
      raw.style.minHeight = "";
    },
    // The quick-capture bar: text, @context, then "+G" opens the project suggestion.
    "card-quick": async (card) => {
      const bar = card.querySelector(".quick-bar");
      if (!bar) return;
      const parts = [".qb-text", ".qb-context", ".qb-typed"].map((s) => bar.querySelector(s));
      const ghost = bar.querySelector(".qb-ghost");
      const suggest = bar.querySelector(".qb-suggest");
      const preview = bar.querySelector(".qb-preview code");
      if (parts.some((p) => !p) || !ghost || !suggest || !preview) return;
      const texts = parts.map((p) => p.textContent);
      const finalPreview = preview.textContent;
      bar.style.minHeight = `${bar.offsetHeight}px`;
      parts.forEach((p) => (p.textContent = ""));
      preview.textContent = "";
      ghost.classList.add("hidden");
      suggest.classList.add("hidden");
      bar.classList.add("typing");
      const sync = () => (preview.textContent = parts.map((p) => p.textContent).filter(Boolean).join(" "));
      await sleep(700);
      for (let i = 0; i < parts.length; i++) {
        if (i === 2) {
          await type(parts[2], texts[2].slice(0, 1), 60, sync);
          suggest.classList.remove("hidden");
          await sleep(260);
          await type(parts[2], texts[2].slice(1), 60, sync);
        } else {
          await type(parts[i], texts[i], 55, sync);
          await sleep(180);
        }
      }
      await sleep(120);
      ghost.classList.remove("hidden");
      preview.textContent = finalPreview;
    },
  };

  if (motion && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          e.target.classList.add("in");
          for (const [cls, run] of Object.entries(demos)) if (e.target.classList.contains(cls)) run(e.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
  } else {
    document.querySelectorAll("[data-reveal]").forEach((el) => el.classList.add("in"));
  }

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
