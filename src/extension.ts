import { join } from 'path';
import { TextDecoder, TextEncoder } from 'util';
import * as vscode from 'vscode';
import { Worker } from "worker_threads";
import { wrap, Remote } from "comlink";
import nodeEndpoint from "./ep";

export function activate(context: vscode.ExtensionContext) {
  console.log(vscode.workspace.getConfiguration())
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

let instances = new WeakMap<vscode.NotebookDocument, Instance>();

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
    if (!instances.has(notebook)) {
      instances.set(notebook, new Instance())
    }

    for (let cell of cells) {
      await this._doExecution(cell, notebook);
    }
  }

  private async _doExecution(cell: vscode.NotebookCell, notebook: vscode.NotebookDocument): Promise<void> {
    const execution = this._controller.createNotebookCellExecution(cell);
    execution.executionOrder = ++this._executionOrder;
    execution.start(Date.now()); // Keep track of elapsed time to execute cell.

    const instance = instances.get(cell.notebook)!;

    try {
      const result = await instance.run(cell.document.getText());
      if (result.type === 'result') {
        let data = result.data.slice(1)
  
        if (data.length === 1) data = data[0]
  
        execution.replaceOutput([
          new vscode.NotebookCellOutput([
            vscode.NotebookCellOutputItem.json(data)
          ])
        ])
      }
  
      if (result.type === 'error') {
        execution.replaceOutput([
          new vscode.NotebookCellOutput([
            vscode.NotebookCellOutputItem.error(result.err)
          ])
        ])
      }
    } catch (ex: any) {
      vscode.window.showErrorMessage('This was a big error! The DB was reset!')

      execution.replaceOutput([
        new vscode.NotebookCellOutput([
          vscode.NotebookCellOutputItem.error(ex)
        ])
      ])

      instances.set(notebook, new Instance())
    }

   

    execution.end(true, Date.now());
  }

  dispose() {
    instances = new WeakMap();
  }
}


class Instance {
  private _worker!: Worker;
  private _api!: Remote<{ runSql(sql: string): any }>;

  constructor() {
    this.init();
  }

  init() {
    if (this._worker) {
      this._worker.terminate();
    }
    this._worker = new Worker(join(__dirname, './worker'));
    this._api = wrap(nodeEndpoint(this._worker));
    this._worker.on('error', (err) =>  this.currentReject(err))
    this._worker.on('online', console.log)
    this._worker.on('exit', console.log)
    this._worker.on('message', console.log)
    // this._worker.on('messageerror', console.log)

  }

  currentReject: (err: any) => void = () => {}

  run(sql: string): Promise<any> {
    return new Promise(async (res, rej) => {
      this.currentReject = rej
      const r = await this._api.runSql(sql)
      res(r)
    })
  }
}
