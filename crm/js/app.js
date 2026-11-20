(() => {
  const D = window.CRM_DATA;
  const state = {
    view: "overview",
    invoiceId: null,
    invoiceMode: "list", // list | draft | preview | status
    draftFromAppointmentId: null,
    /** @type {null | 'open_termine' | 'drafts' | 'overdue' | 'open_amount' | 'waitlist'} */
    filter: null,
  };

  const FILTER_META = {
    open_termine: {
      view: "termine",
      title: "Offene Termine",
      subtitle: "bestätigt / angefragt",
    },
    drafts: {
      view: "rechnungen",
      title: "Entwürfe",
      subtitle: "Rechnungen im Entwurf",
    },
    overdue: {
      view: "rechnungen",
      title: "Überfällig — Mahnung möglich",
      subtitle: "Schuldner mit offener Rechnung",
    },
    open_amount: {
      view: "rechnungen",
      title: "Offener Betrag",
      subtitle: "gesendet + überfällig",
    },
    waitlist: {
      view: "waitlist",
      title: "Warteliste",
      subtitle: "Kurse / Coaching",
    },
  };

  const el = {
    content: document.getElementById("content"),
    toast: document.getElementById("toast"),
  };

  /* ——— helpers ——— */
  function contact(id) {
    return D.contacts.find((c) => c.id === id);
  }
  function location(id) {
    return D.locations.find((l) => l.id === id);
  }
  function product(sku) {
    return D.products.find((p) => p.sku === sku);
  }
  function invoice(id) {
    return D.invoices.find((i) => i.id === id);
  }
  function appointment(id) {
    return D.appointments.find((a) => a.id === id);
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  function fmtDateTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return (
      d.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }) +
      ", " +
      d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
    );
  }

  function fmtMoney(n) {
    return (
      Number(n).toLocaleString("de-DE", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }) + " €"
    );
  }

  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add("is-on");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.toast.classList.remove("is-on"), 2600);
  }

  function pipelineBadge(p) {
    const map = {
      new: ["Neu", "badge-draft"],
      booked: ["Gebucht", "badge-accent"],
      confirmed: ["Bestätigt", "badge-mint"],
      visited: ["Besucht", "badge-ok"],
      invoiced: ["Rechnung", "badge-warn"],
      paid: ["Bezahlt", "badge-ok"],
      overdue: ["Überfällig", "badge-danger"],
      nurture: ["Nurture", "badge-accent"],
      stamm: ["Stamm", "badge-ok"],
      inactive: ["Inaktiv", "badge-draft"],
    };
    const [label, cls] = map[p] || [p, "badge-draft"];
    return `<span class="badge ${cls}">${label}</span>`;
  }

  function apptBadge(s) {
    const map = {
      requested: ["Angefragt", "badge-draft"],
      confirmed: ["Bestätigt", "badge-mint"],
      completed: ["Abgeschlossen", "badge-ok"],
      cancelled: ["Storniert", "badge-draft"],
      no_show: ["No-Show", "badge-danger"],
    };
    const [label, cls] = map[s] || [s, "badge-draft"];
    return `<span class="badge ${cls}">${label}</span>`;
  }

  function invBadge(s) {
    const map = {
      draft: ["Entwurf", "badge-draft"],
      sent: ["Gesendet", "badge-accent"],
      partial: ["Teilbezahlt", "badge-warn"],
      paid: ["Bezahlt", "badge-ok"],
      overdue: ["Überfällig", "badge-danger"],
      cancelled: ["Storniert", "badge-draft"],
      credited: ["Gutschrift", "badge-draft"],
    };
    const [label, cls] = map[s] || [s, "badge-draft"];
    return `<span class="badge ${cls}">${label}</span>`;
  }

  function methodLabel(m) {
    return (
      {
        ueberweisung: "Überweisung",
        cash: "Bar",
        card: "Karte",
      }[m] || m
    );
  }

  /* ——— routing ——— */
  function setView(view, opts = {}) {
    state.view = view;
    if (opts.invoiceId !== undefined) state.invoiceId = opts.invoiceId;
    if (opts.invoiceMode) state.invoiceMode = opts.invoiceMode;
    if (opts.draftFromAppointmentId !== undefined) {
      state.draftFromAppointmentId = opts.draftFromAppointmentId;
    }
    if (opts.filter !== undefined) state.filter = opts.filter;
    else if (opts.clearFilter) state.filter = null;
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.view === view);
    });
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function drillDown(kpiKey) {
    const meta = FILTER_META[kpiKey];
    if (!meta) return;
    if (meta.view === "rechnungen") {
      state.invoiceMode = "list";
      state.invoiceId = null;
    }
    setView(meta.view, { filter: kpiKey });
  }

  function clearFilter() {
    state.filter = null;
    render();
  }

  function filterBarHtml() {
    const meta = FILTER_META[state.filter];
    if (!meta || meta.view !== state.view) return "";
    return `
      <div class="filter-bar" role="status">
        <span class="filter-chip"><span class="filter-chip-dot" aria-hidden="true"></span>${meta.title}</span>
        <span class="filter-bar-meta">${meta.subtitle}</span>
        <button type="button" class="btn btn-sm btn-ghost" data-clear-filter>Alle anzeigen</button>
      </div>
    `;
  }

  /* ——— views ——— */
  function viewOverview() {
    const todayAppts = D.appointments.filter((a) =>
      ["confirmed", "requested"].includes(a.status)
    ).length;
    const overdue = D.invoices.filter((i) => i.status === "overdue").length;
    const drafts = D.invoices.filter((i) => i.status === "draft").length;
    const wait = D.waitlist.length;
    const openPay = D.invoices
      .filter((i) => ["sent", "overdue"].includes(i.status))
      .reduce((s, i) => s + i.total, 0);

    const upcoming = [...D.appointments]
      .filter((a) => ["confirmed", "requested"].includes(a.status))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .slice(0, 5);

    const needsInvoice = D.appointments.filter(
      (a) =>
        a.status === "completed" &&
        !D.invoices.some((i) => i.appointmentId === a.id)
    );

    return `
      <div class="page-head">
        <div>
          <h1>Übersicht</h1>
          <p>Praxis-Dashboard · Demo-Daten (kein Live-Backend)</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-ghost" data-go="termine">Termine</button>
          <button class="btn btn-primary" data-go="rechnungen">Rechnungen</button>
        </div>
      </div>
      <div class="hint-box">
        Klickbarer UI-Prototyp nach CRM-Plan (Lev). Rechnung: Termin abschließen → Entwurf → PDF-Vorschau → bezahlt / überfällig.
      </div>
      <div class="stat-grid">
        <button type="button" class="stat" data-kpi="open_termine" aria-label="Offene Termine anzeigen">
          <div class="stat-label">Offene Termine</div>
          <div class="stat-value">${todayAppts}</div>
          <div class="stat-hint">bestätigt / angefragt</div>
          <div class="stat-cta">Öffnen →</div>
        </button>
        <button type="button" class="stat" data-kpi="drafts" aria-label="Entwürfe anzeigen">
          <div class="stat-label">Entwürfe</div>
          <div class="stat-value">${drafts}</div>
          <div class="stat-hint">Rechnungen</div>
          <div class="stat-cta">Öffnen →</div>
        </button>
        <button type="button" class="stat" data-kpi="overdue" aria-label="Überfällige Rechnungen anzeigen">
          <div class="stat-label">Überfällig</div>
          <div class="stat-value">${overdue}</div>
          <div class="stat-hint">Mahnung möglich</div>
          <div class="stat-cta">Öffnen →</div>
        </button>
        <button type="button" class="stat" data-kpi="open_amount" aria-label="Offenen Betrag anzeigen">
          <div class="stat-label">Offener Betrag</div>
          <div class="stat-value">${fmtMoney(openPay)}</div>
          <div class="stat-hint">gesendet + überfällig</div>
          <div class="stat-cta">Öffnen →</div>
        </button>
        <button type="button" class="stat" data-kpi="waitlist" aria-label="Warteliste anzeigen">
          <div class="stat-label">Warteliste</div>
          <div class="stat-value">${wait}</div>
          <div class="stat-hint">Kurse / Coaching</div>
          <div class="stat-cta">Öffnen →</div>
        </button>
      </div>
      <div class="split">
        <div class="panel">
          <div class="panel-head"><h2>Nächste Termine</h2><button class="btn btn-sm btn-ghost" data-go="termine">Alle</button></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Wann</th><th>Kontakt</th><th>Ort</th><th>Status</th></tr></thead>
            <tbody>
              ${upcoming
                .map((a) => {
                  const c = contact(a.contactId);
                  const loc = location(a.locationId);
                  return `<tr class="clickable" data-go="termine"><td>${fmtDateTime(a.startsAt)}</td><td>${c?.name || "—"}</td><td>${loc?.name || "—"}</td><td>${apptBadge(a.status)}</td></tr>`;
                })
                .join("")}
            </tbody>
          </table></div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2>Rechnung aus Termin</h2></div>
          <div class="panel-body pad">
            ${
              needsInvoice.length || D.appointments.some((a) => a.status === "completed")
                ? `<p class="muted" style="margin-bottom:0.75rem">Abgeschlossene Termine → Entwurf erzeugen (1 Klick).</p>
                   <div class="table-wrap"><table>
                     <thead><tr><th>Termin</th><th>Kontakt</th><th></th></tr></thead>
                     <tbody>
                       ${D.appointments
                         .filter((a) => a.status === "completed")
                         .map((a) => {
                           const c = contact(a.contactId);
                           const existing = D.invoices.find((i) => i.appointmentId === a.id);
                           return `<tr>
                             <td>${fmtDate(a.startsAt)} · ${a.duration}′</td>
                             <td>${c?.name || "—"}</td>
                             <td>${
                               existing
                                 ? `<button class="btn btn-sm btn-ghost" data-inv-preview="${existing.id}">Rechnung</button>`
                                 : `<button class="btn btn-sm btn-primary" data-create-from="${a.id}">Entwurf</button>`
                             }</td>
                           </tr>`;
                         })
                         .join("")}
                     </tbody>
                   </table></div>`
                : `<p class="muted">Keine abgeschlossenen Termine.</p>`
            }
          </div>
        </div>
      </div>
    `;
  }

  function viewContacts() {
    return `
      <div class="page-head">
        <div>
          <h1>Kontakte</h1>
          <p>Patient:innen · keine Krankenakte · minimale Felder (DSGVO)</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" data-toast="Demo: Kontakt anlegen — Backend folgt">+ Kontakt</button>
        </div>
      </div>
      <div class="panel">
        <div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Kontakt</th><th>Standort</th><th>Tags</th><th>Pipeline</th><th>Quelle</th></tr></thead>
          <tbody>
            ${D.contacts
              .map(
                (c) => `<tr>
                  <td><strong>${c.name}</strong></td>
                  <td>${c.email}<div class="muted">${c.phone}</div></td>
                  <td>${c.locationPref}</td>
                  <td>${c.tags.map((t) => `<span class="tag">${t}</span>`).join("")}</td>
                  <td>${pipelineBadge(c.pipeline)}</td>
                  <td class="muted">${c.source}</td>
                </tr>`
              )
              .join("")}
          </tbody>
        </table></div>
      </div>
    `;
  }

  function viewTermine() {
    const openOnly = state.filter === "open_termine";
    let list = [...D.appointments];
    if (openOnly) {
      list = list.filter((a) => ["confirmed", "requested"].includes(a.status));
    }
    const sorted = list.sort((a, b) => b.startsAt.localeCompare(a.startsAt));
    const title = openOnly ? "Offene Termine" : "Termine";
    const subtitle = openOnly
      ? "Gefiltert: bestätigt / angefragt"
      : "München · Tutzing · Status: angefragt → bestätigt → abgeschlossen";
    return `
      <div class="page-head">
        <div>
          <h1>${title}</h1>
          <p>${subtitle}</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" data-toast="Demo: Termin anlegen — Cal.com später">+ Termin</button>
        </div>
      </div>
      ${filterBarHtml()}
      <div class="panel">
        <div class="table-wrap"><table>
          <thead><tr><th>Datum</th><th>Kontakt</th><th>Leistung</th><th>SKU</th><th>Ort</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${
              sorted.length
                ? sorted
                    .map((a) => {
                      const c = contact(a.contactId);
                      const loc = location(a.locationId);
                      const p = product(a.sku);
                      const inv = D.invoices.find((i) => i.appointmentId === a.id);
                      let action = "";
                      if (a.status === "confirmed" || a.status === "requested") {
                        action = `<button class="btn btn-sm btn-ghost" data-complete="${a.id}">Abschließen</button>`;
                      } else if (a.status === "completed" && !inv) {
                        action = `<button class="btn btn-sm btn-primary" data-create-from="${a.id}">Rechnung</button>`;
                      } else if (inv) {
                        action = `<button class="btn btn-sm btn-ghost" data-inv-preview="${inv.id}">${inv.number}</button>`;
                      }
                      return `<tr>
                        <td>${fmtDateTime(a.startsAt)}<div class="muted">${a.duration} Min</div></td>
                        <td>${c?.name || "—"}</td>
                        <td>${a.leistung}</td>
                        <td class="muted">${a.sku}<div>${p ? fmtMoney(p.price) : ""}</div></td>
                        <td>${loc?.name || "—"}</td>
                        <td>${apptBadge(a.status)}</td>
                        <td><div class="row-actions">${action}</div></td>
                      </tr>`;
                    })
                    .join("")
                : `<tr><td colspan="7" class="muted">Keine Termine in diesem Filter.</td></tr>`
            }
          </tbody>
        </table></div>
      </div>
    `;
  }

  function viewKatalog() {
    return `
      <div class="page-head">
        <div>
          <h1>Katalog</h1>
          <p>Phase-1 Sitzungen live · Phase-2 Kurse als Entwurf</p>
        </div>
      </div>
      <div class="panel">
        <div class="table-wrap"><table>
          <thead><tr><th>SKU</th><th>Name</th><th>Typ</th><th>Dauer</th><th>Preis</th><th>Phase</th><th>Status</th></tr></thead>
          <tbody>
            ${D.products
              .map(
                (p) => `<tr>
                  <td><code>${p.sku}</code></td>
                  <td>${p.name}${p.note ? `<div class="muted">${p.note}</div>` : ""}</td>
                  <td>${p.type}</td>
                  <td>${p.duration ? p.duration + " Min" : "—"}</td>
                  <td class="money">${p.price != null ? fmtMoney(p.price) : "TBD"}</td>
                  <td>${p.phase}</td>
                  <td>${p.active ? `<span class="badge badge-ok">Aktiv</span>` : `<span class="badge badge-draft">Draft</span>`}</td>
                </tr>`
              )
              .join("")}
          </tbody>
        </table></div>
      </div>
      <div class="hint-box">Billing-Regel: Preis = Dauer + Alter (45′ 90 € / 60′ 120 € / Kinder 60′ 90 €). Leistungstag (Lowen, Physio …) steuert Rechnungstext, nicht den Preis.</div>
    `;
  }

  function flowStepsHtml(current) {
    const steps = [
      ["list", "1. Liste"],
      ["draft", "2. Entwurf"],
      ["preview", "3. PDF-Vorschau"],
      ["status", "4. Bezahlt / Überfällig"],
    ];
    return `<div class="flow-steps" role="navigation" aria-label="Rechnungsschritte">
      ${steps
        .map(
          ([id, label]) =>
            `<button type="button" class="flow-step${
              id === current ? " is-current" : ""
            }" data-inv-step="${id}" aria-current="${
              id === current ? "step" : "false"
            }">${label}</button>`
        )
        .join("")}
    </div>`;
  }

  function pickDemoInvoice(preferStatus) {
    if (state.invoiceId) {
      const selected = invoice(state.invoiceId);
      if (selected) return selected;
    }
    const order = preferStatus || ["sent", "overdue", "draft", "paid"];
    for (const st of order) {
      const hit = D.invoices.find((i) => i.status === st);
      if (hit) return hit;
    }
    return D.invoices[0] || null;
  }

  function goInvoiceStep(step) {
    state.filter = null;
    if (step === "list") {
      state.invoiceMode = "list";
      setView("rechnungen");
      return;
    }
    if (step === "draft") {
      const selected = state.invoiceId ? invoice(state.invoiceId) : null;
      if (selected?.status === "draft") {
        state.draftFromAppointmentId = selected.appointmentId || null;
        state.invoiceMode = "draft";
        setView("rechnungen");
        return;
      }
      const openAppt = state.draftFromAppointmentId
        ? appointment(state.draftFromAppointmentId)
        : null;
      if (openAppt) {
        const linked = D.invoices.find((i) => i.appointmentId === openAppt.id);
        if (linked?.status === "draft") {
          state.invoiceId = linked.id;
          state.invoiceMode = "draft";
          setView("rechnungen");
          return;
        }
        if (!linked) {
          state.invoiceId = null;
          state.invoiceMode = "draft";
          setView("rechnungen");
          return;
        }
      }
      const freeAppt = D.appointments.find(
        (a) =>
          a.status === "completed" &&
          !D.invoices.some((i) => i.appointmentId === a.id)
      );
      if (freeAppt) {
        state.draftFromAppointmentId = freeAppt.id;
        state.invoiceId = null;
        state.invoiceMode = "draft";
        setView("rechnungen");
        return;
      }
      const anyDraft = D.invoices.find((i) => i.status === "draft");
      if (anyDraft) {
        state.invoiceId = anyDraft.id;
        state.draftFromAppointmentId = anyDraft.appointmentId || null;
        state.invoiceMode = "draft";
        toast(`Demo: Entwurf ${anyDraft.number}`);
        setView("rechnungen");
        return;
      }
      toast("Bitte zuerst einen abgeschlossenen Termin wählen (Liste oder Termine).");
      state.invoiceMode = "list";
      setView("rechnungen");
      return;
    }
    if (step === "preview") {
      const inv = pickDemoInvoice(["draft", "sent", "overdue", "paid"]);
      if (!inv) {
        toast("Keine Rechnung vorhanden — zuerst Entwurf anlegen.");
        state.invoiceMode = "list";
        setView("rechnungen");
        return;
      }
      if (!state.invoiceId || !invoice(state.invoiceId)) {
        toast(`Demo: ${inv.number} geöffnet (keine Auswahl)`);
      }
      state.invoiceId = inv.id;
      state.invoiceMode = "preview";
      setView("rechnungen");
      return;
    }
    if (step === "status") {
      const inv = pickDemoInvoice(["overdue", "sent", "draft", "paid"]);
      if (!inv) {
        toast("Keine Rechnung vorhanden — zuerst Entwurf anlegen.");
        state.invoiceMode = "list";
        setView("rechnungen");
        return;
      }
      if (!state.invoiceId || !invoice(state.invoiceId)) {
        toast(`Demo: Status für ${inv.number}`);
      }
      state.invoiceId = inv.id;
      state.invoiceMode = "status";
      setView("rechnungen");
    }
  }

  function viewRechnungen() {
    if (state.invoiceMode === "draft") return viewInvoiceDraft();
    if (state.invoiceMode === "preview") return viewInvoicePreview();
    if (state.invoiceMode === "status") return viewInvoiceStatus();
    return viewInvoiceList();
  }

  function viewInvoiceList() {
    const f = state.filter;
    let list = [...D.invoices];
    let title = "Rechnungen";
    let subtitle = "Entwurf → gesendet → bezahlt / überfällig";
    let debtorBlock = "";

    if (f === "drafts") {
      list = list.filter((i) => i.status === "draft");
      title = "Entwürfe";
      subtitle = "Rechnungen im Status Entwurf";
    } else if (f === "overdue") {
      list = list.filter((i) => i.status === "overdue");
      title = "Überfällig — Mahnung möglich";
      subtitle = "Schuldner mit überfälliger Rechnung";
      debtorBlock = `
        <div class="debtor-list" aria-label="Schuldner">
          ${list
            .map((inv) => {
              const c = contact(inv.contactId);
              return `<div class="debtor-card">
                <div>
                  <strong>${c?.name || "—"}</strong>
                  <div class="muted">${c?.email || ""} · ${c?.phone || ""}</div>
                  <div class="muted">Rechnung ${inv.number} · fällig ${fmtDate(inv.dueDate)}</div>
                </div>
                <div class="row-actions">
                  <span class="money">${fmtMoney(inv.total)}</span>
                  <button class="btn btn-sm btn-danger" data-toast="Demo: Mahnung an ${c?.name || "Kontakt"} — E-Mail-Mock">Mahnung</button>
                  <button class="btn btn-sm btn-ghost" data-inv-preview="${inv.id}">Rechnung</button>
                  <button class="btn btn-sm btn-ghost" data-inv-status="${inv.id}">Status</button>
                </div>
              </div>`;
            })
            .join("")}
        </div>
      `;
    } else if (f === "open_amount") {
      list = list.filter((i) => ["sent", "overdue"].includes(i.status));
      title = "Offener Betrag";
      subtitle = `Unbezahlt: gesendet + überfällig · Summe ${fmtMoney(
        list.reduce((s, i) => s + i.total, 0)
      )}`;
    }

    const sorted = list.sort((a, b) => b.number.localeCompare(a.number));
    return `
      <div class="page-head">
        <div>
          <h1>${title}</h1>
          <p>${subtitle}</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-ghost" data-go="termine">Aus Termin</button>
          <button class="btn btn-primary" data-inv-step="draft">+ Entwurf</button>
        </div>
      </div>
      ${filterBarHtml()}
      ${flowStepsHtml("list")}
      ${debtorBlock}
      <div class="panel">
        <div class="table-wrap"><table>
          <thead><tr><th>Nr.</th><th>Kontakt</th><th>Datum</th><th>Fällig</th><th>Betrag</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${
              sorted.length
                ? sorted
                    .map((inv) => {
                      const c = contact(inv.contactId);
                      return `<tr class="clickable" data-inv-preview="${inv.id}">
                        <td><strong>${inv.number}</strong></td>
                        <td>${c?.name || "—"}</td>
                        <td>${fmtDate(inv.issueDate)}</td>
                        <td>${fmtDate(inv.dueDate)}</td>
                        <td class="money">${fmtMoney(inv.total)}</td>
                        <td>${invBadge(inv.status)}</td>
                        <td><div class="row-actions">
                          <button class="btn btn-sm btn-ghost" data-inv-preview="${inv.id}">PDF</button>
                          <button class="btn btn-sm btn-ghost" data-inv-status="${inv.id}">Status</button>
                        </div></td>
                      </tr>`;
                    })
                    .join("")
                : `<tr><td colspan="7" class="muted">Keine Rechnungen in diesem Filter.</td></tr>`
            }
          </tbody>
        </table></div>
      </div>
    `;
  }

  function viewInvoiceDraft() {
    const existing = state.invoiceId ? invoice(state.invoiceId) : null;
    const editingDraft = existing && existing.status === "draft" ? existing : null;
    const appt =
      appointment(state.draftFromAppointmentId) ||
      (editingDraft?.appointmentId ? appointment(editingDraft.appointmentId) : null);
    const c = appt
      ? contact(appt.contactId)
      : editingDraft
        ? contact(editingDraft.contactId)
        : null;
    const p = appt ? product(appt.sku) : null;
    const loc = appt ? location(appt.locationId) : null;
    const line = editingDraft?.lines?.[0];
    const desc =
      line?.description ||
      (appt
        ? `Physiotherapeutische Behandlung / Körperarbeit, ${appt.duration} Min (${appt.leistung})`
        : "");
    const price = line?.unitPrice ?? p?.price ?? 0;
    const qty = line?.qty ?? 1;
    const nextNum =
      editingDraft?.number ||
      "2026-" +
        String(
          Math.max(
            ...D.invoices.map((i) => parseInt(i.number.split("-")[1], 10)),
            0
          ) + 1
        ).padStart(4, "0");
    const issueVal =
      editingDraft?.issueDate || (appt ? appt.startsAt.slice(0, 10) : "");
    const dueVal =
      editingDraft?.dueDate ||
      (appt ? duePlus(appt.startsAt.slice(0, 10), 14) : "");
    const skuVal = line?.sku || appt?.sku || "";

    if (!editingDraft && !appt) {
      return `
        <button class="back-link" data-inv-list>← Zurück zur Liste</button>
        ${flowStepsHtml("draft")}
        <div class="hint-box">
          Kein Termin / Entwurf gewählt. Bitte in der Liste eine Rechnung öffnen oder unter Termine einen abgeschlossenen Termin abrechnen.
        </div>
        <div class="page-actions">
          <button class="btn btn-ghost" data-inv-step="list">Zur Liste</button>
          <button class="btn btn-primary" data-go="termine">Zu Terminen</button>
        </div>
      `;
    }

    return `
      <button class="back-link" data-inv-list>← Zurück zur Liste</button>
      <div class="page-head">
        <div>
          <h1>Rechnung · Entwurf</h1>
          <p>${
            editingDraft
              ? `Bestehenden Entwurf ${editingDraft.number} bearbeiten`
              : "Aus Termin erzeugt · vor dem Senden prüfen"
          }</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-ghost" data-inv-list>Abbrechen</button>
          <button class="btn btn-primary" data-save-draft>${
            editingDraft ? "Speichern &amp; Vorschau" : "Entwurf speichern &amp; Vorschau"
          }</button>
        </div>
      </div>
      ${flowStepsHtml("draft")}
      <div class="panel">
        <div class="panel-body pad">
          <div class="form-grid">
            <label class="field">Rechnungsnr.<input id="f-number" value="${nextNum}" readonly /></label>
            <label class="field">Status<select id="f-status"><option value="draft">Entwurf</option></select></label>
            <label class="field">Kontakt<input value="${c?.name || ""}" readonly /></label>
            <label class="field">E-Mail<input value="${c?.email || ""}" readonly /></label>
            <label class="field">Leistungsdatum<input id="f-issue" type="date" value="${issueVal}" /></label>
            <label class="field">Fällig am<input id="f-due" type="date" value="${dueVal}" /></label>
            <label class="field">Standort<input value="${loc?.name || ""}" readonly /></label>
            <label class="field">SKU<input value="${skuVal}" readonly /></label>
            <label class="field full">Positionsbeschreibung<textarea id="f-desc" rows="2">${desc}</textarea></label>
            <label class="field">Menge<input id="f-qty" type="number" value="${qty}" min="1" /></label>
            <label class="field">Einzelpreis (€)<input id="f-price" type="number" value="${price}" /></label>
          </div>
          <p style="margin-top:1rem" class="muted">MwSt / Kleinunternehmer §19 — Feld tax_regime später · IBAN nicht in diesem Prototyp.</p>
        </div>
      </div>
    `;
  }

  function duePlus(isoDate, days) {
    const d = new Date(isoDate + "T12:00:00");
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function viewInvoicePreview() {
    const inv = invoice(state.invoiceId);
    if (!inv) {
      return `<p>Rechnung nicht gefunden.</p><button class="btn btn-ghost" data-inv-list>Zurück</button>`;
    }
    const c = contact(inv.contactId);
    const line = inv.lines[0];

    return `
      <button class="back-link" data-inv-list>← Zurück zur Liste</button>
      <div class="page-head">
        <div>
          <h1>Rechnung ${inv.number}</h1>
          <p>PDF-Vorschau (Mock) · ${invBadge(inv.status)}</p>
        </div>
        <div class="page-actions">
          ${
            inv.status === "draft"
              ? `<button class="btn btn-primary" data-mark-sent="${inv.id}">Als gesendet markieren</button>`
              : ""
          }
          <button class="btn btn-ghost" data-inv-status="${inv.id}">Zahlungsstatus</button>
          <button class="btn btn-ghost" data-toast="Demo: PDF-Download — Backend folgt">PDF herunterladen</button>
        </div>
      </div>
      ${flowStepsHtml("preview")}
      <div class="pdf-sheet">
        <div class="pdf-head">
          <div>
            <div class="pdf-brand">${D.practice.name}</div>
            <div class="muted">${D.practice.subtitle}</div>
            <div class="muted" style="margin-top:0.5rem">Hubertusstr. 1a · 80639 München<br>${D.practice.email} · ${D.practice.phone}</div>
          </div>
          <div class="pdf-meta">
            <strong>Rechnung</strong>
            Nr. ${inv.number}<br>
            Datum: ${fmtDate(inv.issueDate)}<br>
            Fällig: ${fmtDate(inv.dueDate)}
          </div>
        </div>
        <div class="pdf-parties">
          <div>
            <h3>Empfänger</h3>
            <div>${c?.name || "—"}<br>${c?.email || ""}<br>${c?.phone || ""}</div>
          </div>
          <div>
            <h3>Zahlungsinfo</h3>
            <div>Überweisung · Verwendungszweck: <strong>${inv.number}</strong><br>
            <span class="muted">IBAN: [nur in secure config]</span></div>
          </div>
        </div>
        <table class="pdf-table">
          <thead><tr><th>Position</th><th>Menge</th><th>Preis</th><th>Summe</th></tr></thead>
          <tbody>
            <tr>
              <td>${line.description}</td>
              <td>${line.qty}</td>
              <td>${fmtMoney(line.unitPrice)}</td>
              <td class="money">${fmtMoney(line.qty * line.unitPrice)}</td>
            </tr>
          </tbody>
        </table>
        <div class="pdf-total">Gesamtbetrag: ${fmtMoney(inv.total)}</div>
        <div class="pdf-note">
          Hinweis: Viele Krankenkassen erstatten anteilig — bitte bei Ihrer Kasse nachfragen.<br>
          Steuerhinweis (Demo): Kleinunternehmer / MwSt — mit Sabine &amp; Steuerberater klären.
        </div>
      </div>
    `;
  }

  function viewInvoiceStatus() {
    const inv = invoice(state.invoiceId);
    if (!inv) {
      return `<p>Rechnung nicht gefunden.</p><button class="btn btn-ghost" data-inv-list>Zurück</button>`;
    }
    const c = contact(inv.contactId);
    const canPay = ["sent", "overdue", "draft", "partial"].includes(inv.status);
    const canOverdue = ["sent", "draft", "partial"].includes(inv.status);
    const canMahnung = ["overdue", "sent"].includes(inv.status);

    return `
      <button class="back-link" data-inv-list>← Zurück zur Liste</button>
      <div class="page-head">
        <div>
          <h1>Bezahlt / Überfällig</h1>
          <p>Zahlungsstatus für ${inv.number} · ${c?.name || "—"}</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-ghost" data-inv-preview="${inv.id}">PDF-Vorschau</button>
        </div>
      </div>
      ${flowStepsHtml("status")}
      <div class="panel">
        <div class="panel-body pad">
          <div class="form-grid">
            <label class="field">Rechnung<input value="${inv.number}" readonly /></label>
            <label class="field">Status<div style="padding-top:0.45rem">${invBadge(inv.status)}</div></label>
            <label class="field">Kontakt<input value="${c?.name || ""}" readonly /></label>
            <label class="field">Betrag<input value="${fmtMoney(inv.total)}" readonly /></label>
            <label class="field">Ausgestellt<input value="${fmtDate(inv.issueDate)}" readonly /></label>
            <label class="field">Fällig<input value="${fmtDate(inv.dueDate)}" readonly /></label>
          </div>
          <div class="row-actions" style="margin-top:1.25rem">
            ${
              canPay
                ? `<button class="btn btn-primary" data-mark-paid="${inv.id}">Als bezahlt markieren</button>`
                : `<button class="btn btn-ghost" data-toast="Bereits bezahlt">Bezahlt ✓</button>`
            }
            ${
              canOverdue
                ? `<button class="btn btn-danger" data-mark-overdue="${inv.id}">Als überfällig markieren</button>`
                : ""
            }
            ${
              canMahnung
                ? `<button class="btn btn-ghost" data-toast="Demo: Mahnung an ${c?.name || "Kontakt"} — E-Mail-Mock">Mahnung senden</button>`
                : ""
            }
            ${
              inv.status === "draft"
                ? `<button class="btn btn-ghost" data-mark-sent="${inv.id}">Als gesendet markieren</button>`
                : ""
            }
          </div>
          <p class="muted" style="margin-top:1rem">MVP: Status manuell setzen · SEPA später · keine automatische Mahnung.</p>
        </div>
      </div>
    `;
  }

  function viewZahlungen() {
    const rows = [];
    D.invoices.forEach((inv) => {
      const pays = D.payments.filter((p) => p.invoiceId === inv.id && p.amount > 0);
      if (pays.length) {
        pays.forEach((p) =>
          rows.push({
            inv,
            pay: p,
            kind: "payment",
          })
        );
      } else if (["sent", "overdue"].includes(inv.status)) {
        rows.push({ inv, pay: null, kind: "open" });
      } else if (inv.status === "paid") {
        rows.push({
          inv,
          pay: {
            method: "ueberweisung",
            amount: inv.total,
            paidAt: inv.issueDate,
            reference: inv.number,
          },
          kind: "payment",
        });
      }
    });

    return `
      <div class="page-head">
        <div>
          <h1>Zahlungen</h1>
          <p>MVP: SEPA-Überweisung · manuell als bezahlt markieren</p>
        </div>
      </div>
      <div class="panel">
        <div class="table-wrap"><table>
          <thead><tr><th>Rechnung</th><th>Kontakt</th><th>Methode</th><th>Betrag</th><th>Datum</th><th>Ref.</th><th></th></tr></thead>
          <tbody>
            ${rows
              .map(({ inv, pay, kind }) => {
                const c = contact(inv.contactId);
                if (kind === "open") {
                  return `<tr>
                    <td>${inv.number} ${invBadge(inv.status)}</td>
                    <td>${c?.name || "—"}</td>
                    <td class="muted">—</td>
                    <td class="money">${fmtMoney(inv.total)}</td>
                    <td class="muted">offen</td>
                    <td class="muted">${inv.number}</td>
                    <td><button class="btn btn-sm btn-primary" data-mark-paid="${inv.id}">Bezahlt</button></td>
                  </tr>`;
                }
                return `<tr>
                  <td>${inv.number}</td>
                  <td>${c?.name || "—"}</td>
                  <td>${methodLabel(pay.method)}</td>
                  <td class="money">${fmtMoney(pay.amount)}</td>
                  <td>${fmtDate(pay.paidAt)}</td>
                  <td class="muted">${pay.reference}</td>
                  <td><button class="btn btn-sm btn-ghost" data-inv-preview="${inv.id}">Rechnung</button></td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table></div>
      </div>
    `;
  }

  function viewWaitlist() {
    const fromKpi = state.filter === "waitlist";
    return `
      <div class="page-head">
        <div>
          <h1>Warteliste</h1>
          <p>${
            fromKpi
              ? "Drill-down vom Dashboard · Kurse / Coaching / Patienten-Abend"
              : "Kurse / Coaching / Patienten-Abend · Capture ohne Rechnung"
          }</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" data-toast="Demo: Eintrag — Formular kommt vom Website-Funnel">+ Eintrag</button>
        </div>
      </div>
      ${filterBarHtml()}
      <div class="panel">
        <div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Interesse</th><th>Einwilligung</th><th>Seit</th></tr></thead>
          <tbody>
            ${D.waitlist
              .map((w) => {
                const c = w.contactId ? contact(w.contactId) : null;
                const name = c?.name || w.name || "—";
                const email = c?.email || w.email || "";
                return `<tr>
                  <td><strong>${name}</strong><div class="muted">${email}</div></td>
                  <td><span class="badge badge-accent">${w.interestLabel}</span></td>
                  <td>${w.consent ? `<span class="badge badge-ok">Ja</span>` : `<span class="badge badge-danger">Nein</span>`}</td>
                  <td>${fmtDate(w.createdAt)}</td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table></div>
      </div>
      <div class="hint-box">Warteliste erzeugt keine Rechnung bis zu einem echten Kurs-Event (Phase 2).</div>
    `;
  }

  /* ——— actions ——— */
  function completeAppointment(id) {
    const a = appointment(id);
    if (!a) return;
    a.status = "completed";
    const c = contact(a.contactId);
    if (c) c.pipeline = "visited";
    toast(`Termin abgeschlossen: ${c?.name || id}`);
    setView("termine");
  }

  function openDraftFrom(apptId) {
    const existing = D.invoices.find((i) => i.appointmentId === apptId);
    if (existing) {
      state.invoiceId = existing.id;
      state.invoiceMode = "preview";
      setView("rechnungen");
      return;
    }
    state.draftFromAppointmentId = apptId;
    state.invoiceMode = "draft";
    setView("rechnungen");
  }

  function saveDraft() {
    const number = document.getElementById("f-number")?.value || "2026-0000";
    const issueDate = document.getElementById("f-issue")?.value;
    const dueDate = document.getElementById("f-due")?.value;
    const desc = document.getElementById("f-desc")?.value || "";
    const qty = Number(document.getElementById("f-qty")?.value || 1);
    const unitPrice = Number(document.getElementById("f-price")?.value || 0);
    const existing =
      (state.invoiceId && invoice(state.invoiceId)?.status === "draft"
        ? invoice(state.invoiceId)
        : null) || null;
    const appt = appointment(state.draftFromAppointmentId);

    if (existing) {
      existing.issueDate = issueDate;
      existing.dueDate = dueDate;
      existing.total = qty * unitPrice;
      existing.lines = [
        {
          sku: existing.lines?.[0]?.sku || appt?.sku || "",
          description: desc,
          qty,
          unitPrice,
        },
      ];
      state.invoiceId = existing.id;
      state.invoiceMode = "preview";
      state.draftFromAppointmentId = null;
      toast(`Entwurf ${existing.number} aktualisiert`);
      setView("rechnungen");
      return;
    }

    if (!appt) {
      toast("Kein Termin verknüpft");
      return;
    }
    const id = "inv" + (D.invoices.length + 1) + Date.now().toString(36).slice(-3);
    const inv = {
      id,
      number,
      contactId: appt.contactId,
      appointmentId: appt.id,
      status: "draft",
      issueDate,
      dueDate,
      total: qty * unitPrice,
      lines: [
        {
          sku: appt.sku,
          description: desc,
          qty,
          unitPrice,
        },
      ],
    };
    D.invoices.push(inv);
    const c = contact(appt.contactId);
    if (c) c.pipeline = "invoiced";
    state.invoiceId = id;
    state.invoiceMode = "preview";
    state.draftFromAppointmentId = null;
    toast(`Entwurf ${number} gespeichert`);
    setView("rechnungen");
  }

  function afterInvoiceStatusChange(id) {
    if (state.view === "zahlungen") {
      setView("zahlungen");
      return;
    }
    const mode = state.invoiceMode === "status" ? "status" : "preview";
    setView("rechnungen", { invoiceMode: mode, invoiceId: id });
  }

  function markSent(id) {
    const inv = invoice(id);
    if (!inv) return;
    inv.status = "sent";
    toast(`${inv.number} als gesendet markiert (E-Mail-Mock)`);
    afterInvoiceStatusChange(id);
  }

  function markPaid(id) {
    const inv = invoice(id);
    if (!inv) return;
    inv.status = "paid";
    D.payments.push({
      id: "pay" + Date.now(),
      invoiceId: inv.id,
      method: "ueberweisung",
      amount: inv.total,
      paidAt: new Date().toISOString().slice(0, 10),
      reference: inv.number,
    });
    const c = contact(inv.contactId);
    if (c) c.pipeline = "paid";
    toast(`${inv.number} bezahlt`);
    afterInvoiceStatusChange(id);
  }

  function markOverdue(id) {
    const inv = invoice(id);
    if (!inv) return;
    inv.status = "overdue";
    const c = contact(inv.contactId);
    if (c) c.pipeline = "overdue";
    toast(`${inv.number} überfällig · Mahnung-Mock`);
    afterInvoiceStatusChange(id);
  }

  function render() {
    const views = {
      overview: viewOverview,
      kontakte: viewContacts,
      termine: viewTermine,
      katalog: viewKatalog,
      rechnungen: viewRechnungen,
      zahlungen: viewZahlungen,
      waitlist: viewWaitlist,
    };
    const fn = views[state.view] || viewOverview;
    el.content.innerHTML = fn();
  }

  /* ——— events ——— */
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.view === "rechnungen") {
        state.invoiceMode = "list";
        state.invoiceId = null;
      }
      setView(btn.dataset.view, { clearFilter: true });
    });
  });

  el.content.addEventListener("click", (e) => {
    const t = e.target.closest(
      "[data-kpi],[data-clear-filter],[data-go],[data-toast],[data-complete],[data-create-from],[data-inv-preview],[data-inv-status],[data-inv-step],[data-inv-list],[data-save-draft],[data-mark-sent],[data-mark-paid],[data-mark-overdue]"
    );
    if (!t) return;

    if (t.dataset.kpi) {
      drillDown(t.dataset.kpi);
      return;
    }
    if (t.hasAttribute("data-clear-filter")) {
      clearFilter();
      return;
    }
    if (t.dataset.go) {
      if (t.dataset.go === "rechnungen") {
        state.invoiceMode = "list";
      }
      setView(t.dataset.go, { clearFilter: true });
      return;
    }
    if (t.dataset.toast) {
      toast(t.dataset.toast);
      return;
    }
    if (t.dataset.complete) {
      completeAppointment(t.dataset.complete);
      return;
    }
    if (t.dataset.createFrom) {
      openDraftFrom(t.dataset.createFrom);
      return;
    }
    if (t.dataset.invStep) {
      goInvoiceStep(t.dataset.invStep);
      return;
    }
    if (t.dataset.invPreview) {
      state.invoiceId = t.dataset.invPreview;
      state.invoiceMode = "preview";
      state.filter = null;
      setView("rechnungen");
      return;
    }
    if (t.dataset.invStatus) {
      state.invoiceId = t.dataset.invStatus;
      state.invoiceMode = "status";
      state.filter = null;
      setView("rechnungen");
      return;
    }
    if (t.hasAttribute("data-inv-list")) {
      state.invoiceMode = "list";
      setView("rechnungen");
      return;
    }
    if (t.hasAttribute("data-save-draft")) {
      saveDraft();
      return;
    }
    if (t.dataset.markSent) {
      markSent(t.dataset.markSent);
      return;
    }
    if (t.dataset.markPaid) {
      markPaid(t.dataset.markPaid);
      return;
    }
    if (t.dataset.markOverdue) {
      markOverdue(t.dataset.markOverdue);
      return;
    }
  });

  setView("overview");
})();
