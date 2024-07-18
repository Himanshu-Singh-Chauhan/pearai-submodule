import { ConfigHandler } from "core/config/handler";
import { PearAIServerClient } from "core/pearaiServer/stubs/client";
import { CodebaseIndexer, PauseToken } from "core/indexing/indexCodebase";
import { IdeSettings } from "core/protocol";
import { getConfigJsonPath, getConfigTsPath, getPearAIGlobalPath } from "core/util/paths";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import * as vscode from "vscode";
import { ContinueCompletionProvider } from "../autocomplete/completionProvider";
import { setupStatusBar } from "../autocomplete/statusBar";
import { registerAllCommands } from "../commands";
// import { registerDebugTracker } from "../debug/debug";
import { ContinueGUIWebviewViewProvider } from "../debugPanel";
import { DiffManager } from "../diff/horizontal";
import { VerticalPerLineDiffManager } from "../diff/verticalPerLine/manager";
// import { VsCodeIde } from "../ideProtocol";
import { registerAllCodeLensProviders } from "../lang-server/codeLens";
import { setupRemoteConfigSync } from "../stubs/activation";
import { getUserToken } from "../stubs/auth";
import { TabAutocompleteModel } from "../util/loadAutocompleteModel";
import { VsCodeWebviewProtocol } from "../webviewProtocol";
import { exec } from "child_process";
import { PearAuth, RangeInFile, FileEdit, Thread, IDE, IndexTag, IdeInfo, ContinueRcJson, Problem } from "core";
import { defaultIgnoreFile } from "core/indexing/ignore";
import path from "path";
import { Repository, GitExtension } from "../otherExtensions/git";
import { editorSuggestionsLocked, SuggestionRanges, acceptSuggestionCommand, rejectSuggestionCommand } from "../suggestions";
import { traverseDirectory } from "../util/traverseDirectory";
import { uriFromFilePath, getUniqueId, openEditorAndRevealRange, getExtensionUri } from "../util/vscode";
import * as child_process from "child_process";

// import { threadStopped } from "../debug/debug";

const threadStopped: Map<number, boolean> = new Map();

export function registerDebugTracker(
  webviewProtocol: VsCodeWebviewProtocol,
  ide: VsCodeIde
) {
  vscode.debug.registerDebugAdapterTrackerFactory("*", {
    createDebugAdapterTracker(_session: vscode.DebugSession) {
      const updateThreads = async () => {
        webviewProtocol?.request("updateSubmenuItems", {
          provider: "locals",
          submenuItems: (await ide.getAvailableThreads()).map((thread) => ({
            id: `${thread.id}`,
            title: thread.name,
            description: `${thread.id}`,
          })),
        });
      };

      return {
        async onWillStopSession() {
          threadStopped.clear();
          updateThreads();
        },
        async onDidSendMessage(message: any) {
          if (message.type == "event") {
            switch (message.event) {
              case "continued":
              case "stopped":
                if (typeof message.body.threadId !== "undefined")
                  threadStopped.set(
                    Number(message.body.threadId),
                    message.event == "stopped"
                  );

                if (message.body.allThreadsStopped)
                  threadStopped.forEach((_, key) =>
                    threadStopped.set(key, true)
                  );

                if (message.body.allThreadsContinued)
                  threadStopped.forEach((_, key) =>
                    threadStopped.set(key, false)
                  );

                updateThreads();
                break;

              case "thread":
                if (message.body.reason == "exited")
                  threadStopped.delete(Number(message.body.threadId));
                else if (message.body.reason == "started")
                  threadStopped.set(Number(message.body.threadId), false);
                // somehow the threadId does not respect the specification in my vscodium (debugging C++)
                // expecting a number but got a string instead
                break;

              default:
                break;
            }
          }
        },
      };
    },
  });
}


export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}


class VsCodeIdeUtils {
  visibleMessages: Set<string> = new Set();

  /**
   * Request credentials object from vscode
   */
  async getPearCredentials(): Promise<PearAuth> {
    return await vscode.commands.executeCommand("pearai.getPearAuth");
  }

  /**
   * Send login request to IDE via commands, this opens the website
   */
  async executePearLogin() {
    vscode.commands.executeCommand("pearai.login");
  }

  /**
   * Set the stored credentials in vscode
   */
  async updatePearCredentials(auth: PearAuth) {
    await vscode.commands.executeCommand("pearai.updateUserAuth", auth);
  }

  async gotoDefinition(
    filepath: string,
    position: vscode.Position,
  ): Promise<vscode.Location[]> {
    const locations: vscode.Location[] = await vscode.commands.executeCommand(
      "vscode.executeDefinitionProvider",
      uriFromFilePath(filepath),
      position,
    );
    return locations;
  }

  async documentSymbol(filepath: string): Promise<vscode.DocumentSymbol[]> {
    return await vscode.commands.executeCommand(
      "vscode.executeDocumentSymbolProvider",
      uriFromFilePath(filepath),
    );
  }

  async references(
    filepath: string,
    position: vscode.Position,
  ): Promise<vscode.Location[]> {
    return await vscode.commands.executeCommand(
      "vscode.executeReferenceProvider",
      uriFromFilePath(filepath),
      position,
    );
  }

