import { join } from 'path';
import { TextDecoder, TextEncoder } from 'util';
import * as vscode from 'vscode';
import { Worker } from "worker_threads";
import { wrap, Remote } from "comlink";
import nodeEndpoint from "./ep";
import { ChildProcess, exec } from "child_process";
import Surreal from "surrealdb.js";

const c = vscode.workspace.getConfiguration('surreal.notebook')
let execPath = c.get('exec')
let wasm = c.get('use-wasm')
let shared = c.get('shared-instance')


export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.workspace.registerNotebookSerializer('surreal.nb', new SQLSerializer())
  );
  context.subscriptions.push(new SQLController());

  vscode.workspace.onDidChangeConfiguration((e) => {
    if(e.affectsConfiguration('surreal.notebook')) {
      // TODO: restart instances!
      vscode.window.showInformationMessage('Config changed - you might have to restart vscode!')
    }
  })
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
let sharedInstance: Instance

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
    if(shared) {
      if(!sharedInstance) {
        if(wasm) {
          sharedInstance = new WasmInstance()
        } else {
          sharedInstance = new FullInstance()
        }  
      }
    } else if (!instances.has(notebook)) {
      if(wasm) {
        instances.set(notebook, new WasmInstance())
      } else {
        instances.set(notebook, new FullInstance())
      }
    }

    for (let cell of cells) {
      await this._doExecution(cell, notebook);
    }
  }

  private async _doExecution(cell: vscode.NotebookCell, notebook: vscode.NotebookDocument): Promise<void> {
    const execution = this._controller.createNotebookCellExecution(cell);
    execution.executionOrder = ++this._executionOrder;
    execution.start(Date.now()); // Keep track of elapsed time to execute cell.

    const instance = shared ? sharedInstance : instances.get(cell.notebook)!;

    try {
      const result = await instance.run(cell.document.getText());

      if(!wasm) {
        execution.replaceOutput([
          new vscode.NotebookCellOutput([
            vscode.NotebookCellOutputItem.json(result)
          ])
        ])
      }

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
      execution.replaceOutput([
        new vscode.NotebookCellOutput([
          vscode.NotebookCellOutputItem.error(ex)
        ])
      ])

      if(wasm) {
        vscode.window.showErrorMessage('This was a big error! The DB was reset!')
        if(shared) {
          sharedInstance = new WasmInstance()
        } else {
          instances.set(notebook, new WasmInstance())
        }
      }
    }

    execution.end(true, Date.now());
  }

  dispose() {
    instances = new WeakMap();
  }
}

interface Instance {
  run(sql: string): Promise<any>
}

class WasmInstance implements Instance {
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


class FullInstance implements Instance {
  port = 8000 + Math.floor(Math.random() * 1000)
  process!: ChildProcess
  db!: Surreal
  ready: Promise<void>

  constructor() {
    this.ready = this.init()
  }

  async init() {
    this.process = exec(execPath + ' start --log trace --user root --pass root memory --bind=0.0.0.0:' + this.port)
    this.process.addListener('close', () => {
      this.init()
    })
    this.db = new Surreal('http://127.0.0.1:' + this.port + '/rpc')
    await this.db.signin({
      user: 'root',
      pass: 'root'
    })
    await this.db.use('default', 'default')
  }
  async run(sql: string) {
    await this.ready
    return this.db.query(sql)
  }
}
