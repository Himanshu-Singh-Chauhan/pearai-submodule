import { RecentlyEditedRange } from "../autocomplete/recentlyEdited.js";
import { RangeInFileWithContents } from "../commands/util.js";
import {
  BrowserSerializedContinueConfig,
  ChatMessage,
  ContextItemWithId,
  ContextSubmenuItem,
  ContinueRcJson,
  DiffLine,
  IndexTag,
  IndexingProgressUpdate,
  LLMFullCompletionOptions,
  MessageContent,
  PersistedSessionInfo,
  Position,
  Problem,
  Range,
  RangeInFile,
  SerializedContinueConfig,
  SessionInfo,
  Thread,
} from "../index.js";

// import { AutocompleteInput, IdeSettings, Protocol } from "../protocol.js";

// import { RangeInFileWithContents } from "./commands/util.js";
// import { RecentlyEditedRange } from "./autocomplete/recentlyEdited.js";


export interface IdeSettings {
  remoteConfigServerUrl: string | undefined;
  remoteConfigSyncPeriod: number;
  userToken: string;
}
export interface AutocompleteInput {
  completionId: string;
  filepath: string;
  pos: Position;
  recentlyEditedFiles: RangeInFileWithContents[];
  recentlyEditedRanges: RecentlyEditedRange[];
  clipboardText: string;
  // Used for notebook files
  manuallyPassFileContents?: string;
  // Used for VS Code git commit input box
  manuallyPassPrefix?: string;
  selectedCompletionInfo?: {
    text: string;
    range: Range;
  };
  injectDetails?: string;
}

export type ProtocolGeneratorType<T> = AsyncGenerator<{
  done?: boolean;
  content: T;
}>;

export interface ListHistoryOptions {
  offset?: number;
  limit?: number;
}

export type Protocol = {
  // New
  "update/modelChange": [string, void];
  // Special
  ping: [string, string];
  abort: [undefined, void];

  // History
  "history/list": [ListHistoryOptions, SessionInfo[]];
  "history/delete": [{ id: string }, void];
  "history/load": [{ id: string }, PersistedSessionInfo];
  "history/save": [PersistedSessionInfo, void];
  "devdata/log": [{ tableName: string; data: any }, void];
  "config/addOpenAiKey": [string, void];
  "config/addModel": [
    { model: SerializedContinueConfig["models"][number] },
    void,
  ];
  "config/ideSettingsUpdate": [IdeSettings, void];
  "config/getBrowserSerialized": [
    undefined,
    Promise<BrowserSerializedContinueConfig>,
  ];
  "config/deleteModel": [{ title: string }, void];
  "config/reload": [undefined, Promise<BrowserSerializedContinueConfig>];
  "context/getContextItems": [
    {
      name: string;
      query: string;
      fullInput: string;
      selectedCode: RangeInFile[];
    },
    Promise<ContextItemWithId[]>,
  ];
  "context/loadSubmenuItems": [
    { title: string },
    Promise<ContextSubmenuItem[]>,
  ];
  "context/addDocs": [{ title: string; url: string }, void];
  "autocomplete/complete": [AutocompleteInput, Promise<string[]>];
  "autocomplete/cancel": [undefined, void];
  "autocomplete/accept": [{ completionId: string }, void];
  "command/run": [
    {
      input: string;
      history: ChatMessage[];
      modelTitle: string;
      slashCommandName: string;
      contextItems: ContextItemWithId[];
      params: any;
      historyIndex: number;
      selectedCode: RangeInFile[];
    },
    ProtocolGeneratorType<string>,
  ];
  "llm/complete": [
    {
      prompt: string;
      completionOptions: LLMFullCompletionOptions;
      title: string;
    },
    string,
  ];
  "llm/listModels": [{ title: string }, string[] | undefined];
  "llm/streamComplete": [
    {
      prompt: string;
      completionOptions: LLMFullCompletionOptions;
      title: string;
    },
    ProtocolGeneratorType<string>,
  ];
  "llm/streamChat": [
    {
      messages: ChatMessage[];
      completionOptions: LLMFullCompletionOptions;
      title: string;
    },
    ProtocolGeneratorType<MessageContent>,
  ];
  streamDiffLines: [
    {
      prefix: string;
      highlighted: string;
      suffix: string;
      input: string;
      language: string | undefined;
      modelTitle: string | undefined;
    },
    ProtocolGeneratorType<DiffLine>,
  ];
};