  async foldingRanges(filepath: string): Promise<vscode.FoldingRange[]> {
    return await vscode.commands.executeCommand(
      "vscode.executeFoldingRangeProvider",
      uriFromFilePath(filepath),
    );
  }

  getWorkspaceDirectories(): string[] {
    return (
      vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ||
      []
    );
  }

  getUniqueId() {
    return getUniqueId();
  }

  // ------------------------------------ //
  // On message handlers

  private _lastDecorationType: vscode.TextEditorDecorationType | null = null;
  async highlightCode(rangeInFile: RangeInFile, color: string) {
    const range = new vscode.Range(
      rangeInFile.range.start.line,
      rangeInFile.range.start.character,
      rangeInFile.range.end.line,
      rangeInFile.range.end.character,
    );
    const editor = await openEditorAndRevealRange(
      rangeInFile.filepath,
      range,
      vscode.ViewColumn.One,
    );
    if (editor) {
      const decorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: color,
        isWholeLine: true,
      });
      editor.setDecorations(decorationType, [range]);

      const cursorDisposable = vscode.window.onDidChangeTextEditorSelection(
        (event) => {
          if (event.textEditor.document.uri.fsPath === rangeInFile.filepath) {
            cursorDisposable.dispose();
            editor.setDecorations(decorationType, []);
          }
        },
      );

      setTimeout(() => {
        cursorDisposable.dispose();
        editor.setDecorations(decorationType, []);
      }, 2500);

