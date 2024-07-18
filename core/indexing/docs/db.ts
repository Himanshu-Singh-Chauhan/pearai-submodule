import { Database, open } from "sqlite";
import sqlite3 from "sqlite3";
import { Chunk } from "../../index.js";
import { getDocsSqlitePath, getLanceDbPath } from "../../util/paths.js";

// import { downloadPreIndexedDocs } from "./preIndexed.js";
import { default as configs } from "./preIndexedDocs.js"


const request = require("request");
const DOCS_TABLE_NAME = "docs";



export async function downloadFromS3(
  bucket: string,
  fileName: string,
  region: string,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let data = "";

    const download = request({
      url: `https://${bucket}.s3.${region}.amazonaws.com/${fileName}`,
    });
    download.on("response", (response: any) => {
      if (response.statusCode !== 200) {
        reject(new Error("No body returned when downloading from S3 bucket"));
      }
    });

    download.on("error", (err: any) => {
      reject(err);
    });

    download.on("data", (chunk: any) => {
      data += chunk;
    });

    download.on("end", () => {
      resolve(data);
    });
  });
}
;


export interface SiteIndexingResults {
  chunks: (Chunk & { embedding: number[] })[];
  url: string;
  title: string;
}

export async function downloadPreIndexedDocs(
  embeddingsProviderId: string,
  title: string,
) {
  const data = await downloadFromS3(
    "continue-indexed-docs",
    `${embeddingsProviderId}/${title}`,
    "us-west-1",
  );
  const results = JSON.parse(data) as SiteIndexingResults;
  await addDocs(
    results.title,
    new URL(results.url),
    results.chunks,
    results.chunks.map((c) => c.embedding),
  );
}


// Purposefully lowercase because lancedb converts
interface LanceDbDocsRow {
  title: string;
  baseurl: string;
  // Chunk
  content: string;
  path: string;
  startline: number;
  endline: number;
  vector: number[];
  [key: string]: any;
}

let dbDocs: Database;

async function getDBDocs() {
  if (!dbDocs) {
    dbDocs = await open({
      filename: getDocsSqlitePath(),
      driver: sqlite3.Database,
    });

    dbDocs.exec(`CREATE TABLE IF NOT EXISTS docs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title STRING NOT NULL,
        baseUrl STRING NOT NULL UNIQUE
    )`);
  }

  return dbDocs;
}

export async function retrieveDocs(
  baseUrl: string,
  vector: number[],
  nRetrieve: number,
  embeddingsProviderId: string,
  nested: boolean = false,
): Promise<Chunk[]> {
  const lancedb = await import("vectordb");
  const db = await getDBDocs();
  const lance = await lancedb.connect(getLanceDbPath());

  const downloadDocs = async () => {
    const config = configs.find((config) => config.startUrl === baseUrl);
    if (config) {
      await downloadPreIndexedDocs(embeddingsProviderId, config.title);
      return await retrieveDocs(
        baseUrl,
        vector,
        nRetrieve,
        embeddingsProviderId,
        true,
      );
    }
    return undefined;
  };

  const tableNames = await lance.tableNames();
  if (!tableNames.includes(DOCS_TABLE_NAME)) {
    const downloaded = await downloadDocs();
    if (downloaded) {return downloaded;}
  }

  const table = await lance.openTable(DOCS_TABLE_NAME);
  let docs: LanceDbDocsRow[] = await table
    .search(vector)
    .limit(nRetrieve)
    .where(`baseurl = '${baseUrl}'`)
    .execute();

  docs = docs.filter((doc) => doc.baseurl === baseUrl);

  if ((!docs || docs.length === 0) && !nested) {
    const downloaded = await downloadDocs();
    if (downloaded) {return downloaded;}
  }

  return docs.map((doc) => ({
    digest: doc.path,
    filepath: doc.path,
    startLine: doc.startline,
    endLine: doc.endline,
    index: 0,
    content: doc.content,
    otherMetadata: {
      title: doc.title,
    },
  }));
}

export async function addDocs(
  title: string,
  baseUrl: URL,
  chunks: Chunk[],
  embeddings: number[][],
) {
  const data: LanceDbDocsRow[] = chunks.map((chunk, i) => ({
    title: chunk.otherMetadata?.title || title,
    baseurl: baseUrl.toString(),
    content: chunk.content,
    path: chunk.filepath,
    startline: chunk.startLine,
    endline: chunk.endLine,
    vector: embeddings[i],
  }));

  const lancedb = await import("vectordb");
  const lance = await lancedb.connect(getLanceDbPath());
  const tableNames = await lance.tableNames();
  if (!tableNames.includes(DOCS_TABLE_NAME)) {
    await lance.createTable(DOCS_TABLE_NAME, data);
  } else {
    const table = await lance.openTable(DOCS_TABLE_NAME);
    await table.add(data);
  }

  // Only after add it to SQLite
  const db = await getDBDocs();
  await db.run(
    "INSERT INTO docs (title, baseUrl) VALUES (?, ?)",
    title,
    baseUrl.toString(),
  );
}

export async function listDocs(): Promise<
  { title: string; baseUrl: string }[]
> {
  const db = await getDBDocs();
  const docs = db.all("SELECT title, baseUrl FROM docs");
  return docs;
}

export async function hasDoc(baseUrl: string) {
  const db = await getDBDocs();
  const doc = await db.get("SELECT title FROM docs WHERE baseUrl =?", baseUrl);
  return !!doc;
}
