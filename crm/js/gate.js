(() => {
  /** SHA-256 of demo passphrase — plaintext only in штаб/ops/sabine-zugang.md */
  const PASS_HASH =
    "13b833d93445a8d57c5a5b9a25ba24ea2164bbbd93ab2a505a3d6c3b9bdb6503";
  const STORAGE_KEY = "sabine_crm_gate_ok";

  async function sha256Hex(text) {
    const data = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(buf)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function unlock() {
    document.documentElement.classList.remove("gate-locked");
    const gate = document.getElementById("crm-gate");
    if (gate) gate.hidden = true;
  }

  function lock() {
    document.documentElement.classList.add("gate-locked");
    const gate = document.getElementById("crm-gate");
    if (gate) gate.hidden = false;
  }

  async function tryUnlock(password) {
    const hash = await sha256Hex(password.trim());
    if (hash !== PASS_HASH) return false;
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch (_) {
      /* private mode — still unlock this tab */
    }
    unlock();
    return true;
  }

  function alreadyOk() {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  function init() {
    const form = document.getElementById("crm-gate-form");
    const input = document.getElementById("crm-gate-pass");
    const err = document.getElementById("crm-gate-err");
    if (!form || !input) return;

    if (alreadyOk()) {
      unlock();
      return;
    }

    lock();
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (err) err.hidden = true;
      const ok = await tryUnlock(input.value);
      if (!ok) {
        input.value = "";
        input.focus();
        if (err) err.hidden = false;
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
