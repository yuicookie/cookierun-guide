/* ==========================================================================
   クッキーラン情報サイト - 共通スクリプト (common.js)
   全ページで読み込む。ページ固有のJSはここに追加しない。
   ========================================================================== */
(function () {
  "use strict";

  var VERSION_KEY = "cr_version_pref"; // localStorageに保存するキー
  var root = document.documentElement;

  /* ---------- ゲーム表示切り替え ---------- */
  function applyVersion(v) {
    root.setAttribute("data-version", v);
    document.querySelectorAll(".version-switch button").forEach(function (btn) {
      var pressed = btn.getAttribute("data-version-btn") === v;
      btn.setAttribute("aria-pressed", pressed ? "true" : "false");
    });
  }

  function initVersionSwitch() {
    var saved = "both";
    try {
      saved = localStorage.getItem(VERSION_KEY) || "both";
    } catch (e) {
      /* プライベートブラウジング等でlocalStorageが使えない場合は既定値を使う */
    }
    applyVersion(saved);

    document.querySelectorAll(".version-switch button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var v = btn.getAttribute("data-version-btn");
        applyVersion(v);
        try {
          localStorage.setItem(VERSION_KEY, v);
        } catch (e) {
          /* 保存できなくても表示切り替え自体は継続する */
        }
      });
    });
  }

  /* ---------- サイドメニュー：カテゴリのアコーディオン開閉 ---------- */
  function initSidebarAccordion() {
    document.querySelectorAll(".category-toggle").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var cat = btn.closest(".sidebar-category");
        var open = cat.classList.toggle("is-open");
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      });
    });
  }

  /* ---------- スマートフォン：サイドメニューのドロワー開閉 ---------- */
  function initMobileMenu() {
    var sidebar = document.querySelector(".sidebar");
    var backdrop = document.querySelector(".sidebar-backdrop");
    var openBtn = document.querySelector(".menu-toggle");
    var closeBtn = document.querySelector(".sidebar-close");
    if (!sidebar || !openBtn) return;

    function openMenu() {
      sidebar.classList.add("is-open");
      if (backdrop) backdrop.classList.add("is-open");
      openBtn.setAttribute("aria-expanded", "true");
      document.body.style.overflow = "hidden";
    }
    function closeMenu() {
      sidebar.classList.remove("is-open");
      if (backdrop) backdrop.classList.remove("is-open");
      openBtn.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
    }

    openBtn.addEventListener("click", openMenu);
    if (closeBtn) closeBtn.addEventListener("click", closeMenu);
    if (backdrop) backdrop.addEventListener("click", closeMenu);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeMenu();
    });
    // メニュー内のリンクをタップしたら自動で閉じる
    sidebar.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", closeMenu);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initVersionSwitch();
    initSidebarAccordion();
    initMobileMenu();
  });
})();
