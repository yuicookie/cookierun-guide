/* ==========================================================================
   クッキーラン情報サイト - AIチャットウィジェット (chat-widget.js)
   全ページで読み込む。common.js（script.js）とは役割を分けるため別ファイルにしている。

   バックエンドはCloudflare Workers上のエンドポイント（/api/web-chat）。
   PC版は画面右側にパネルとして開き、スマホ版は画面いっぱいに開く（CSS側で切り替え）。

   会話の状態（画面表示・匿名ID）はどちらも sessionStorage に保存している。
   sessionStorageはタブ・ウィンドウを閉じると自動的に消えるため、
   「サイトを開いている間（別ページに移動しても）は会話が続き、閉じたら完全にリセットされる」
   という挙動になる（localStorageのように次回訪問時まで残ることはない）。
   ========================================================================== */
(function () {
  "use strict";

  var CHAT_API_ENDPOINT = "https://line-gemini-bot.wizardcookie.workers.dev/api/web-chat";

  var ANON_ID_KEY = "cr_chat_anon_id"; // sessionStorageに保存する匿名IDのキー
  var HISTORY_KEY = "cr_chat_history"; // sessionStorageに保存する画面表示用の会話ログのキー
  var MAX_MESSAGE_LENGTH = 500; // サーバー側の上限と合わせる

  /* ---------- 匿名ID（このタブ用のランダムなID）の取得・発行 ---------- */
  function getOrCreateAnonymousId() {
    var id = null;
    try {
      id = sessionStorage.getItem(ANON_ID_KEY);
    } catch (e) {
      /* プライベートブラウジング等でsessionStorageが使えない場合は毎回新規発行になる */
    }
    if (id) return id;

    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      id = window.crypto.randomUUID();
    } else {
      // 古いブラウザ向けの簡易フォールバック（暗号学的な安全性は不要な用途のため簡略版）
      id = "anon-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
    }
    try {
      sessionStorage.setItem(ANON_ID_KEY, id);
    } catch (e) {
      /* 保存できなくても、この回だけは発行したIDでそのまま動作を継続する */
    }
    return id;
  }

  /* ---------- 画面表示用の会話ログ（sessionStorageへの保存・復元） ---------- */
  function loadDisplayHistory() {
    try {
      var raw = sessionStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveDisplayHistory(history) {
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
      /* 保存に失敗しても、画面上の会話自体は継続できるので無視する */
    }
  }

  /* ---------- チャットウィジェット本体 ---------- */
  function initChatWidget() {
    var launcher = document.getElementById("cr-chat-toggle");
    var panel = document.getElementById("cr-chat-panel");
    var closeBtn = document.getElementById("cr-chat-close");
    var form = document.getElementById("cr-chat-form");
    var input = document.getElementById("cr-chat-input");
    var sendBtn = document.getElementById("cr-chat-send");
    var messagesEl = document.getElementById("cr-chat-messages");
    if (!launcher || !panel || !form || !input || !messagesEl) return;

    var anonymousId = getOrCreateAnonymousId();
    var displayHistory = loadDisplayHistory();
    var isSending = false;
    var retryCountdownTimer = null;

    /**
     * 1件のメッセージをDOMに追加する。
     * role: "user" | "bot" | "error"
     * persist: sessionStorageに保存する対象にするか（「考え中…」等の一時表示はfalseにする）
     */
    function appendMessage(role, text, persist) {
      var wrap = document.createElement("div");
      wrap.className =
        "cr-chat-row " + (role === "user" ? "cr-chat-row--user" : "cr-chat-row--bot");

      if (role === "bot") {
        var icon = document.createElement("img");
        icon.className = "cr-chat-avatar";
        icon.src = "assets/img/brave-cookie.png";
        icon.alt = "勇敢なクッキー";
        wrap.appendChild(icon);
      }

      var bubble = document.createElement("p");
      bubble.className =
        "cr-chat-msg " +
        (role === "user" ? "cr-chat-msg--user" : role === "error" ? "cr-chat-msg--error" : "cr-chat-msg--bot");
      bubble.textContent = text;
      wrap.appendChild(bubble);

      messagesEl.appendChild(wrap);
      messagesEl.scrollTop = messagesEl.scrollHeight;

      if (persist) {
        displayHistory.push({ role: role, text: text });
        saveDisplayHistory(displayHistory);
      }
      return wrap;
    }

    function restoreDisplayHistory() {
      if (displayHistory.length === 0) {
        // 初回だけ、ウィジェットの案内メッセージを表示する（保存はしない。
        // 毎回同じ案内文をログに残す必要はないため）
        appendMessage("bot", "ボクの名前は勇敢なクッキーだよ！クッキーランについて気になることを聞いてね！", false);
        return;
      }
      displayHistory.forEach(function (turn) {
        appendMessage(turn.role, turn.text, false);
      });
    }

    function openPanel() {
      panel.hidden = false;
      launcher.setAttribute("aria-expanded", "true");
      // 背景（ページ本体）のスクロールを止める。チャット内のスクロールとページ全体の
      // スクロールが同時に反応してしまう（チャットをスクロールしたつもりが背後の記事も
      // スクロールしてしまう）現象を防ぐための定番の対処法。
      document.body.style.overflow = "hidden";
      input.focus();
    }

    function closePanel() {
      panel.hidden = true;
      launcher.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
      // キーボード追従用に付与したインラインスタイルを次回オープン時のために
      // クリアしておく（付けたままだと次回開いたときに古い位置がちらつく）。
      panel.style.transform = "";
      panel.style.height = "";
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

    // スマホでソフトキーボードが開いた際、visualViewportのサイズ・スクロール位置の
    // 変化に合わせてパネルの位置と高さを追従させる。
    //
    // 高さだけを visualViewport.height に合わせても、iOS Safari等では
    // キーボード表示時にレイアウトビューポート自体が上にスクロールされることがあり、
    // position:fixed の要素はそのスクロール分だけ画面上部にズレて見えてしまう
    // （＝「チャット画面がかなり上の方に行ってしまう」現象）。
    // これを防ぐため、offsetTop（スクロールされた量）分だけ transform で
    // パネルを押し下げて、常に画面内の正しい位置に留まるようにする。
    if (window.visualViewport) {
      var syncViewport = function () {
        if (panel.hidden) return;
        var vv = window.visualViewport;
        panel.style.height = vv.height + "px";
        panel.style.transform = vv.offsetTop ? "translateY(" + vv.offsetTop + "px)" : "";
      };
      window.visualViewport.addEventListener("resize", syncViewport);
      window.visualViewport.addEventListener("scroll", syncViewport);
    }

    // Ctrl+Enter（Macの場合はCmd+Enterも）で送信、Enter単体は普通に改行する。
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        form.requestSubmit();
      }
    });

    function setSendingState(sending) {
      isSending = sending;
      // 入力欄(textarea)自体は無効化しない。返信を待っている間も次のメッセージを
      // 打ち始められるようにするため。二重送信の防止は isSending フラグと
      // 送信ボタンの disabled 属性側で行う（下のsubmitハンドラ冒頭のガードを参照）。
      if (sendBtn) sendBtn.disabled = sending;
    }

    /** レート制限（429）時、送信ボタンに「あと◯秒」のカウントダウンを表示する */
    function startRetryCountdown(seconds, errorRowEl) {
      if (retryCountdownTimer) {
        clearInterval(retryCountdownTimer);
      }
      var remaining = Math.max(1, Math.round(seconds));
      setSendingState(true);

      function render() {
        if (sendBtn) {
          sendBtn.textContent = "あと" + remaining + "秒待ってね";
        }
      }
      render();

      retryCountdownTimer = setInterval(function () {
        remaining -= 1;
        if (remaining <= 0) {
          clearInterval(retryCountdownTimer);
          retryCountdownTimer = null;
          setSendingState(false);
          if (sendBtn) sendBtn.textContent = "送信";
          input.focus();
          return;
        }
        render();
      }, 1000);
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (isSending) return;

      var text = input.value.trim();
      if (!text) return;
      if (text.length > MAX_MESSAGE_LENGTH) {
        appendMessage("error", "メッセージが長すぎます（" + MAX_MESSAGE_LENGTH + "文字以内にしてください）。", false);
        return;
      }

      appendMessage("user", text, true);
      input.value = "";
      setSendingState(true);

      var thinkingRow = appendMessage("bot", "考え中…", false);
      thinkingRow.classList.add("cr-chat-row--thinking");

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
          thinkingRow.remove();
          if (result.ok && result.data && result.data.reply) {
            appendMessage("bot", result.data.reply, true);
            setSendingState(false);
          } else if (result.status === 429 && result.data) {
            // アクセス集中によるレート制限。「しばらくお待ちください」だけだと
            // どれくらい待てばいいか分からず問い合わせにつながりやすいため、
            // 具体的な残り秒数をボタンの表示でカウントダウンする。
            appendMessage("error", result.data.error || "アクセスが集中しています。", false);
            var retryAfter = result.data.retryAfterSeconds || 60;
            startRetryCountdown(retryAfter);
            return; // setSendingState(false) はカウントダウン終了時に行われる
          } else {
            var message =
              (result.data && result.data.error) ||
              "エラーが発生しました。しばらくしてから再度お試しください。";
            appendMessage("error", message, false);
            setSendingState(false);
          }
        })
        .catch(function () {
          thinkingRow.remove();
          appendMessage("error", "通信に失敗しました。ネットワーク状態を確認してもう一度お試しください。", false);
          setSendingState(false);
        })
        .finally(function () {
          if (!retryCountdownTimer) {
            input.focus();
          }
        });
    });

    restoreDisplayHistory();
  }

  document.addEventListener("DOMContentLoaded", function () {
    initChatWidget();
  });
})();