      if (this._lastDecorationType) {
        editor.setDecorations(this._lastDecorationType, []);
      }
      this._lastDecorationType = decorationType;
    }
  }

  showSuggestion(edit: FileEdit) {
    // showSuggestion already exists
    showSuggestionInEditor(
      edit.filepath,
      new vscode.Range(
        edit.range.start.line,
        edit.range.start.character,
        edit.range.end.line,
        edit.range.end.character,
      ),
      edit.replacement,
    );
  }

  showMultiFileEdit(edits: FileEdit[]) {
    vscode.commands.executeCommand("workbench.action.closeAuxiliaryBar");
    const panel = vscode.window.createWebviewPanel(
      "pearai.continueGUIView",
      "PearAI",
      vscode.ViewColumn.One,
    );
    // panel.webview.html = this.sidebar.getSidebarContent(
    //   extensionContext,
    //   panel,
    //   this.ide,
    //   "/monaco",
    //   edits
    // );
  }

  openFile(filepath: string, range?: vscode.Range) {
    // vscode has a builtin open/get open files
    return openEditorAndRevealRange(filepath, range, vscode.ViewColumn.One);
  }

  async fileExists(filepath: string): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(uriFromFilePath(filepath));
      return true;
    } catch {
      return false;
    }
  }

  showVirtualFile(name: string, contents: string) {
    vscode.workspace
      .openTextDocument(
        vscode.Uri.parse(
          `${
            VsCodeExtension.continueVirtualDocumentScheme
          }:${encodeURIComponent(name)}?${encodeURIComponent(contents)}`,
        ),
      )
      .then((doc) => {
        vscode.window.showTextDocument(doc, { preview: false });
      });
  }

  setSuggestionsLocked(filepath: string, locked: boolean) {
    editorSuggestionsLocked.set(filepath, locked);
    // TODO: Rerender?
  }

  async getUserSecret(key: string) {
    // Check if secret already exists in VS Code settings (global)
    let secret = vscode.workspace.getConfiguration("continue").get(key);
    if (typeof secret !== "undefined" && secret !== null) {
      return secret;
    }

    // If not, ask user for secret
    secret = await vscode.window.showInputBox({
      prompt: `Either enter secret for ${key} or press enter to try Continue for free.`,
      password: true,
    });

    // Add secret to VS Code settings
    vscode.workspace
      .getConfiguration("continue")
      .update(key, secret, vscode.ConfigurationTarget.Global);

    return secret;
  }

  // ------------------------------------ //
  // Initiate Request

  acceptRejectSuggestion(accept: boolean, key: SuggestionRanges) {
    if (accept) {
      acceptSuggestionCommand(key);
    } else {
      rejectSuggestionCommand(key);
    }
  }

  // ------------------------------------ //
  // Respond to request

  // Checks to see if the editor is a code editor.
  // In some cases vscode.window.visibleTextEditors can return non-code editors
  // e.g. terminal editors in side-by-side mode
  private documentIsCode(document: vscode.TextDocument) {
    return document.uri.scheme === "file";
  }

  getOpenFiles(): string[] {
    return vscode.workspace.textDocuments
      .filter((document) => this.documentIsCode(document))
      .map((document) => {
        return document.uri.fsPath;
      });
  }

  getVisibleFiles(): string[] {
    return vscode.window.visibleTextEditors
      .filter((editor) => this.documentIsCode(editor.document))
      .map((editor) => {
        return editor.document.uri.fsPath;
      });
  }

  saveFile(filepath: string) {
    vscode.window.visibleTextEditors
      .filter((editor) => this.documentIsCode(editor.document))
      .forEach((editor) => {
        if (editor.document.uri.fsPath === filepath) {
          editor.document.save();
        }
      });
  }

  async getDirectoryContents(
    directory: string,
    recursive: boolean,
  ): Promise<string[]> {
    if (!recursive) {
      return (
        await vscode.workspace.fs.readDirectory(uriFromFilePath(directory))
      )
        .filter(([name, type]) => {
          type === vscode.FileType.File && !defaultIgnoreFile.ignores(name);
        })
        .map(([name, type]) => path.join(directory, name));
    }

    const allFiles: string[] = [];
    const gitRoot = await this.getGitRoot(directory);
    let onlyThisDirectory = undefined;
    if (gitRoot) {
      onlyThisDirectory = directory.slice(gitRoot.length).split(path.sep);
      if (onlyThisDirectory[0] === "") {
        onlyThisDirectory.shift();
      }
    }
    for await (const file of traverseDirectory(
      gitRoot ?? directory,
      [],
      true,
      gitRoot === directory ? undefined : onlyThisDirectory,
    )) {
      allFiles.push(file);
    }
    return allFiles;
  }

  getAbsolutePath(filepath: string): string {
    const workspaceDirectories = this.getWorkspaceDirectories();
    if (!path.isAbsolute(filepath) && workspaceDirectories.length === 1) {
      return path.join(workspaceDirectories[0], filepath);
    } else {
      return filepath;
    }
  }

  private static MAX_BYTES = 100000;

  async readFile(filepath: string): Promise<string> {
    try {
      filepath = this.getAbsolutePath(filepath);
      const uri = uriFromFilePath(filepath);

      // First, check whether it's a notebook document
      // Need to iterate over the cells to get full contents
      const notebook =
        vscode.workspace.notebookDocuments.find(
          (doc) => doc.uri.toString() === uri.toString(),
        ) ??
        (uri.fsPath.endsWith("ipynb")
          ? await vscode.workspace.openNotebookDocument(uri)
          : undefined);
      if (notebook) {
        return notebook
          .getCells()
          .map((cell) => cell.document.getText())
          .join("\n\n");
      }

      // Check whether it's an open document
      const openTextDocument = vscode.workspace.textDocuments.find(
        (doc) => doc.uri.fsPath === uri.fsPath,
      );
      if (openTextDocument !== undefined) {
        return openTextDocument.getText();
      }

      const fileStats = await vscode.workspace.fs.stat(
        uriFromFilePath(filepath),
      );
      if (fileStats.size > 10 * VsCodeIdeUtils.MAX_BYTES) {
        return "";
      }

      const bytes = await vscode.workspace.fs.readFile(uri);

      // Truncate the buffer to the first MAX_BYTES
      const truncatedBytes = bytes.slice(0, VsCodeIdeUtils.MAX_BYTES);
      const contents = new TextDecoder().decode(truncatedBytes);
      return contents;
    } catch (e) {
      console.warn("Error reading file", e);
      return "";
    }
  }

  async readRangeInFile(
    filepath: string,
    range: vscode.Range,
  ): Promise<string> {
    const contents = new TextDecoder().decode(
      await vscode.workspace.fs.readFile(vscode.Uri.file(filepath)),
    );
    const lines = contents.split("\n");
    return (
      lines.slice(range.start.line, range.end.line).join("\n") +
      "\n" +
      lines[
        range.end.line < lines.length - 1 ? range.end.line : lines.length - 1
      ].slice(0, range.end.character)
    );
  }

  async getTerminalContents(commands: number = -1): Promise<string> {
    const tempCopyBuffer = await vscode.env.clipboard.readText();
    if (commands < 0) {
      await vscode.commands.executeCommand(
        "workbench.action.terminal.selectAll",
      );
    } else {
      for (let i = 0; i < commands; i++) {
        await vscode.commands.executeCommand(
          "workbench.action.terminal.selectToPreviousCommand",
        );
      }
    }
    await vscode.commands.executeCommand(
      "workbench.action.terminal.copySelection",
    );
    await vscode.commands.executeCommand(
      "workbench.action.terminal.clearSelection",
    );
    let terminalContents = (await vscode.env.clipboard.readText()).trim();
    await vscode.env.clipboard.writeText(tempCopyBuffer);

    if (tempCopyBuffer === terminalContents) {
      // This means there is no terminal open to select text from
      return "";
    }

    // Sometimes the above won't successfully separate by command, so we attempt manually
    // We are bounded by the functionality and stability of
    // workbench.action.terminal.selectToPreviousCommand which at times is unstable
    const removeNonASCIIAndTrim = (str: string): string => {
      str = str.replace(/[^\x00-\x7F\s]/g, "");
      return str.trim();
    };
    var lines: string[] = terminalContents.split("\n");
    const lastLine: string | undefined = removeNonASCIIAndTrim(
      lines.pop() || "",
    )?.trim();
    if (lastLine) {
      let i = lines.length - 1;
      while (i >= 0) {
        const currentLine = lines[i];
        const strippedLine = removeNonASCIIAndTrim(currentLine);
        if (strippedLine.startsWith(lastLine)) {
          break;
        }
        i--;
      }
      if (i === -1) {
        // This is an edge case, usually the last line is the
        // the command prompt, but occasionally it is not
        // This results in no match, so we should include the last line
        // which would be part of the error in terminal
        lines.push(lastLine);
      } else {
        lines = lines.slice(0, i + 1);
      }
      terminalContents = lines.join("\n");
    }
    return terminalContents;
  }

  private async _getThreads(session: vscode.DebugSession) {
    const threadsResponse = await session.customRequest("threads");
    const threads = threadsResponse.threads.filter((thread: any) =>
      threadStopped.get(thread.id),
    );
    threads.sort((a: any, b: any) => a.id - b.id);
    threadsResponse.threads = threads;

    return threadsResponse;
  }

  async getAvailableThreads(): Promise<Thread[]> {
    const session = vscode.debug.activeDebugSession;
    if (!session) return [];

    const threadsResponse = await this._getThreads(session);
    return threadsResponse.threads;
  }

  async getDebugLocals(threadIndex: number = 0): Promise<string> {
    const session = vscode.debug.activeDebugSession;

    if (!session) {
      vscode.window.showWarningMessage(
        "No active debug session found, therefore no debug context will be provided for the llm.",
      );
      return "";
    }

    const variablesResponse = await session
      .customRequest("stackTrace", {
        threadId: threadIndex,
        startFrame: 0,
      })
      .then((traceResponse) =>
        session.customRequest("scopes", {
          frameId: traceResponse.stackFrames[0].id,
        }),
      )
      .then((scopesResponse) =>
        session.customRequest("variables", {
          variablesReference: scopesResponse.scopes[0].variablesReference,
        }),
      );

    const variableContext = variablesResponse.variables
      .filter((variable: any) => variable.type !== "global")
      .reduce(
        (acc: any, variable: any) =>
          `${acc}\nname: ${variable.name}, type: ${variable.type}, ` +
          `value: ${variable.value}`,
        "",
      );

    return variableContext;
  }

  async getTopLevelCallStackSources(
    threadIndex: number,
    stackDepth: number = 3,
  ): Promise<string[]> {
    const session = vscode.debug.activeDebugSession;
    if (!session) return [];

    const sourcesPromises = await session
      .customRequest("stackTrace", {
        threadId: threadIndex,
        startFrame: 0,
      })
      .then((traceResponse) =>
        traceResponse.stackFrames
          .slice(0, stackDepth)
          .map(async (stackFrame: any) => {
            const scopeResponse = await session.customRequest("scopes", {
              frameId: stackFrame.id,
            });

            const scope = scopeResponse.scopes[0];

            return await this.retrieveSource(scope.source ? scope : stackFrame);
          }),
      );

    return Promise.all(sourcesPromises);
  }

  private async retrieveSource(sourceContainer: any): Promise<string> {
    if (!sourceContainer.source) return "";

    const sourceRef = sourceContainer.source.sourceReference;
    if (sourceRef && sourceRef > 0) {
      // according to the spec, source might be ony available in a debug session
      // not yet able to test this branch
      const sourceResponse =
        await vscode.debug.activeDebugSession?.customRequest("source", {
          source: sourceContainer.source,
          sourceReference: sourceRef,
        });
      return sourceResponse.content;
    } else if (sourceContainer.line && sourceContainer.endLine) {
      return await this.readRangeInFile(
        sourceContainer.source.path,
        new vscode.Range(
          sourceContainer.line - 1, // The line number from scope response starts from 1
          sourceContainer.column,
          sourceContainer.endLine - 1,
          sourceContainer.endColumn,
        ),
      );
    } else if (sourceContainer.line)
      // fall back to 5 line of context
      return await this.readRangeInFile(
        sourceContainer.source.path,
        new vscode.Range(
          sourceContainer.line - 3,
          0,
          sourceContainer.line + 2,
          0,
        ),
      );
    else return "unavailable";
  }

  private async _getRepo(
    forDirectory: vscode.Uri,
  ): Promise<Repository | undefined> {
    // Use the native git extension to get the branch name
    const extension =
      vscode.extensions.getExtension<GitExtension>("vscode.git");
    if (
      typeof extension === "undefined" ||
      !extension.isActive ||
      typeof vscode.workspace.workspaceFolders === "undefined"
    ) {
      return undefined;
    }

    try {
      const git = extension.exports.getAPI(1);
      return git.getRepository(forDirectory) ?? undefined;
    } catch (e) {
      this._repoWasNone = true;
      console.warn("Git not found: ", e);
      return undefined;
    }
  }

  private _repoWasNone: boolean = false;
  async getRepo(forDirectory: vscode.Uri): Promise<Repository | undefined> {
    let repo = await this._getRepo(forDirectory);

    let i = 0;
    while (!repo?.state?.HEAD?.name) {
      if (this._repoWasNone) return undefined;

      await new Promise((resolve) => setTimeout(resolve, 1000));
      i++;
      if (i >= 20) {
        this._repoWasNone = true;
        return undefined;
      }
      repo = await this._getRepo(forDirectory);
    }
    return repo;
  }

  async getGitRoot(forDirectory: string): Promise<string | undefined> {
    const repo = await this.getRepo(vscode.Uri.file(forDirectory));
    return repo?.rootUri?.fsPath;
  }

  async getBranch(forDirectory: vscode.Uri) {
    let repo = await this.getRepo(forDirectory);
    if (repo?.state?.HEAD?.name === undefined) {
      try {
        const { stdout } = await asyncExec("git rev-parse --abbrev-ref HEAD", {
          cwd: forDirectory.fsPath,
        });
        return stdout?.trim() || "NONE";
      } catch (e) {
        return "NONE";
      }
    }

    return repo?.state?.HEAD?.name || "NONE";
  }

  async getDiff(): Promise<string> {
    let diffs: string[] = [];
    let repos = [];

    for (const dir of this.getWorkspaceDirectories()) {
      const repo = await this.getRepo(vscode.Uri.file(dir));
      if (!repo) {
        continue;
      }

      repos.push(repo.state.HEAD?.name);
      // Staged changes
      // const a = await repo.diffIndexWithHEAD();
      const staged = await repo.diff(true);
      // Un-staged changes
      // const b = await repo.diffWithHEAD();
      const unstaged = await repo.diff(false);
      // All changes
      // const e = await repo.diffWith("HEAD");
      // Only staged
      // const f = await repo.diffIndexWith("HEAD");
      diffs.push(`${staged}\n${unstaged}`);
    }

    const fullDiff = diffs.join("\n\n");
    if (fullDiff.trim() === "") {
      console.log(`Diff empty for repos: ${repos}`);
    }
    return fullDiff;
  }

  getHighlightedCode(): RangeInFile[] {
    // TODO
    let rangeInFiles: RangeInFile[] = [];
    vscode.window.visibleTextEditors
      .filter((editor) => this.documentIsCode(editor.document))
      .forEach((editor) => {
        editor.selections.forEach((selection) => {
          // if (!selection.isEmpty) {
          rangeInFiles.push({
            filepath: editor.document.uri.fsPath,
            range: {
              start: {
                line: selection.start.line,
                character: selection.start.character,
              },
              end: {
                line: selection.end.line,
                character: selection.end.character,
              },
            },
          });
          // }
        });
      });
    return rangeInFiles;
  }
}


