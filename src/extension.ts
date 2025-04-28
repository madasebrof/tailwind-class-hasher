import * as vscode from "vscode";
import { randomBytes } from "crypto";

let autoHashEnabled = false;
let autoHashStatusBarItem: vscode.StatusBarItem;
const hashLength = 7;
const reHashMatch = new RegExp(`^0[a-z0-9]{${hashLength}}$`);
const classRegex = /\b((?:class|className)\s*=[^\)\}\]]*?["'`])(.*?)["'`]/gs;

function createRandomHash(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(hashLength);
  let result = "";
  for (let i = 0; i < hashLength; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

function isRandomHash(classList: string): boolean {
  const firstToken = classList.trim().split(/\s+/)[0];
  // match hash like "0okklhgbyu" at beginning of class list
  return reHashMatch.test(firstToken);
}

async function computeHashingOnDocument(
  document: vscode.TextDocument
): Promise<vscode.TextEdit[]> {
  const text = document.getText();

  let match;
  let matchIndex = 0;

  // Count existing hashes in the file
  while ((match = classRegex.exec(text)) !== null) {
    const classList = match[2];
    if (isRandomHash(classList)) {
      matchIndex++;
    }
  }

  match = "";
  let edits: vscode.TextEdit[] = [];

  const filePath = document.uri.fsPath;

  // Generate new hashes...
  while ((match = classRegex.exec(text)) !== null) {
    const attr = match[1];
    const originalClasses = match[2];
    const fullStart = match.index;

    // Find relative offset of match[2] inside match[0]
    const relativeIndex = attr.length;

    // Absolute index
    const matchStart = fullStart + relativeIndex;
    const posStart = document.positionAt(matchStart);

    const hash = createRandomHash();

    console.log(`matchIndex = ${matchIndex}`);
    console.log(`hash = ${hash}`);

    if (!isRandomHash(originalClasses)) {
      const newValue = `0${hash} `;
      edits.push(vscode.TextEdit.insert(posStart, newValue));
    }

    matchIndex++;
  }

  return edits;
}

async function runHashingOnDocument(
  document: vscode.TextDocument,
  verbose: boolean = true
) {
  const edits: vscode.TextEdit[] = await computeHashingOnDocument(document);

  // Apply edits
  if (edits.length > 0) {
    const edit = new vscode.WorkspaceEdit();
    const uri = document.uri;
    edits.forEach((e) => edit.replace(uri, e.range, e.newText));
    vscode.workspace.applyEdit(edit).then(() => {
      const msg =
        edits.length === 1
          ? `Added 1 Tailwind Hash`
          : `Added ${edits.length} Tailwind Hashes`;
      if (verbose) {
        vscode.window.showInformationMessage(msg);
      }
    });
  }
}

async function removeHashingOnDocument(document: vscode.TextDocument) {
  const text = document.getText();
  let match;
  let edits: vscode.TextEdit[] = [];

  // Delete exisitng hashes...
  while ((match = classRegex.exec(text)) !== null) {
    const fullMatch = match[0];
    const attr = match[1];
    const originalClasses = match[2];
    const fullStart = match.index;

    // Find relative offset of match[2] inside match[0]
    const relativeIndex = attr.length;
    // const relativeIndex = fullMatch.indexOf(originalClasses);

    // Absolute index
    const matchStart = fullStart + relativeIndex;
    const posStart = document.positionAt(matchStart);
    // remove the leading "0" (will leave trailing space, as might be folllowed by a '"`")

    if (isRandomHash(originalClasses)) {
      //check if the character immediately after the hash is a space or not!
      const endsInSpace =
        fullMatch[relativeIndex + 1 + hashLength] === " " ? 1 : 0;
      const posEnd = document.positionAt(
        matchStart + 1 + hashLength + endsInSpace
      );
      const newValue = "";
      const range = new vscode.Range(posStart, posEnd);
      edits.push(vscode.TextEdit.replace(range, newValue));
    }
  }

  // Apply edits
  if (edits.length > 0) {
    const edit = new vscode.WorkspaceEdit();
    const uri = document.uri;
    edits.forEach((e) => edit.replace(uri, e.range, e.newText));
    vscode.workspace.applyEdit(edit).then(() => {
      const msg =
        edits.length === 1
          ? `Removed 1 Tailwind Hash`
          : `Removed ${edits.length} Tailwind Hashes`;
      vscode.window.showInformationMessage(msg);
    });
  } else {
    vscode.window.showWarningMessage(
      "No Tailwind Hashes removed — can't find any hashes in current file."
    );
  }
}

function updateAutoHashStatusBar(): void {
  // autoHashStatusBarItem.text = `# ${autoHashEnabled ? "On" : "Off"}`;
  autoHashStatusBarItem.text = `TwHasher: ${autoHashEnabled ? "On" : "Off"}`;
  // autoHashStatusBarItem.text = `# ${autoHashEnabled ? "$(check)" : "$(x)"}`;
  autoHashStatusBarItem.tooltip =
    "Click to toggle Tailwind Hasher - hashing on save";
  autoHashStatusBarItem.show();
}

// ┌┬┐┌─┐┬┌┐┌  ┌─┐┌┐┌┌┬┐┬─┐┬ ┬  ┌─┐┌─┐┬┌┐┌┌┬┐
// │││├─┤││││  ├┤ │││ │ ├┬┘└┬┘  ├─┘│ │││││ │
// ┴ ┴┴ ┴┴┘└┘  └─┘┘└┘ ┴ ┴└─ ┴   ┴  └─┘┴┘└┘ ┴
export function activate(context: vscode.ExtensionContext) {
  autoHashEnabled = context.globalState.get<boolean>(
    "tailwindHasher.autoHashEnabled",
    false
  );

  const statusCommandId = "tailwind-class-hasher.toggleAutoHash";

  const toggleAutoHash = vscode.commands.registerCommand(
    statusCommandId,
    async () => {
      autoHashEnabled = !autoHashEnabled;
      await context.globalState.update(
        "tailwindHasher.autoHashEnabled",
        autoHashEnabled
      );
      updateAutoHashStatusBar();
      vscode.window.showInformationMessage(
        autoHashEnabled
          ? "Tailwind Hasher - hashing on save is enabled."
          : "Tailwind Hasher - hashing on save is disabled."
      );
    }
  );

  autoHashStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left
  );
  autoHashStatusBarItem.command = statusCommandId;

  const enableAutoHash = vscode.commands.registerCommand(
    "tailwind-class-hasher.enableAutoHash",
    async () => {
      autoHashEnabled = true;
      updateAutoHashStatusBar();
      await context.globalState.update("tailwindHasher.autoHashEnabled", true);
      vscode.window.showInformationMessage("Tailwind Auto Hashing ENABLED");
    }
  );

  const disableAutoHash = vscode.commands.registerCommand(
    "tailwind-class-hasher.disableAutoHash",
    async () => {
      autoHashEnabled = false;
      updateAutoHashStatusBar();
      await context.globalState.update("tailwindHasher.autoHashEnabled", false);
      vscode.window.showInformationMessage("Tailwind Auto Hashing DISABLED");
    }
  );

  vscode.workspace.onWillSaveTextDocument((event) => {
    if (!autoHashEnabled) {
      return;
    }

    const document = event.document;

    if (
      document.languageId === "typescriptreact" ||
      document.languageId === "javascriptreact"
    ) {
      event.waitUntil(
        (async () => {
          const edits = await computeHashingOnDocument(document);
          if (edits.length > 0) {
            return edits;
          }
        })()
      );
    }
  });

  let disposable1 = vscode.commands.registerCommand(
    "tailwind-class-hasher.addHashesForGreatGood",
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage("No active editor!");
        return;
      }
      runHashingOnDocument(editor.document);
    }
  );

  let disposable2 = vscode.commands.registerCommand(
    "tailwind-class-hasher.removeHashes",
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage("No active editor!");
        return;
      }
      removeHashingOnDocument(editor.document);
    }
  );

  context.subscriptions.push(
    disposable1,
    disposable2,
    enableAutoHash,
    disableAutoHash,
    toggleAutoHash,
    autoHashStatusBarItem
  );

  updateAutoHashStatusBar();

  vscode.window.onDidChangeActiveTextEditor(updateAutoHashStatusBar);
  vscode.workspace.onDidOpenTextDocument(updateAutoHashStatusBar);
}

export function deactivate() {}
