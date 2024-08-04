import { getTsConfigPath, migrate } from "core/util/paths";
import { Telemetry } from "core/util/posthog";
import path from "path";
import * as vscode from "vscode";
import { VsCodeExtension } from "../extension/vscodeExtension";
import registerQuickFixProvider from "../lang-server/codeActions";
import { getExtensionVersion } from "../util/util";
import { getExtensionUri } from "../util/vscode";
import { setupInlineTips } from "./inlineTips";

export async function activateExtension(context: vscode.ExtensionContext) {
  // Add necessary files
  getTsConfigPath();

  // Register commands and providers
  registerQuickFixProvider();
  setupInlineTips(context);

  const vscodeExtension = new VsCodeExtension(context);

  let inset: vscode.WebviewEditorInset;
	const disposable = vscode.commands.registerCommand('pearai.helloWorld', () => {

		if (!vscode.window.activeTextEditor) {
				return;
		}

		inset = vscode.window.createWebviewTextEditorInset(
				vscode.window.activeTextEditor, 5, 4,
				// { localResourceRoots: [ rootUrl ] }
				);
		inset.onDidDispose(() => {
				console.log('WEBVIEW disposed...');
		});
		inset.webview.html = getHtml();
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World!');
	});

  context.subscriptions.push(disposable);

  migrate("showWelcome_1", () => {
    // move pearai extension to auxiliary bar (we want secondary side bar to be default loaction for extension)
    vscode.commands.executeCommand('workbench.action.movePearExtensionToAuxBar');

    vscode.commands.executeCommand(
      "markdown.showPreview",
      vscode.Uri.file(
        path.join(getExtensionUri().fsPath, "media", "welcome.md"),
      ),
    );
    vscode.commands.executeCommand("pearai.continueGUIView.focus");
  });

  // Load PearAI configuration
  if (!context.globalState.get("hasBeenInstalled")) {
    context.globalState.update("hasBeenInstalled", true);
    Telemetry.capture("install", {
      extensionVersion: getExtensionVersion(),
    });
  }
}

function getHtml() {
	// return `<div style="display:flex; height:20px; border: solid 2px; padding: 14px;"><input type="text" placeholder="enter your prompt"></input><button>submit</button></div>`;
	return `<div style="display:flex; margin-top:10px; align-items:center; min-width: 400px; height:50px; border: solid 1px #ccc; padding: 10px; border-radius: 5px;">
    <input type="text" placeholder="Enter your prompt" style="flex-grow:1; margin-right:10px; padding:8px; border: 1px solid #ccc; border-radius: 4px;">
    <button style="padding: 8px 16px; border: none; background-color: #007bff; color: white; border-radius: 40px; cursor: pointer;">Submit</button>
</div>`;
}