class VsCodeIde implements IDE {
  ideUtils: VsCodeIdeUtils;

  constructor(private readonly diffManager: DiffManager) {
    this.ideUtils = new VsCodeIdeUtils();
  }

  async getPearAuth(): Promise<PearAuth | undefined> {
    const creds = await this.ideUtils.getPearCredentials();
    return creds;
  }

  async updatePearCredentials(auth: PearAuth): Promise<void> {
    await this.ideUtils.updatePearCredentials(auth);
  }

  async authenticatePear(): Promise<void> {
    this.ideUtils.executePearLogin();
  }

  async getRepoName(dir: string): Promise<string | undefined> {
    const repo = await this.getRepo(vscode.Uri.file(dir));
    const remotes = repo?.state.remotes;
    if (!remotes) {
      return undefined;
    }
    const remote =
      remotes?.find((r: any) => r.name === "origin") ?? remotes?.[0];
    if (!remote) {
      return undefined;
    }
    const ownerAndRepo = remote.fetchUrl
      ?.replace(".git", "")
      .split("/")
      .slice(-2);
    return ownerAndRepo?.join("/");
  }

  async getTags(artifactId: string): Promise<IndexTag[]> {
    const workspaceDirs = await this.getWorkspaceDirs();

    const branches = await Promise.all(
      workspaceDirs.map((dir) => this.getBranch(dir)),
    );

    const tags: IndexTag[] = workspaceDirs.map((directory, i) => ({
      directory,
      branch: branches[i],
      artifactId,
    }));

    return tags;
  }
  getIdeInfo(): Promise<IdeInfo> {
    return Promise.resolve({
      ideType: "vscode",
      name: vscode.env.appName,
      version: vscode.version,
      remoteName: vscode.env.remoteName || "local",
      extensionVersion:
        vscode.extensions.getExtension("pearai.pearai")?.packageJSON.version,
    });
  }
  readRangeInFile(filepath: string, range: Range): Promise<string> {
    return this.ideUtils.readRangeInFile(
      filepath,
      new vscode.Range(
        new vscode.Position(range.start.line, range.start.character),
        new vscode.Position(range.end.line, range.end.character),
      ),
    );
  }

