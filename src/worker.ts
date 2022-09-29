import { parentPort } from "worker_threads";
import { expose } from "comlink";
import nodeEndpoint from "./comlink/node-adapter";

// @ts-expect-error has no types
import * as DB from "mathe42.surrealdb.wasm";


let instance: {sql(sql:string): Promise<any>}
const ready = (async () => {
  const Sureal = await DB;

  instance = new Sureal('memory');
})()

export const api = {
  async runSql(sql: string) {
    sql = `
      USE NS default DB default;
      ${sql}
    `
    await ready
    try {
      return {
        type: 'result',
        data: await instance.sql(sql)
      };
    } catch(ex) {
      return {
        type: 'error',
        err: ex
      }
    }
    
  }
};

expose(api, nodeEndpoint(parentPort!));

console.log('exposed');
