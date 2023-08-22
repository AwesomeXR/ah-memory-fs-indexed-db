import { BaseAdapter, IBlockRef } from 'ah-memory-fs';
import { getInternalRandomString } from './getInternalRandomString';

export class IndexedDBAdapter extends BaseAdapter {
  static async attach(dbName?: string) {
    const d = new IndexedDBAdapter(dbName);
    await d.setup();
    return d;
  }

  private db!: IDBDatabase;

  constructor(private dbName = getInternalRandomString()) {
    super();
  }

  async setup(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);

      req.onsuccess = ev => {
        this.db = (ev.target as any).result;
        resolve();
      };

      req.onerror = ev => reject((ev as any).currentTarget.error.message);

      req.onupgradeneeded = ev => {
        this.db = (ev.target as any).result;

        // 创建表
        if (!this.db.objectStoreNames.contains('store')) {
          const st = this.db.createObjectStore('store', { keyPath: 'id' });
          st.createIndex('id', 'id', { unique: true }); // 创建 id 索引
        }
      };
    });
  }

  async dispose(): Promise<void> {
    await new Promise<any>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(this.dbName);
      req.onsuccess = resolve;
      req.onerror = ev => reject((ev as any).target.error);
    });
  }

  async read(id: string): Promise<ArrayBuffer> {
    const data = await new Promise<ArrayBuffer | undefined>((resolve, reject) => {
      const trans = this.db.transaction('store', 'readonly', { durability: 'relaxed' });
      const st = trans.objectStore('store');
      const req = st.get(id);

      req.onsuccess = () => resolve(req.result?.data);
      req.onerror = ev => reject((ev as any).target.error);
    });

    if (!data) throw new Error('Not found: ' + id);

    return data;
  }

  async write(id: string, data: ArrayBuffer): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const trans = this.db.transaction('store', 'readwrite', { durability: 'relaxed' });
      const st = trans.objectStore('store');

      const addReq = st.put({ id, data });

      addReq.onsuccess = () => resolve();
      addReq.onerror = ev => reject((ev as any).target.error);
    });
  }

  async del(id: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const trans = this.db.transaction('store', 'readwrite', { durability: 'relaxed' });
      const st = trans.objectStore('store');

      const req = st.delete(id);

      req.onsuccess = () => resolve();
      req.onerror = ev => reject((ev as any).target.error);

      trans.commit();
    });
  }

  async getBlockRefs(): Promise<IBlockRef[]> {
    return new Promise<IBlockRef[]>((resolve, reject) => {
      const trans = this.db.transaction('store', 'readonly', { durability: 'relaxed' });
      const st = trans.objectStore('store');
      const req = st.getAll();

      req.onsuccess = () => resolve(req.result.map(d => ({ key: d.id, size: d.data.size })));
      req.onerror = ev => reject((ev as any).target.error);
    });
  }
}
