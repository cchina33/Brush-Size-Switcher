// UXPおよびPhotoshopのモジュール取得（多重フォールバック）
function getPhotoshop() {
  if (typeof window !== "undefined" && window.require) {
    try {
      return window.require("photoshop");
    } catch (e) {}
  }
  if (typeof require !== "undefined") {
    try {
      return require("photoshop");
    } catch (e) {}
  }
  return null;
}

function getUXP() {
  if (typeof window !== "undefined" && window.require) {
    try {
      return window.require("uxp");
    } catch (e) {}
  }
  if (typeof require !== "undefined") {
    try {
      return require("uxp");
    } catch (e) {}
  }
  return null;
}

// 最後のエラーメッセージ保持用
let lastErrorMessage = "";

// ダイアログでエラーを表示する関数
function showErrorDialog(title, error) {
  let msg = "";
  if (typeof error === "string") {
    msg = error;
  } else if (error && error.message) {
    msg = error.message;
    if (error.number) {
      msg += ` (エラー番号: ${error.number})`;
    }
    if (error.stack) {
      msg += `\n\n【スタック】\n${error.stack}`;
    }
  } else {
    try {
      msg = JSON.stringify(error, null, 2);
    } catch (e) {
      msg = String(error);
    }
  }

  lastErrorMessage = `【${title}】\n${msg}`;

  // 標準alertで表示
  try {
    alert(lastErrorMessage);
    return;
  } catch (e) {}

  // PhotoshopのshowAlertで表示
  const ps = getPhotoshop();
  if (ps && ps.app && ps.app.showAlert) {
    try {
      ps.app.showAlert(lastErrorMessage);
      return;
    } catch (e) {}
  }
}

// ステータス表示の更新
function setStatus(text, isError = false) {
  const display = document.getElementById("current-size");
  if (display) {
    display.textContent = text;
    if (isError) {
      display.classList.add("error");
    } else {
      display.classList.remove("error");
    }
  }
}

// 現在選択されているツールIDを取得する関数
async function getCurrentToolId(ps) {
  // 1. app.currentTool から取得を試みる
  try {
    if (ps.app && ps.app.currentTool) {
      const tool = ps.app.currentTool;
      if (typeof tool === "string") return tool;
      if (tool.id) return tool.id;
    }
  } catch (e) {}

  // batchPlay からプロパティ取得を試みる
  try {
    const result = await ps.action.batchPlay(
      [
        {
          _obj: "get",
          _target: [
            { _property: "tool" },
            { _ref: "application" }
          ],
          _options: { dialogOptions: "dontDisplay" }
        }
      ],
      { synchronousExecution: true }
    );
    if (result && result.length > 0 && result[0]) {
      const toolObj = result[0].tool;
      if (typeof toolObj === "string") return toolObj;
      if (toolObj && toolObj._value) return toolObj._value;
    }
  } catch (e) {}

  return null;
}

// ブラシ・消しゴムのサイズを変更する関数
async function applyBrushSize(size, targetBtn) {
  const ps = getPhotoshop();
  if (!ps) {
    const errMsg = "Photoshop APIモジュール（photoshop）が取得できませんでした。";
    setStatus("エラー: API未取得", true);
    showErrorDialog("Photoshop APIエラー", errMsg);
    return;
  }

  // ドキュメントが開かれているか確認
  if (ps.app && ps.app.documents && ps.app.documents.length === 0) {
    const msg = "Photoshopでドキュメント（キャンバス）が開かれていません。\n新規ファイルまたは既存の画像を開いてから再度お試しください。";
    setStatus("ドキュメント未読込", true);
    showErrorDialog("ご案内", msg);
    return;
  }

  // 現在選択中のツールを取得
  const currentTool = await getCurrentToolId(ps);

  // ブラシ（paintbrushTool）または消しゴム（eraserTool）以外が選択されている場合は何もしない（無反応でスルー）
  const allowedTools = ["paintbrushTool", "eraserTool"];
  if (!currentTool || !allowedTools.includes(currentTool)) {
    return;
  }

  // 対象ツールのときのみボタンのハイライトとステータス表示を更新
  if (targetBtn) {
    const allButtons = document.querySelectorAll(".btn");
    allButtons.forEach((b) => b.classList.remove("active"));
    targetBtn.classList.add("active");
  }
  setStatus(`${size} px (反映中...)`, false);

  const { action, core } = ps;

  // 実行するコマンド:
  // 現在のツール（ブラシまたは消しゴム）の直径（masterDiameter）を設定
  const batchCommands = [
    {
      _obj: "set",
      _target: [
        {
          _ref: "brush",
          _enum: "ordinal",
          _value: "targetEnum"
        }
      ],
      to: {
        _obj: "brush",
        masterDiameter: {
          _unit: "pixelsUnit",
          _value: size
        }
      }
    }
  ];

  try {
    if (core && core.executeAsModal) {
      // executeAsModal スコープ内で安全に実行
      await core.executeAsModal(
        async () => {
          await action.batchPlay(batchCommands, {});
        },
        { commandName: `サイズ変更 (${size}px)` }
      );
    } else {
      await action.batchPlay(batchCommands, {});
    }

    // 成功時のステータス更新
    setStatus(`${size} px (適用済)`, false);
  } catch (err) {
    console.error("サイズ変更エラー:", err);
    setStatus("エラー発生 (クリックで詳細)", true);
    showErrorDialog("サイズ変更エラー", err);
  }
}

// イベント委譲（Event Delegation）で確実にクリックをキャッチ
document.addEventListener("click", (event) => {
  // ステータス表示をクリックした場合は、最後のエラー内容を再表示
  const statusEl = event.target.closest("#current-size");
  if (statusEl && lastErrorMessage) {
    try {
      alert(lastErrorMessage);
    } catch (e) {}
    return;
  }

  const btn = event.target.closest(".btn");
  if (!btn) return;

  const sizeAttr = btn.getAttribute("data-size");
  const size = parseInt(sizeAttr, 10);
  if (!size) return;

  // ブラシまたは消しゴムのサイズ変更を実行
  applyBrushSize(size, btn);
});

// UXPエントリポイントの安全な登録
const uxp = getUXP();
if (uxp && uxp.entrypoints) {
  try {
    uxp.entrypoints.setup({
      panels: {
        brushPanel: {
          show() {}
        }
      }
    });
  } catch (e) {
    console.warn("entrypoints setup warning:", e);
  }
}