import { BaseWebviewViewProvider } from './baseWebViewProvider';
import * as vscode from 'vscode';
import { getTheme } from './util/getTheme';
import { getExtensionVersion } from './util/util';
import { getExtensionUri, getNonce, getUniqueId } from './util/vscode';
import { FileEdit, IDE } from 'core';
import { ConfigHandler } from 'core/config/handler';
import { VerticalPerLineDiffManager } from './diff/verticalPerLine/manager';

export class EditorInsetViewProvider extends BaseWebviewViewProvider {
  public static readonly viewType = 'pearai.editorInsetView';
  private inset?: vscode.WebviewEditorInset;
  private readonly lineHeight = 4; // number of lines for height of inset

  public showInline(): void {
    if (!vscode.window.activeTextEditor) {
      return;
    }
    const editor = vscode.window.activeTextEditor;
    const range = new vscode.Range(
      editor.selection.start,
      editor.selection.end,
    );
    // get editor current line
    const currentLine = editor.document.lineAt(range.start.line);

    this.inset = vscode.window.createWebviewTextEditorInset(
      vscode.window.activeTextEditor,
      currentLine.range.start.line - 1,
      this.lineHeight,
      // { localResourceRoots: [ rootUrl ] }
    );
    
    this.inset.onDidDispose(() => {
      console.log('WEBVIEW disposed...');
      this.inset = undefined;
    });

    this.inset.webview.html = this.getWebviewContent(
      this.extensionContext,
      this.inset,
      this.ide,
      this.configHandler,
      this.verticalDiffManager,
    );
    // The code you place here will be executed every time your command is executed
  }

  public disposeInline(): void {
    if (this.inset) {
      this.inset.dispose();
    }
  }

  getWebviewContent(
    context: vscode.ExtensionContext | undefined,
    inlineView:
      | vscode.WebviewPanel
      | vscode.WebviewView
      | vscode.WebviewEditorInset,
    ide: IDE,
    configHandler: ConfigHandler,
    verticalDiffManager: VerticalPerLineDiffManager,
    page: string | undefined = undefined,
    edits: FileEdit[] | undefined = undefined,
    isFullScreen: boolean = false,
  ): string {
    let extensionUri = getExtensionUri();
    let scriptUri: string;
    let styleMainUri: string;
    let vscMediaUrl: string = inlineView.webview
      .asWebviewUri(vscode.Uri.joinPath(extensionUri, 'gui'))
      .toString();

    const inDevelopmentMode =
      context?.extensionMode === vscode.ExtensionMode.Development;
    if (!inDevelopmentMode) {
      scriptUri = inlineView.webview
        .asWebviewUri(
          vscode.Uri.joinPath(extensionUri, 'gui/editorInset/assets/index.js'),
        )
        .toString();
      styleMainUri = inlineView.webview
        .asWebviewUri(
          vscode.Uri.joinPath(extensionUri, 'gui/editorInset/assets/index.css'),
        )
        .toString();
    } else {
      scriptUri = 'http://localhost:5173/src/editorInset/main.tsx';
      styleMainUri = 'http://localhost:5173/src/index.css';
    }

    inlineView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(extensionUri, 'gui'),
        vscode.Uri.joinPath(extensionUri, 'assets'),
      ],
      enableCommandUris: true,
      portMapping: [
        {
          webviewPort: 65433,
          extensionHostPort: 65433,
        },
      ],
    };

    const nonce = getNonce();

    const currentTheme = getTheme();
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('workbench.colorTheme')) {
        // Send new theme to GUI to update embedded Monaco themes
        this.webviewProtocol?.request('setTheme', { theme: getTheme() });
      }
    });

    this.webviewProtocol.webview = inlineView.webview;

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script>const vscode = acquireVsCodeApi();</script>
        <link href="${styleMainUri}" rel="stylesheet">
        <title>Editor Inset</title>
      </head>
      <body>
        <div id="root"></div>

        ${
          inDevelopmentMode
            ? `<script type="module">
          import RefreshRuntime from "http://localhost:5173/@react-refresh"
          RefreshRuntime.injectIntoGlobalHook(window)
          window.$RefreshReg$ = () => {}
          window.$RefreshSig$ = () => (type) => type
          window.__vite_plugin_react_preamble_installed__ = true
          </script>`
            : ''
        }

        <script type="module" nonce="${nonce}" src="${scriptUri}"></script>

        <script>localStorage.setItem("ide", "vscode")</script>
        <script>localStorage.setItem("extensionVersion", '"${getExtensionVersion()}"')</script>
        <script>window.windowId = "${this.windowId}"</script>
        <script>window.vscMachineId = "${getUniqueId()}"</script>
        <script>window.vscMediaUrl = "${vscMediaUrl}"</script>
        <script>window.ide = "vscode"</script>
        <script>window.fullColorTheme = ${JSON.stringify(currentTheme)}</script>
        <script>window.colorThemeName = "dark-plus"</script>
        <script>window.workspacePaths = ${JSON.stringify(
          vscode.workspace.workspaceFolders?.map(
            (folder) => folder.uri.fsPath,
          ) || [],
        )}</script>
        <script>window.isFullScreen = ${isFullScreen}</script>

        ${
          edits
            ? `<script>window.edits = ${JSON.stringify(edits)}</script>`
            : ''
        }
        ${page ? `<script>window.location.pathname = "${page}"</script>` : ''}
      </body>
    </html>`;
  }
}
