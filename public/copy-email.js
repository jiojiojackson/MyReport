(() => {
  const feedback = document.getElementById("copy-feedback");
  let feedbackTimer;
  let copiedButton;

  function showFeedback(message, button, copied) {
    clearTimeout(feedbackTimer);
    copiedButton?.removeAttribute("data-copied");
    copiedButton = copied ? button : null;
    copiedButton?.setAttribute("data-copied", "true");
    feedback.textContent = message;
    feedback.dataset.error = String(!copied);
    feedback.dataset.visible = "true";
    feedbackTimer = setTimeout(() => {
      feedback.removeAttribute("data-visible");
      feedback.textContent = "";
      copiedButton?.removeAttribute("data-copied");
      copiedButton = null;
    }, 2400);
  }

  function copyWithSelection(email) {
    const focused = document.activeElement;
    const field = document.createElement("textarea");
    field.value = email;
    field.readOnly = true;
    field.setAttribute("aria-hidden", "true");
    field.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0;font-size:16px";
    document.body.append(field);
    try {
      field.select();
      field.setSelectionRange(0, email.length);
      if (!document.execCommand("copy")) throw new Error("Copy failed");
    } finally {
      field.remove();
      focused?.focus({ preventScroll: true });
    }
  }

  async function copyEmail(email) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(email);
        return;
      } catch {
        // Older browsers or restricted clipboard access can use selection copy.
      }
    }
    copyWithSelection(email);
  }

  document.addEventListener("click", async (event) => {
    const button = event.target instanceof Element ? event.target.closest("button[data-copy-email]") : null;
    if (!button) return;
    try {
      await copyEmail(button.dataset.copyEmail);
      showFeedback("邮箱已复制", button, true);
    } catch {
      showFeedback("复制失败，请重试或手动复制邮箱", button, false);
    }
  });
})();