  async getStats(directory: string): Promise<{ [path: string]: number }> {
    const scheme = vscode.workspace.workspaceFolders?.[0].uri.scheme;
    const files = await this.listWorkspaceContents(directory);
    const pathToLastModified: { [path: string]: number } = {};
    await Promise.all(
      files.map(async (file) => {
        let stat = await vscode.workspace.fs.stat(uriFromFilePath(file));
        pathToLastModified[file] = stat.mtime;
      }),
    );

    return pathToLastModified;
  }

  async getRepo(dir: vscode.Uri): Promise<Repository | undefined> {
    return this.ideUtils.getRepo(dir);
  }

  async isTelemetryEnabled(): Promise<boolean> {
    return (
      (await vscode.workspace
        .getConfiguration("continue")
        .get("telemetryEnabled")) ?? true
    );
  }
  getUniqueId(): Promise<string> {
    return Promise.resolve(vscode.env.machineId);
  }

  async getDiff(): Promise<string> {
    return await this.ideUtils.getDiff();
  }

  async getTerminalContents(): Promise<string> {
    return await this.ideUtils.getTerminalContents(1);
  }

  async getDebugLocals(threadIndex: number): Promise<string> {
    return await this.ideUtils.getDebugLocals(threadIndex);
  }

  async getTopLevelCallStackSources(
    threadIndex: number,
    stackDepth: number,
  ): Promise<string[]> {
    return await this.ideUtils.getTopLevelCallStackSources(
      threadIndex,
      stackDepth,
    );
  }
  async getAvailableThreads(): Promise<Thread[]> {
    return await this.ideUtils.getAvailableThreads();
  }

