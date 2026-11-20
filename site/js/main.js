(() => {
  const header = document.getElementById("siteHeader");
  const nav = document.getElementById("siteNav");
  const toggle = document.getElementById("navToggle");

  const forceSolid =
    document.body.classList.contains("page-termin") ||
    document.body.classList.contains("page-inner");

  const onScroll = () => {
    if (!header) return;
    const solid =
      forceSolid || window.scrollY > 40 || header.classList.contains("menu-open");
    header.classList.toggle("is-solid", solid);
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  if (toggle && nav && header) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      header.classList.toggle("menu-open", open);
      onScroll();
    });

    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        nav.classList.remove("is-open");
        header.classList.remove("menu-open");
        toggle.setAttribute("aria-expanded", "false");
        onScroll();
      });
    });
  }

  const reveals = document.querySelectorAll(".reveal");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || !("IntersectionObserver" in window)) {
    reveals.forEach((el) => el.classList.add("is-visible"));
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" }
    );
    reveals.forEach((el) => io.observe(el));
  }

  document.querySelectorAll(".slot-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      const btn = e.target.closest(".slot");
      if (!btn) return;
      row.querySelectorAll(".slot").forEach((s) => s.classList.remove("is-selected"));
      btn.classList.add("is-selected");
    });
  });

  document.querySelectorAll("#bookingMock, #bookingHome").forEach((booking) => {
    booking.addEventListener("submit", (e) => {
      e.preventDefault();
      const note = booking.querySelector(".booking-note");
      if (note) {
        note.textContent =
          "Danke — im Prototyp wird nichts gesendet. Später: Bestätigung per E-Mail und Eintrag im Kalender.";
      }
      alert(
        "Prototype: Ihre Angaben wurden nicht übermittelt.\n\nNächster Schritt nach Freigabe: echter Kalender + Bestätigungsmail."
      );
    });
  });

  const waitlist = document.getElementById("waitlistForm");
  const waitMsg = document.getElementById("waitlistMsg");
  if (waitlist && waitMsg) {
    waitlist.addEventListener("submit", (e) => {
      e.preventDefault();
      waitMsg.textContent =
        "Vielen Dank — in der Demo speichern wir keine E-Mail. Die Interessentenliste kommt mit dem MVP.";
      waitlist.reset();
    });
  }
})();
