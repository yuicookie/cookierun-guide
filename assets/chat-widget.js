/* ==========================================================================
   クッキーラン情報サイト - AIチャットウィジェット (chat-widget.js)
   全ページで読み込む。common.js（script.js）とは役割を分けるため別ファイルにしている。

   バックエンドはCloudflare Workers上のエンドポイント（/api/web-chat）。
   PC版は画面右側にパネルとして開き、スマホ版は画面いっぱいに開く（CSS側で切り替え）。
   会話履歴はサーバー側にも保存されるが、これはあくまでAIが文脈を踏まえた回答をする
   ための仕組みで、匿名ID（このブラウザだけが持つランダムなID）に紐づく。
   個人を特定する情報ではないが、詳細はプライバシーポリシーページを参照。
   ========================================================================== */
(function () {
  "use strict";

  // ここをCloudflare Workersの実際のURLに合わせて確認・変更してください。
  // LINE Botと同じWorkerに /api/web-chat エンドポイントを追加している構成を想定。
  var CHAT_API_ENDPOINT = "https://line-gemini-bot.wizardcookie.workers.dev/api/web-chat";

  var ANON_ID_KEY = "cr_chat_anon_id"; // localStorageに保存する匿名IDのキー
  var MAX_MESSAGE_LENGTH = 500; // サーバー側の上限と合わせる

  /* ---------- 匿名ID（このブラウザ用のランダムなID）の取得・発行 ---------- */
  function getOrCreateAnonymousId() {
    var id = null;
    try {
      id = localStorage.getItem(ANON_ID_KEY);
    } catch (e) {
      /* プライベートブラウジング等でlocalStorageが使えない場合は毎回新規発行になる */
    }
    if (id) return id;

    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      id = window.crypto.randomUUID();
    } else {
      // 古いブラウザ向けの簡易フォールバック（暗号学的な安全性は不要な用途のため簡略版）
      id = "anon-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
    }
    try {
      localStorage.setItem(ANON_ID_KEY, id);
    } catch (e) {
      /* 保存できなくても、この回だけは発行したIDでそのまま動作を継続する */
    }
    return id;
  }

  /* ---------- チャットウィジェット本体 ---------- */
  function initChatWidget() {
    var launcher = document.getElementById("cr-chat-toggle");
    var panel = document.getElementById("cr-chat-panel");
    var closeBtn = document.getElementById("cr-chat-close");
    var form = document.getElementById("cr-chat-form");
    var input = document.getElementById("cr-chat-input");
    var messagesEl = document.getElementById("cr-chat-messages");
    if (!launcher || !panel || !form || !input || !messagesEl) return;

    var anonymousId = getOrCreateAnonymousId();
    var isSending = false;

    function appendMessage(role, text) {
      var el = document.createElement("p");
      el.className =
        "cr-chat-msg " +
        (role === "user" ? "cr-chat-msg--user" : role === "error" ? "cr-chat-msg--error" : "cr-chat-msg--bot");
      el.textContent = text;
      messagesEl.appendChild(el);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function openPanel() {
      panel.hidden = false;
      launcher.setAttribute("aria-expanded", "true");
      document.body.style.overflow = "hidden";
      input.focus();
      if (messagesEl.childElementCount === 0) {
        // 初回だけ、ウィジェットの案内メッセージを表示する（サーバーには送らない）
        appendMessage("bot", "こんにちは！クッキーランについて気になることを聞いてね。");
      }
    }

    function closePanel() {
      panel.hidden = true;
      launcher.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
    }

    launcher.addEventListener("click", function () {
      if (panel.hidden) {
        openPanel();
      } else {
        closePanel();
      }
    });
    if (closeBtn) closeBtn.addEventListener("click", closePanel);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !panel.hidden) closePanel();
    });

    // Enterで送信、Shift+Enterで改行（一般的なチャットUIの挙動に合わせる）
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (isSending) return;

      var text = input.value.trim();
      if (!text) return;
      if (text.length > MAX_MESSAGE_LENGTH) {
        appendMessage("error", "メッセージが長すぎます（" + MAX_MESSAGE_LENGTH + "文字以内にしてください）。");
        return;
      }

      appendMessage("user", text);
      input.value = "";
      isSending = true;
      input.disabled = true;

      var thinkingEl = document.createElement("p");
      thinkingEl.className = "cr-chat-msg cr-chat-msg--bot cr-chat-msg--thinking";
      thinkingEl.textContent = "考え中…";
      messagesEl.appendChild(thinkingEl);
      messagesEl.scrollTop = messagesEl.scrollHeight;

      fetch(CHAT_API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, anonymousId: anonymousId }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, status: res.status, data: data };
          });
        })
        .then(function (result) {
          thinkingEl.remove();
          if (result.ok && result.data && result.data.reply) {
            appendMessage("bot", result.data.reply);
          } else {
            var message =
              (result.data && result.data.error) ||
              "エラーが発生しました。しばらくしてから再度お試しください。";
            appendMessage("error", message);
          }
        })
        .catch(function () {
          thinkingEl.remove();
          appendMessage("error", "通信に失敗しました。ネットワーク状態を確認してもう一度お試しください。");
        })
        .finally(function () {
          isSending = false;
          input.disabled = false;
          input.focus();
        });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initChatWidget();
  });
})();