  async listWorkspaceContents(directory?: string): Promise<string[]> {
    if (directory) {
      return await this.ideUtils.getDirectoryContents(directory, true);
    } else {
      const contents = await Promise.all(
        this.ideUtils
          .getWorkspaceDirectories()
          .map((dir) => this.ideUtils.getDirectoryContents(dir, true)),
      );
      return contents.flat();
    }
  }

  async getWorkspaceConfigs() {
    const workspaceDirs =
      vscode.workspace.workspaceFolders?.map((folder) => folder.uri) || [];
    const configs: ContinueRcJson[] = [];
    for (const workspaceDir of workspaceDirs) {
      const files = await vscode.workspace.fs.readDirectory(workspaceDir);
      for (const [filename, type] of files) {
        if (type === vscode.FileType.File && filename === ".continuerc.json") {
          const contents = await this.ideUtils.readFile(
            vscode.Uri.joinPath(workspaceDir, filename).fsPath,
          );
          configs.push(JSON.parse(contents));
        }
      }
    }
    return configs;
  }

  async listFolders(): Promise<string[]> {
    const allDirs: string[] = [];

    const workspaceDirs = await this.getWorkspaceDirs();
    for (const directory of workspaceDirs) {
      for await (const dir of traverseDirectory(
        directory,
        [],
        false,
        undefined,
      )) {
        allDirs.push(dir);
      }
    }

    return allDirs;
  }

  async getWorkspaceDirs(): Promise<string[]> {
    return this.ideUtils.getWorkspaceDirectories();
  }

  async getContinueDir(): Promise<string> {
    return getPearAIGlobalPath();
  }