export type IdeProtocol = {
  listWorkspaceContents: [undefined, string[]];
  getWorkspaceDirs: [undefined, string[]];
  listFolders: [undefined, string[]];
  writeFile: [{ path: string; contents: string }, void];
  showVirtualFile: [{ name: string; content: string }, void];
  getContinueDir: [undefined, string];
  openFile: [{ path: string }, void];
  runCommand: [{ command: string }, void];
  getSearchResults: [{ query: string }, string];
  subprocess: [{ command: string }, [string, string]];
  saveFile: [{ filepath: string }, void];
  readFile: [{ filepath: string }, string];
  showDiff: [
    { filepath: string; newContents: string; stepIndex: number },
    void,
  ];
  diffLine: [
    {
      diffLine: DiffLine;
      filepath: string;
      startLine: number;
      endLine: number;
    },
    void,
  ];
  getProblems: [{ filepath: string }, Problem[]];
  getBranch: [{ dir: string }, string];
  getOpenFiles: [undefined, string[]];
  getCurrentFile: [undefined, string | undefined];
  getPinnedFiles: [undefined, string[]];
  showLines: [{ filepath: string; startLine: number; endLine: number }, void];
  readRangeInFile: [{ filepath: string; range: Range }, string];
  getDiff: [undefined, string];
  getWorkspaceConfigs: [undefined, ContinueRcJson[]];
  getTerminalContents: [undefined, string];
  getDebugLocals: [{ threadIndex: Number }, string];
  getTopLevelCallStackSources: [
    { threadIndex: number; stackDepth: number },
    string[],
  ];
  getAvailableThreads: [undefined, Thread[]];
  isTelemetryEnabled: [undefined, boolean];
  getUniqueId: [undefined, string];
  getTags: [string, IndexTag[]];
};

export type WebviewProtocol = Protocol &
  IdeProtocol & {
    onLoad: [
      undefined,
      {
        windowId: string;
        serverUrl: string;
        workspacePaths: string[];
        vscMachineId: string;
        vscMediaUrl: string;
      },
    ];

    errorPopup: [{ message: string }, void];
    "index/setPaused": [boolean, void];
    "index/forceReIndex": [undefined, void];
    openUrl: [string, void];
    applyToCurrentFile: [{ text: string }, void];
    showTutorial: [undefined, void];
    showFile: [{ filepath: string }, void];
    openConfigJson: [undefined, void];

    toggleDevTools: [undefined, void];
    reloadWindow: [undefined, void];
    focusEditor: [undefined, void];
    toggleFullScreen: [undefined, void];
    bigChat: [undefined, void];
    lastChat: [undefined, void];
    closeChat: [undefined, void];
    "stats/getTokensPerDay": [
      undefined,
      { day: string; promptTokens: number; generatedTokens: number }[],
    ];
    "stats/getTokensPerModel": [
      undefined,
      { model: string; promptTokens: number; generatedTokens: number }[],
    ];
    insertAtCursor: [{ text: string }, void];
    copyText: [{ text: string }, void];
    "jetbrains/editorInsetHeight": [{ height: number }, void];
    completeOnboarding: [
      {
        mode:
          | "local"
          | "optimized"
          | "custom"
          | "localExistingUser"
          | "optimizedExistingUser"
          | "localAfterFreeTrial";
      },
      void,
    ];
  };

export type ReverseWebviewProtocol = {
  setInactive: [undefined, void];
  configUpdate: [undefined, void];
  submitMessage: [{ message: any }, void]; // any -> JSONContent from TipTap
  addContextItem: [
    {
      historyIndex: number;
      item: ContextItemWithId;
    },
    void,
  ];
  updateSubmenuItems: [
    { provider: string; submenuItems: ContextSubmenuItem[] },
    void,
  ];
  getDefaultModelTitle: [undefined, string];
  newSessionWithPrompt: [{ prompt: string }, void];
  userInput: [{ input: string }, void];
  focusContinueInput: [undefined, void];
  focusContinueInputWithoutClear: [undefined, void];
  focusContinueInputWithNewSession: [undefined, void];
  highlightedCode: [{ rangeInFileWithContents: RangeInFileWithContents }, void];
  addModel: [undefined, void];
  openSettings: [undefined, void];
  viewHistory: [undefined, void];
  loadMostRecentChat: [undefined, void];
  indexProgress: [IndexingProgressUpdate, void];
  newSession: [undefined, void];
  refreshSubmenuItems: [undefined, void];
  setTheme: [{ theme: any }, void];
  setColors: [{ [key: string]: string }, void];
  "jetbrains/editorInsetRefresh": [undefined, void];
  addApiKey: [undefined, void];
  setupLocalModel: [undefined, void];
};
