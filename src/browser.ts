import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.workspace.registerNotebookSerializer('surreal.nb', new SQLSerializer())
  );
  context.subscriptions.push(new SQLController());
}


interface RawNotebookCell {
  language: string;
  value: string;
  kind: vscode.NotebookCellKind;
}

class SQLSerializer implements vscode.NotebookSerializer {
  async deserializeNotebook(
    content: Uint8Array,
    _token: vscode.CancellationToken
  ): Promise<vscode.NotebookData> {
    var contents = new TextDecoder().decode(content);

    let raw: RawNotebookCell[];
    try {
      raw = <RawNotebookCell[]>JSON.parse(contents);
    } catch {
      raw = [];
    }

    const cells = raw.map(
      item => new vscode.NotebookCellData(item.kind, item.value, item.language)
    );

    return new vscode.NotebookData(cells);
  }

  async serializeNotebook(
    data: vscode.NotebookData,
    _token: vscode.CancellationToken
  ): Promise<Uint8Array> {
    let contents: RawNotebookCell[] = [];

    for (const cell of data.cells) {
      contents.push({
        kind: cell.kind,
        language: cell.languageId,
        value: cell.value
      });
    }

    return new TextEncoder().encode(JSON.stringify(contents));
  }
}



class SQLController {
  readonly controllerId = 'surreal.nb.controller';
  readonly notebookType = 'surreal.nb';
  readonly label = 'SurrealQL Notebook';
  readonly supportedLanguages = ['surrealql'];
  private _executionOrder = 0;

  private readonly _controller: vscode.NotebookController;

  constructor() {
    this._controller = vscode.notebooks.createNotebookController(
      this.controllerId,
      this.notebookType,
      this.label
    );

    this._controller.supportedLanguages = this.supportedLanguages;
    this._controller.supportsExecutionOrder = true;
    this._controller.executeHandler = this._execute.bind(this);
  }

  private async _execute(
    cells: vscode.NotebookCell[],
    notebook: vscode.NotebookDocument,
    _controller: vscode.NotebookController
  ) {
    for (let cell of cells) {
      await this._doExecution(cell, notebook);
    }
  }

  private async _doExecution(cell: vscode.NotebookCell, notebook: vscode.NotebookDocument): Promise<void> {
    const execution = this._controller.createNotebookCellExecution(cell);
    execution.executionOrder = ++this._executionOrder;
    execution.start(Date.now()); // Keep track of elapsed time to execute cell.

    execution.replaceOutput([
      new vscode.NotebookCellOutput([
        vscode.NotebookCellOutputItem.error(new Error("In Browser-env the notebook is currently not runable."))
      ])
    ])

    execution.end(true, Date.now());
  }

  dispose() {}
}
