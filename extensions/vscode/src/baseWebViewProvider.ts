
import { FileEdit, IDE } from 'core';
import { ConfigHandler } from 'core/config/handler';
import * as vscode from 'vscode';
import { VerticalPerLineDiffManager } from './diff/verticalPerLine/manager';
import { VsCodeWebviewProtocol } from './webviewProtocol';


export abstract class BaseWebviewViewProvider implements vscode.WebviewViewProvider {
  public webviewProtocol: VsCodeWebviewProtocol;
  protected _webview?: vscode.Webview;
  public static readonly viewType: string;


  constructor(
    protected readonly configHandler: ConfigHandler,
    protected readonly ide: IDE,
    protected readonly windowId: string,
    protected readonly extensionContext: vscode.ExtensionContext,
    protected readonly verticalDiffManager: VerticalPerLineDiffManager
  ) {
    this.webviewProtocol = new VsCodeWebviewProtocol(
      ide,
      configHandler,
      verticalDiffManager,
    );
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void | Thenable<void> {
    this._webview = webviewView.webview;
    webviewView.webview.html = this.getWebviewContent(
      this.extensionContext,
      webviewView,
      this.ide,
      this.configHandler,
      this.verticalDiffManager,
    );
  }

  get webview() {
    return this._webview;
  }

  public resetWebviewProtocolWebview(): void {
    if (this._webview) {
      this.webviewProtocol.webview = this._webview;
    } else {
      console.warn('no webview found during reset');
    }
  }

  sendMainUserInput(input: string) {
    this.webview?.postMessage({
      type: 'userInput',
      input,
    });
  }

  protected abstract getWebviewContent(
    context: vscode.ExtensionContext | undefined,
    inlineView: vscode.WebviewPanel | vscode.WebviewView | vscode.WebviewEditorInset,
    ide: IDE,
    configHandler: ConfigHandler,
    verticalDiffManager: VerticalPerLineDiffManager,
    page?: string,
    edits?: FileEdit[],
    isFullScreen?: boolean,
  ): string;
}
