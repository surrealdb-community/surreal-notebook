import { join } from 'path';
import { TextDecoder, TextEncoder } from 'util';
import * as vscode from 'vscode';
import { Worker } from "worker_threads";
import { wrap, Remote } from "comlink";
import nodeEndpoint from "./ep";

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

    try {
      const data = JSON.parse(contents);

      let raw: RawNotebookCell[]
      let meta: any = {}

      if (Array.isArray(data)) {
        raw = data
      } else {
        const version = data.version

        if (version == 1) {
          raw = data.cells
          meta = data.meta
        } else {
          throw new Error("File is in wrong version");
        }
      }

      const cells = raw.map(
        item => new vscode.NotebookCellData(item.kind, item.value, item.language)
      );

      const nb = new vscode.NotebookData(cells)
      nb.metadata = meta

      return nb
    } catch {
      return new vscode.NotebookData([])
    }
  }

  async serializeNotebook(
    data: vscode.NotebookData,
    _token: vscode.CancellationToken
  ): Promise<Uint8Array> {
    let cells: RawNotebookCell[] = [];

    for (const cell of data.cells) {
      cells.push({
        kind: cell.kind,
        language: cell.languageId,
        value: cell.value
      });
    }

    return new TextEncoder().encode(JSON.stringify({ cells, version: 1, meta: data.metadata }));
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
      await this._doExecution(cell);
    }
  }

  private async _doExecution(cell: vscode.NotebookCell): Promise<void> {
    const execution = this._controller.createNotebookCellExecution(cell);
    execution.executionOrder = ++this._executionOrder;
    execution.start(Date.now()); // Keep track of elapsed time to execute cell.

    const instance = instances.get(cell.notebook)!;

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
  }

  async run(sql: string): Promise<any> {
    return this._api.runSql(sql)
  }
}
