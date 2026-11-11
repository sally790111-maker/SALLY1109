(() => {
  "use strict";

  const TABLE_NAME = "repair_requests";
  const LIST_LIMIT = 20;
  const form = document.querySelector("#repair-form");
  const submitButton = document.querySelector("#submit-button");
  const refreshButton = document.querySelector("#refresh-button");
  const formMessage = document.querySelector("#form-message");
  const listMessage = document.querySelector("#list-message");
  const repairList = document.querySelector("#repair-list");
  const filterButtons = [...document.querySelectorAll(".filter-button")];
  let loadedRepairs = [];
  let activeUrgency = "全部";

  const config = window.APP_CONFIG;
  const supabaseLibrary = window.supabase;

  if (!config?.supabaseUrl || !config?.supabasePublishableKey || !supabaseLibrary?.createClient) {
    showMessage(formMessage, "error", "系統設定尚未完成，請聯絡管理員。");
    showMessage(listMessage, "error", "目前無法載入報修清單。");
    repairList.replaceChildren();
    repairList.setAttribute("aria-busy", "false");
    submitButton.disabled = true;
    refreshButton.disabled = true;
    filterButtons.forEach((button) => {
      button.disabled = true;
    });
    return;
  }

  const client = supabaseLibrary.createClient(
    config.supabaseUrl,
    config.supabasePublishableKey,
  );

  form.addEventListener("submit", handleSubmit);
  refreshButton.addEventListener("click", loadRepairs);
  filterButtons.forEach((button) => button.addEventListener("click", handleFilter));
  loadRepairs();

  async function handleSubmit(event) {
    event.preventDefault();
    hideMessage(formMessage);

    if (!form.reportValidity()) {
      showMessage(formMessage, "error", "請完整填寫所有必填欄位。");
      return;
    }

    const formData = new FormData(form);
    const payload = {
      reporter_name: String(formData.get("reporter_name") ?? "").trim(),
      location: String(formData.get("location") ?? "").trim(),
      category: String(formData.get("category") ?? ""),
      description: String(formData.get("description") ?? "").trim(),
      urgency: String(formData.get("urgency") ?? "中"),
    };

    if (!payload.reporter_name || !payload.location || !payload.description) {
      showMessage(formMessage, "error", "文字欄位不可只輸入空白。");
      return;
    }

    setSubmitting(true);

    try {
      const { error } = await client.from("repair_request").insert(payload);
      if (error) throw error;

      form.reset();
      form.elements.urgency.value = "中";
      showMessage(formMessage, "success", "報修已成功送出，我們已將它加入待處理清單。");
      await loadRepairs();
    } catch (error) {
      console.error("新增報修失敗", error);
      showMessage(formMessage, "error", formatError(error, "送出失敗，請稍後再試。"));
    } finally {
      setSubmitting(false);
    }
  }

  async function loadRepairs() {
    repairList.setAttribute("aria-busy", "true");
    refreshButton.disabled = true;
    hideMessage(listMessage);
    showLoadingCard();

    try {
      const { data, error } = await client
        .from(TABLE_NAME)
        .select("id, created_at, reporter_name, location, category, description, urgency, status")
        .order("created_at", { ascending: false })
        .limit(LIST_LIMIT);

      if (error) throw error;
      loadedRepairs = data ?? [];
      renderFilteredRepairs();
    } catch (error) {
      console.error("載入報修清單失敗", error);
      loadedRepairs = [];
      repairList.replaceChildren();
      showMessage(listMessage, "error", formatError(error, "清單載入失敗，請稍後再試。"));
    } finally {
      repairList.setAttribute("aria-busy", "false");
      refreshButton.disabled = false;
    }
  }

  function handleFilter(event) {
    activeUrgency = event.currentTarget.dataset.urgency;
    filterButtons.forEach((button) => {
      const isActive = button.dataset.urgency === activeUrgency;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
    renderFilteredRepairs();
  }

  function renderFilteredRepairs() {
    const visibleRepairs = activeUrgency === "全部"
      ? loadedRepairs
      : loadedRepairs.filter((repair) => repair.urgency === activeUrgency);
    renderRepairs(visibleRepairs);
  }

  function renderRepairs(repairs) {
    repairList.replaceChildren();

    if (repairs.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-card";
      empty.textContent = activeUrgency === "全部"
        ? "目前還沒有報修紀錄。"
        : `目前沒有緊急程度為「${activeUrgency}」的報修。`;
      repairList.append(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    repairs.forEach((repair) => fragment.append(createRepairCard(repair)));
    repairList.append(fragment);
  }

  function createRepairCard(repair) {
    const article = document.createElement("article");
    article.className = "repair-card";

    const topLine = document.createElement("div");
    topLine.className = "card-topline";

    const badges = document.createElement("div");
    badges.className = "card-meta";
    badges.append(
      createBadge(repair.category || "未分類"),
      createBadge(`緊急程度：${repair.urgency || "未設定"}`, urgencyClass(repair.urgency)),
    );

    const status = document.createElement("span");
    status.className = "status";
    status.textContent = repair.status || "待處理";
    topLine.append(badges, status);

    const description = document.createElement("p");
    description.className = "card-description";
    description.textContent = repair.description || "未提供問題說明";

    const meta = document.createElement("div");
    meta.className = "card-meta";
    meta.append(
      createMetaText(repair.reporter_name || "未具名"),
      createMetaText(repair.location || "未提供地點"),
      createMetaText(formatDate(repair.created_at)),
    );

    article.append(topLine, description, meta);
    return article;
  }

  function createBadge(text, extraClass = "") {
    const badge = document.createElement("span");
    badge.className = `badge ${extraClass}`.trim();
    badge.textContent = text;
    return badge;
  }

  function createMetaText(text) {
    const span = document.createElement("span");
    span.textContent = text;
    return span;
  }

  function urgencyClass(urgency) {
    if (urgency === "高") return "high";
    if (urgency === "低") return "low";
    return "";
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "時間未提供";

    return new Intl.DateTimeFormat("zh-TW", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }

  function showLoadingCard() {
    const loading = document.createElement("div");
    loading.className = "loading-card";
    loading.textContent = "正在載入報修清單…";
    repairList.replaceChildren(loading);
  }

  function setSubmitting(isSubmitting) {
    submitButton.disabled = isSubmitting;
    submitButton.querySelector(".button-label").textContent = isSubmitting ? "送出中…" : "送出報修";
  }

  function showMessage(element, type, text) {
    element.className = `message ${type}`;
    element.textContent = text;
    element.hidden = false;
  }

  function hideMessage(element) {
    element.hidden = true;
    element.textContent = "";
    element.className = "message";
  }

  function formatError(error, fallback) {
    if (error?.code === "42501") return "目前沒有存取權限，請確認資料庫安全規則。";
    if (error?.code === "23514") return "資料格式不符合規則，請檢查欄位後再試。";
    return fallback;
  }
})();