  async writeFile(path: string, contents: string): Promise<void> {
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(path),
      Buffer.from(contents),
    );
  }

  async showVirtualFile(title: string, contents: string): Promise<void> {
    this.ideUtils.showVirtualFile(title, contents);
  }

  async openFile(path: string): Promise<void> {
    this.ideUtils.openFile(path);
  }

  async showLines(
    filepath: string,
    startLine: number,
    endLine: number,
  ): Promise<void> {
    const range = new vscode.Range(
      new vscode.Position(startLine, 0),
      new vscode.Position(endLine, 0),
    );
    openEditorAndRevealRange(filepath, range).then(() => {
      // TODO: Highlight lines
      // this.ideUtils.highlightCode(
      //   {
      //     filepath,
      //     range,
      //   },
      //   "#fff1"
      // );
    });
  }

  async runCommand(command: string): Promise<void> {
    if (vscode.window.terminals.length) {
      const terminal =
        vscode.window.activeTerminal ?? vscode.window.terminals[0];
      terminal.show();
      terminal.sendText(command, false);
    } else {
      const terminal = vscode.window.createTerminal();
      terminal.show();
      terminal.sendText(command, false);
    }
  }

  async saveFile(filepath: string): Promise<void> {
    await this.ideUtils.saveFile(filepath);
  }
  async readFile(filepath: string): Promise<string> {
    return await this.ideUtils.readFile(filepath);
  }
  async showDiff(
    filepath: string,
    newContents: string,
    stepIndex: number,
  ): Promise<void> {
    await this.diffManager.writeDiff(filepath, newContents, stepIndex);
  }

  async getOpenFiles(): Promise<string[]> {
    return await this.ideUtils.getOpenFiles();
  }

  async getCurrentFile(): Promise<string | undefined> {
    return vscode.window.activeTextEditor?.document.uri.fsPath;
  }

  async getPinnedFiles(): Promise<string[]> {
    const tabArray = vscode.window.tabGroups.all[0].tabs;

    return tabArray
      .filter((t) => t.isPinned)
      .map((t) => (t.input as vscode.TabInputText).uri.fsPath);
  }

  private async _searchDir(query: string, dir: string): Promise<string> {
    const p = child_process.spawn(
      path.join(
        getExtensionUri().fsPath,
        "out",
        "node_modules",
        "@vscode",
        "ripgrep",
        "bin",
        "rg",
      ),
      ["-i", "-C", "2", "--", `${query}`, "."], //no regex
      //["-i", "-C", "2", "-e", `${query}`, "."], //use regex
      { cwd: dir },
    );
    let output = "";

    p.stdout.on("data", (data) => {
      output += data.toString();
    });

    return new Promise<string>((resolve, reject) => {
      p.on("error", reject);
      p.on("close", (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Process exited with code ${code}`));
        }
      });
    });
  }

  async getSearchResults(query: string): Promise<string> {
    let results = [];
    for (let dir of await this.getWorkspaceDirs()) {
      results.push(await this._searchDir(query, dir));
    }

    return results.join("\n\n");
  }

  async getProblems(filepath?: string | undefined): Promise<Problem[]> {
    const uri = filepath
      ? vscode.Uri.file(filepath)
      : vscode.window.activeTextEditor?.document.uri;
    if (!uri) {
      return [];
    }
    return vscode.languages.getDiagnostics(uri).map((d) => {
      return {
        filepath: uri.fsPath,
        range: {
          start: {
            line: d.range.start.line,
            character: d.range.start.character,
          },
          end: { line: d.range.end.line, character: d.range.end.character },
        },
        message: d.message,
      };
    });
  }

  async subprocess(command: string): Promise<[string, string]> {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.warn(error);
          reject(stderr);
        }
        resolve([stdout, stderr]);
      });
    });
  }

  async getBranch(dir: string): Promise<string> {
    return this.ideUtils.getBranch(vscode.Uri.file(dir));
  }
}

export { VsCodeIde };
  function asyncExec(arg0: string, arg1: { cwd: string; }): { stdout: any; } | PromiseLike<{ stdout: any; }> {
    throw new Error("Function not implemented.");
  }

function showSuggestionInEditor(filepath: string, arg1: vscode.Range, replacement: string) {
  throw new Error("Function not implemented.");
}




export class VsCodeExtension {
  private configHandler: ConfigHandler;
  private extensionContext: vscode.ExtensionContext;
  private ide: VsCodeIde;
  private tabAutocompleteModel: TabAutocompleteModel;
  private sidebar: ContinueGUIWebviewViewProvider;
  private windowId: string;
  private indexer: CodebaseIndexer;
  private diffManager: DiffManager;
  private verticalDiffManager: VerticalPerLineDiffManager;
  private webviewProtocol: VsCodeWebviewProtocol;

  constructor(context: vscode.ExtensionContext) {
    this.diffManager = new DiffManager(context);
    this.ide = new VsCodeIde(this.diffManager);

    const settings = vscode.workspace.getConfiguration("pearai");
    const remoteConfigServerUrl = settings.get<string | undefined>(
      "remoteConfigServerUrl",
      undefined,
    );
    const ideSettings: IdeSettings = {
      remoteConfigServerUrl,
      remoteConfigSyncPeriod: settings.get<number>(
        "remoteConfigSyncPeriod",
        60,
      ),
      userToken: settings.get<string>("userToken", ""),
    };

    const userTokenPromise: Promise<string | undefined> = new Promise(
      async (resolve) => {
        if (
          remoteConfigServerUrl === null ||
          remoteConfigServerUrl === undefined ||
          remoteConfigServerUrl.trim() === ""
        ) {
          resolve(undefined);
          return;
        }
        const token = await getUserToken();
        resolve(token);
      },
    );

    const pearAIServerClient = new PearAIServerClient(
      ideSettings.remoteConfigServerUrl,
      userTokenPromise,
    );

    // Config Handler with output channel
    const outputChannel = vscode.window.createOutputChannel("PearAI");
    this.configHandler = new ConfigHandler(
      this.ide,
      ideSettings,
      async (log: string) => {
        outputChannel.appendLine(
          "==========================================================================",
        );
        outputChannel.appendLine(
          "==========================================================================",
        );
        outputChannel.append(log);
      },
      (() => this.webviewProtocol?.request("configUpdate", undefined)).bind(
        this,
      ),
    );

    this.configHandler.reloadConfig();
    this.verticalDiffManager = new VerticalPerLineDiffManager(
      this.configHandler,
    );
    this.extensionContext = context;
    this.tabAutocompleteModel = new TabAutocompleteModel(this.configHandler);
    this.windowId = uuidv4();
    this.sidebar = new ContinueGUIWebviewViewProvider(
      this.configHandler,
      this.ide,
      this.windowId,
      this.extensionContext,
      this.verticalDiffManager,
    );

    setupRemoteConfigSync(
      this.configHandler.reloadConfig.bind(this.configHandler),
    );
    // handleURI
    context.subscriptions.push(
      vscode.window.registerUriHandler({
        handleUri(uri: vscode.Uri) {
          console.log(uri);
          console.log("Received a custom URI!");
          if (uri.authority === "pearai.pearai") {
            if (uri.path === "/ping") {
              vscode.window.showInformationMessage(
                "PearAI received a custom URI!",
              );
            } else if (uri.path === "/auth") {
              const queryParams = new URLSearchParams(uri.query);
              const data = {
                accessToken: queryParams.get("accessToken"),
                refreshToken: queryParams.get("refreshToken"),
              };

              vscode.commands.executeCommand("pearai.updateUserAuth", data);
            }
          }
        },
      }),
    );
    // Sidebar
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        "pearai.continueGUIView",
        this.sidebar,
        {
          webviewOptions: { retainContextWhenHidden: true },
        },
      ),
    );
    this.webviewProtocol = this.sidebar.webviewProtocol;

    // Indexing + pause token
    const indexingPauseToken = new PauseToken(
      context.globalState.get<boolean>("pearai.indexingPaused") === true,
    );
    this.webviewProtocol.on("index/setPaused", (msg) => {
      context.globalState.update("pearai.indexingPaused", msg.data);
      indexingPauseToken.paused = msg.data;
    });
    this.webviewProtocol.on("index/forceReIndex", (msg) => {
      this.ide
        .getWorkspaceDirs()
        .then((dirs) => this.refreshCodebaseIndex(dirs, context));
    });

    this.diffManager.webviewProtocol = this.webviewProtocol;

    this.indexer = new CodebaseIndexer(
      this.configHandler,
      this.ide,
      indexingPauseToken,
      pearAIServerClient,
    );

    if (
      !(
        remoteConfigServerUrl === null ||
        remoteConfigServerUrl === undefined ||
        remoteConfigServerUrl.trim() === ""
      )
    ) {
      getUserToken().then((token) => {});
    }

    // CodeLens
    const verticalDiffCodeLens = registerAllCodeLensProviders(
      context,
      this.diffManager,
      this.verticalDiffManager.filepathToCodeLens,
    );
    this.verticalDiffManager.refreshCodeLens =
      verticalDiffCodeLens.refresh.bind(verticalDiffCodeLens);

    // Tab autocomplete
    const config = vscode.workspace.getConfiguration("pearai");
    const enabled = config.get<boolean>("enableTabAutocomplete");

    // Register inline completion provider
    setupStatusBar(enabled);
    context.subscriptions.push(
      vscode.languages.registerInlineCompletionItemProvider(
        [{ pattern: "**" }],
        new ContinueCompletionProvider(
          this.configHandler,
          this.ide,
          this.tabAutocompleteModel,
        ),
      ),
    );

    // Commands
    registerAllCommands(
      context,
      this.ide,
      context,
      this.sidebar,
      this.configHandler,
      this.diffManager,
      this.verticalDiffManager,
    );

    registerDebugTracker(this.webviewProtocol, this.ide);

    // Indexing
    this.ide
      .getWorkspaceDirs()
      .then((dirs) => this.refreshCodebaseIndex(dirs, context));

    // Listen for file saving - use global file watcher so that changes
    // from outside the window are also caught
    fs.watchFile(getConfigJsonPath(), { interval: 1000 }, (stats) => {
      this.configHandler.reloadConfig();
      this.tabAutocompleteModel.clearLlm();
    });
    fs.watchFile(getConfigTsPath(), { interval: 1000 }, (stats) => {
      this.configHandler.reloadConfig();
      this.tabAutocompleteModel.clearLlm();
    });

    vscode.workspace.onDidSaveTextDocument((event) => {
      // Listen for file changes in the workspace
      const filepath = event.uri.fsPath;

      if (
        filepath.endsWith(".continuerc.json") ||
        filepath.endsWith(".prompt")
      ) {
        this.configHandler.reloadConfig();
        this.tabAutocompleteModel.clearLlm();
      } else if (
        filepath.endsWith(".continueignore") ||
        filepath.endsWith(".gitignore")
      ) {
        // Update embeddings! (TODO)
      }
    });

    // Refresh index when branch is changed
    this.ide.getWorkspaceDirs().then((dirs) =>
      dirs.forEach(async (dir) => {
        const repo = await this.ide.getRepo(vscode.Uri.file(dir));
        if (repo) {
          repo.state.onDidChange(() => {
            // args passed to this callback are always undefined, so keep track of previous branch
            const currentBranch = repo?.state?.HEAD?.name;
            if (currentBranch) {
              if (this.PREVIOUS_BRANCH_FOR_WORKSPACE_DIR[dir]) {
                if (
                  currentBranch !== this.PREVIOUS_BRANCH_FOR_WORKSPACE_DIR[dir]
                ) {
                  // Trigger refresh of index only in this directory
                  this.refreshCodebaseIndex([dir], context);
                }
              }

              this.PREVIOUS_BRANCH_FOR_WORKSPACE_DIR[dir] = currentBranch;
            }
          });
        }
      }),
    );

    // Register a content provider for the readonly virtual documents
    const documentContentProvider = new (class
      implements vscode.TextDocumentContentProvider
    {
      // emitter and its event
      onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
      onDidChange = this.onDidChangeEmitter.event;

      provideTextDocumentContent(uri: vscode.Uri): string {
        return uri.query;
      }
    })();
    context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(
        VsCodeExtension.continueVirtualDocumentScheme,
        documentContentProvider,
      ),
    );
  }

  static continueVirtualDocumentScheme = "continue";

  private PREVIOUS_BRANCH_FOR_WORKSPACE_DIR: { [dir: string]: string } = {};
  private indexingCancellationController: AbortController | undefined;

  private async refreshCodebaseIndex(
    dirs: string[],
    context: vscode.ExtensionContext,
  ) {
    // Cancel previous indexing job if it exists
    if (this.indexingCancellationController) {
      this.indexingCancellationController.abort();
    }
    this.indexingCancellationController = new AbortController();

    //reset all state variables
    context.globalState.update("pearai.indexingFailed", false);
    context.globalState.update("pearai.indexingProgress", 0);
    context.globalState.update("pearai.indexingDesc", "");

    let err = undefined;
    for await (const update of this.indexer.refresh(
      dirs,
      this.indexingCancellationController.signal,
    )) {
      this.webviewProtocol.request("indexProgress", update);
      context.globalState.update("pearai.indexingProgress", update);
    }

    if (err) {
      console.log("Codebase Indexing Failed: ", err);
    } else {
      console.log("Codebase Indexing Complete");
    }
  }
}
